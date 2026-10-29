// The scene stack and the transitions between scenes — the continuous-camera surface's own state
// machine, adapted from `apps/explorer/__scratch/pixijs-explorer-spike/scenes.ts` (US036 plan Step
// 3R.1 Step 2) to load real `ExplorerScene`s through a `SceneSource` (`../scene/source.ts`, US070) and lay them out with
// `sunflowerLayout`/`radialFocusLayout` (`../scene/layout.ts`) instead of the spike's synthetic
// `data.ts`/its own `layout.ts`.
//
// Renderer-agnostic on purpose, same as the spike: no pixi import. `applyScene` hands the caller a
// plain `RenderNode[]` to draw; nothing here knows what draws them.
//
// The two behaviours worth restating because they are the whole interaction model (unchanged from
// the spike, which tuned both against real hardware):
//
//  * Entering is footprint continuity, not a page swap. The child scene appears scaled so that
//    *all* of it fits inside the on-screen footprint the parent node occupied at the instant of
//    the swap — read from the live camera, not from a viewport fraction — so a container visibly
//    resolves into its contents rather than being replaced by them.
//  * Zoom enters and leaves on its own. Zooming a node past ~85% of the viewport's smaller
//    dimension enters it with no click; zooming back out below 70% of the scale a scene was
//    entered at leaves it. Both skip the scripted approach animation, because the user's own
//    gesture is already mid-motion and animating over the top of it reverses their input.

import { parseColour } from "../colour";
import { prefersReducedMotion } from "../motion";
import { contains, distanceToCentre, fillFraction, relativeOutline } from "../scene/geometry";
import { fixedLayout, radialFocusLayout, sunflowerLayout, sunflowerLayoutAppend, type ExplorerLayout } from "../scene/layout";
import type { SceneSource } from "../scene/source";
import type { ExplorerCluster, ExplorerEffect, ExplorerEmphasis, ExplorerItem, ExplorerNode, ExplorerScene, ExplorerShape } from "../scene/types";
import {
  boxCentre,
  cameraFillingBox,
  cameraPlacing,
  clampScale,
  fitCamera,
  lerpCamera,
  limitCamera,
  scheduleFrame,
  type CameraLimits,
  type Camera,
  type CameraRig,
  type ScreenPoint,
} from "./camera";
import {
  childAlpha,
  childBoxInParent,
  childToParentFactor,
  CHILD_CONTAIN_FRACTION,
  cloudAlpha,
  parentBoxInChild,
  PREVIEW_ARRIVAL_MS,
  PREVIEW_MIN_FILL,
  PREVIEW_PREFETCH_FILL,
  type PlainBox,
} from "./transition";

/** What the renderer draws, one per visible cluster/node. Positions are in the current scene's
 *  own local world space (the same convention `ExplorerLayout`'s boxes already use). */
export interface RenderNode {
  /** The item's id. */
  id: string;
  /** Left edge of the item's laid-out box, in its scene's world units. */
  x: number;
  /** Top edge of the item's box. */
  y: number;
  /** The box's width. Square (equal to `height`) in packed and radial scenes. */
  width: number;
  /** The box's height. */
  height: number;
  /** The larger of `width` and `height`: the box's side, when it is square.
   *  @deprecated Use `width` and `height`. */
  size: number;
  /** The item's declared shape. */
  shape: ExplorerShape;
  /** A `region`'s outline relative to this box ((0, 0) its top left, (1, 1) its bottom right), so it
   *  holds wherever the box is placed; `null` for anything else, or a region that is its whole box. */
  outline: number[][][][] | null;
  /** Where a `region`'s label goes, relative to this box as `outline` is; `null` for the middle. */
  labelAt: { x: number; y: number } | null;
  /** Whether entering it opens a scene (it has a `drillsInto` and is not the radial centre). */
  drillable: boolean;
  /** The source's own focus this node drills into (`ExplorerNode.drillsInto`), opaque here — `null`
   *  exactly when `drillable` is `false`. `unknown` so the renderer-facing types stay free of the
   *  consumer's focus type; the stack casts it back at the points it hands one to the source. */
  focus: unknown;
  /** The item's label. */
  label: string;
  /** The item's sublabel, or `null`. */
  sublabel: string | null;
  /** The item's own conventional page — `null` only for a non-navigable aggregate cluster ("Other
   *  groups"), same as `ExplorerCluster.href` itself. Carried through for a click's detail modal
   *  ("view the full page"), never used by the renderer, which draws no links of its own. */
  href: string | null;
  /** US072 (review change 1) — the item exactly as the source wrote it, `data` included: what the
   *  selection events hand back, so a consumer never maps a render node back to its own object. */
  item: ExplorerItem;
  /** The adapter's declared emphasis (US070 / A24) — the renderer's only source for a ring. */
  emphasis: ExplorerEmphasis[];
  /** The adapter's own display text, carried through unparsed for a DOM view (the detail modal)
   *  that shows prose the renderer never needs to understand. */
  rawMarks: string[];
  /** True only for a non-navigable overflow aggregate ("Other groups", "More items") — a
   *  cluster whose own `ExplorerCluster.truncated` is set. Lets the renderer draw it hollow/dimmed
   *  so it is never mistaken for a real, drillable node (plan Step 2 exit criterion). */
  aggregate: boolean;
  /** The adapter's ramp position (`ExplorerNode.ramp`), or `null` for the per-id fallback tint. */
  ramp: number | null;
  /** US071 — the item's own colour as `0xRRGGBB`, parsed once here; `null` when unset or invalid. */
  color: number | null;
  /** US071 — the effects the item asked for (`ExplorerNode.effects`). */
  effects: ExplorerEffect[];
  /** US071 — the item's canvas image, with its fit settled; `null` when none was given. */
  texture: { url: string; fit: "cover" | "contain" } | null;
  /** US071 — the custom renderer this item asks for, or `null` for its plain shape. */
  kind: string | null;
}

/** US071 — an edge whose two ends are both drawn in its scene. Positions come from the layer's
 *  own nodes at draw time, so the same edge is placed correctly as a preview, a ghost or current. */
export interface RenderEdge {
  /** The edge's id. */
  id: string;
  /** The edge's `kind`. */
  kind: string;
  /** The item it starts from. */
  sourceId: string;
  /** The item it ends at. */
  targetId: string;
}

/** One scene as the stack holds it: your scene, laid out, with its items and edges ready to draw. */
export interface StackedScene<F = unknown> {
  /** Same key shape the loader itself caches by (`"root"` or whatever `SceneSource.keyOf` returns) — reused here so
   *  a scene's identity is never computed two different ways. */
  key: string;
  /** The focus it was loaded for. */
  focus: F | null;
  /** The scene's heading. */
  heading: string;
  /** Where each item sits, in the scene's own world units. */
  layout: ExplorerLayout;
  /** The scene as your source returned it. */
  scene: ExplorerScene<F>;
  /** Each drawn item, laid out. */
  renderNodes: RenderNode[];
  /** US071 — `scene.edges` with both ends drawn; an edge naming a missing item is left out. */
  renderEdges: RenderEdge[];
}

/** One set of nodes drawn alongside the current scene during a transition — already in the
 *  current scene's world space, each with its own opacity. */
export interface TransitionLayer {
  /** The layer's items, placed in the current scene's world. */
  nodes: readonly RenderNode[];
  /** Each item's opacity in this layer, 0 to 1. */
  alpha: (node: RenderNode) => number;
  /** Whether the layer's nodes may carry labels/marks. */
  decorated: boolean;
  /** Which of the layer's nodes can be hovered, selected and double-clicked — absent means none.
   *  It decides visibility too: the renderer points at exactly these, however faint. */
  pointable?: (node: RenderNode) => boolean;
  /** For a layer of an item's children: that item, which is entered (or, when `around`, moved
   *  into sideways) to reach them. See `SceneStack.enterThrough`. */
  via?: PreviewParent;
  /** US071 — the layer's scene's edges, drawn at the lower alpha of their two ends. */
  edges?: readonly RenderEdge[];
}

/** The item whose children a preview layer draws, and how it is reached from the current scene. */
export interface PreviewParent {
  /** Its id: an item of the current scene, or (`around`) of the scene drawn around it. */
  id: string;
  /** Whether it is a sibling drawn around the current scene rather than one of its own items. */
  around: boolean;
}

/**
 * Everything the renderer needs to draw the cross-fade between a scene and the one inside its
 * anchor — see `transition.ts` for the curves. Renderer-agnostic, same as `RenderNode`.
 */
export interface TransitionView {
  /** The children of every visible node being zoomed towards, each drawn *beneath* the current
   *  scene so they appear behind their own node's cloud. */
  under: TransitionLayer[];
  /** An opacity multiplier for the current scene's own nodes — `null` means "all 1". */
  currentAlpha: ((node: RenderNode) => number) | null;
  /** Solid items of the current scene whose children now show more than they do: the pointer
   *  passes through them to the children (`under`, pointable). */
  passThrough: ReadonlySet<string>;
  /** The parent scene just left, drawn *over* the current scene: the node entered dissolving as a
   *  haze, its siblings exactly as they were drawn before entry. */
  over: TransitionLayer | null;
  /** A preview or ghost is still mid arrival fade — the caller should keep drawing. */
  animating: boolean;
}

interface Frame<F> {
  /** The scene that was left. */
  scene: StackedScene<F>;
  /** The id of the node entered through — the cloud the ghost layer dissolves. */
  anchorId: string;
  /** Whether that node is drawn hard-edged rather than as a cloud (`cloudAlpha`'s `solid`). */
  anchorSolid: boolean;
  /** `scene`'s own previews, carried along when it was left: its other nodes keep revealing — and
   *  keep loading — their children while it's drawn around the current scene, and it gets them all
   *  back on `leave`. */
  holder: PreviewHolder<F>;
  /** When the ghost of `scene` first became drawable: `-Infinity` for a real `enter` (it was
   *  already on screen), "now" for a climb's synthetic frame (it wasn't, so it fades in). */
  ghostSince: number;
  /** The camera the user had in it, restored on the way back out. */
  camera: Camera;
  /** The box, in that scene's layout, that was entered through. */
  anchorBox: PlainBox;
  /** How much of `anchorBox` the scene inside was fitted into (`containFraction`). */
  contain: number;
  /** The scale the child scene was entered at — the reference for "zoomed back out of it". */
  entryScale: number;
}

const ENTER_FILL_FRACTION = 0.92;
/** How far a double-click zooms in on an item with no scene of its own (as `DataExplorer` does). */
const DOUBLE_TAP_ZOOM = 2.5;
const AUTO_ENTER_SIZE_FRACTION = 0.85;
const AUTO_LEAVE_SCALE_FRACTION = 0.7;
/** Step 3 — the smallest a sibling can be on screen and still be moved into sideways: the size a
 *  scene can shrink to before zooming out leaves it (85% entry × 70% leave), so a sideways move
 *  never lands in a scene that would immediately be left again. */
const LATERAL_MIN_FILL = AUTO_ENTER_SIZE_FRACTION * AUTO_LEAVE_SCALE_FRACTION;
/** D1.2 — the prefetch threshold. Was 40%; lowered so the children have usually arrived before
 *  they start fading in behind the anchor's cloud (`transition.ts`). Still a guess, not measured. */
const PREFETCH_SIZE_FRACTION = PREVIEW_PREFETCH_FILL;
/** At most this many child scenes held for preview within one scene, beyond the ones on screen:
 *  a preview whose node is on screen is never evicted, however many there are. A packed scene
 *  rarely has a dozen nodes big enough at once; a fixed layout of like-sized regions can have
 *  dozens, and evicting those on screen made their children come and go every frame. */
const PREVIEW_CACHE_LIMIT = 12;
/** At most this many previews waiting on their first page at once; the biggest on screen go first.
 *  (Later pages of a streamed scene stream on in the background and don't hold a slot.) */
const MAX_PREVIEW_LOADS = 2;
/** How long a preview whose load failed is left alone before it may be tried again. Previews are
 *  scheduled after every draw, so without this a failure (a `429` most of all) was retried on the
 *  very next frame, for as long as the node stayed on screen — hundreds of requests a minute. */
export const PREVIEW_RETRY_MS = 30_000;

/** A ghost fainter than this, with none of its children showing either, is not there to point at. */
const MIN_POINTABLE_ALPHA = 0.01;

const APPROACH_MS = 500;
const LEAVE_APPROACH_MS = 300;
const RESTORE_MS = 400;


/** Only a real (non-aggregate) cloud is soft-edged; everything else is a hard-edged shape. */
function isSolid(node: RenderNode): boolean {
  return node.shape !== "cloud" || node.aggregate;
}

/** Just the box of anything boxed: a layout box or a render node. */
function plainBox(box: PlainBox): PlainBox {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/** The larger side of an item's box: its diameter, for the round footprint that fill and "under the
 *  middle of the screen" are measured by. */
function extentOf(box: PlainBox): number {
  return Math.max(box.width, box.height);
}

/** `node` moved to `box` (another scene's world), its deprecated `size` kept in step. */
function placed(node: RenderNode, box: PlainBox): RenderNode {
  return { ...node, ...box, size: extentOf(box) };
}

/** A region's outline and label point, relative to its own box (see `RenderNode.outline`). */
function regionParts(item: ExplorerItem): Pick<RenderNode, "outline" | "labelAt"> {
  const box = item.box;
  if (item.shape !== "region" || !box || box.width <= 0 || box.height <= 0) return { outline: null, labelAt: null };
  return {
    outline: item.outline?.length ? relativeOutline(item.outline, box) : null,
    labelAt: item.labelAt ? { x: (item.labelAt.x - box.x) / box.width, y: (item.labelAt.y - box.y) / box.height } : null,
  };
}

function layoutFor(scene: ExplorerScene): ExplorerLayout {
  if (scene.layout === "fixed") return fixedLayout(scene);
  return scene.focusId ? radialFocusLayout(scene) : sunflowerLayout(scene);
}

/** A streamed scene's layout after another page: grown in place, so nothing already drawn moves. */
function layoutAppend(scene: ExplorerScene, previous: ExplorerLayout): ExplorerLayout {
  return scene.layout === "fixed" ? fixedLayout(scene) : sunflowerLayoutAppend(scene, previous);
}

/** How much of its anchor's box a child scene is fitted into: all of it when both scenes are fixed,
 *  so a child whose `bounds` is its parent item's box lands exactly on it; otherwise a margin that
 *  keeps the children inside a cloud's visible body. */
function containFraction(parent: ExplorerScene, child: ExplorerScene): number {
  return parent.layout === "fixed" && child.layout === "fixed" ? 1 : CHILD_CONTAIN_FRACTION;
}

function toRenderNodes<F>(scene: ExplorerScene<F>, layout: ExplorerLayout): RenderNode[] {
  const clustersById = new Map(scene.clusters.map((cluster) => [cluster.id, cluster]));
  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
  const out: RenderNode[] = [];
  for (const box of layout.boxes) {
    const item: ExplorerCluster<F> | ExplorerNode<F> | undefined = box.kind === "cluster" ? clustersById.get(box.id) : nodesById.get(box.id);
    if (!item) continue;
    const href = "href" in item ? item.href : null;
    const focus = item.drillsInto;
    // The scene's own focus (the entity whose neighbourhood this is) is never drillable — it is
    // the scene you are already in, not a way further down (same rule the spike's `setBuildScene`
    // used for the focused set itself).
    const drillable = focus !== null && item.id !== scene.focusId;
    out.push({
      id: item.id,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      size: extentOf(box),
      shape: item.shape,
      ...regionParts(item),
      drillable,
      focus: drillable ? focus : null,
      label: item.label,
      sublabel: item.sublabel ?? null,
      href,
      item: item as ExplorerItem,
      emphasis: item.emphasis ?? [],
      rawMarks: item.marks ?? [],
      aggregate: "truncated" in item && item.truncated != null,
      ramp: item.ramp ?? null,
      color: parseColour(item.color),
      effects: item.effects ?? [],
      texture: item.texture?.url ? { url: item.texture.url, fit: item.texture.fit === "contain" ? "contain" : "cover" } : null,
      kind: item.kind ?? null,
    });
  }
  return out;
}

function toRenderEdges(scene: ExplorerScene<unknown>, nodes: readonly RenderNode[]): RenderEdge[] {
  const drawn = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const out: RenderEdge[] = [];
  for (const edge of scene.edges) {
    if (seen.has(edge.id) || edge.sourceId === edge.targetId || !drawn.has(edge.sourceId) || !drawn.has(edge.targetId)) continue;
    seen.add(edge.id);
    out.push({ id: edge.id, kind: edge.kind, sourceId: edge.sourceId, targetId: edge.targetId });
  }
  return out;
}

/** A scene's nodes and edges for a layout — the one place both are derived, so they never disagree. */
function renderable<F>(scene: ExplorerScene<F>, layout: ExplorerLayout): { renderNodes: RenderNode[]; renderEdges: RenderEdge[] } {
  const renderNodes = toRenderNodes(scene, layout);
  return { renderNodes, renderEdges: toRenderEdges(scene, renderNodes) };
}

function toStackedScene<F>(key: string, focus: F | null, scene: ExplorerScene<F>): StackedScene<F> {
  const layout = layoutFor(scene);
  return { key, focus, heading: scene.heading, layout, scene, ...renderable(scene, layout) };
}

/** What `createSceneStack` needs. `createTestStack` assembles these for you. */
export interface SceneStackDeps<F> {
  /** The camera the stack moves as the viewer enters and leaves scenes. */
  rig: CameraRig;
  /** Where scenes come from. */
  source: SceneSource<F>;
  /** The already-resolved root of the stack — either the true root (`focus: null`) for a cold
   *  load at `/visual-explorer`, or a deep-linked focus (D1.4's "cold route-driven load" entry
   *  path). Resolving this is the caller's job (an effect awaiting `loader.loadScene`), so the
   *  controller itself never needs an async constructor. */
  initialFocus: F | null;
  /** The first scene, already loaded (`await source.loadScene(initialFocus)`). */
  initialScene: ExplorerScene<F>;
  /** Hand the renderer a new node list and force a draw. */
  applyScene: (scene: StackedScene<F>) => void;
  /** Ask for a redraw without a scene or camera change — a preview arrived or grew. */
  requestRedraw?: () => void;
  /** How far the viewer may pan and zoom (the view's resolved `limits`), read on every camera
   *  change. Absent: no limits beyond the camera's own scale range. */
  limits?: () => CameraLimitOptions;
  /** US071 — a navigation made `to` current in place of `from`: `in` by entering an item, `out` by
   *  leaving to a parent, `jump` by a reset or `jumpTo`. Fired after `applyScene`. A streamed page
   *  or a refresh of the same scene is not a navigation and never fires this. A sideways move is a
   *  leave then an enter, so it fires twice. */
  onNavigate?: (event: { from: StackedScene<F>; to: StackedScene<F>; direction: NavigationDirection }) => void;
}

/** How the viewer moved between scenes: `in` by entering an item, `out` by zooming out to a parent, `jump` by a focus change from outside (Back/Forward, a deep link, `jumpTo`). */
export type NavigationDirection = "in" | "out" | "jump";

interface PreviewEntry<F> {
  scene: StackedScene<F>;
  arrivedAt: number;
}

/** One scene's previews and the loads still filling them. Belongs to that scene, wherever it is
 *  in the stack — loads resolving into it keep landing after it has moved to a frame — and is
 *  marked dead when its scene is dropped, so a late load is discarded rather than kept. */
interface PreviewHolder<F> {
  previews: Map<string, PreviewEntry<F>>;
  pending: Map<string, Promise<StackedScene<F>>>;
  alive: boolean;
  /** The keys of its nodes big enough on screen to preview, as of the last `schedulePreviews`:
   *  never evicted. Bounded by how many such nodes fit on screen at once. */
  onScreen: Set<string>;
}

function newHolder<F>(): PreviewHolder<F> {
  return { previews: new Map(), pending: new Map(), alive: true, onScreen: new Set() };
}

/**
 * The navigation model behind the view, with no canvas: a stack of the scenes the viewer entered,
 * previews of the scenes they are zooming towards, and the transitions between them. Its `enter`
 * animates the camera unless given `{ approach: false }`; for tests, `createTestStack` is simpler.
 */
/** The view's resolved `limits` (`ExplorerLimits`): `null` where a limit is off. */
export interface CameraLimitOptions {
  pan: number | null;
  zoomOut: number | null;
  zoomIn: number | null;
}

export function createSceneStack<F>({ rig, source, initialFocus, initialScene, applyScene, requestRedraw, onNavigate, limits }: SceneStackDeps<F>) {
  const keyOf = (focus: F | null) => source.keyOf(focus);
  /** A render node's drill target, handed back to the source as the type it came from. */
  const focusOf = (node: RenderNode) => node.focus as F | null;
  const stacked = (focus: F | null, scene: ExplorerScene<F>) => toStackedScene(keyOf(focus), focus, scene);
  const streamScene = (focus: F, onUpdate: (scene: ExplorerScene<F>) => void) =>
    source.loadSceneStreaming ? source.loadSceneStreaming(focus, onUpdate) : source.loadScene(focus);
  const stack: Frame<F>[] = [];
  let current = stacked(initialFocus, initialScene);

  let animating = false;
  let transitioning = false;
  let animationGeneration = 0;

  if (limits) rig.limit = (camera) => limitCamera(camera, rig.viewport, cameraLimits(limits()));

  /** The largest scale at which any item of the current scene still fits the view, by scene and
   *  viewport size: the reference for `limits.zoomIn`. */
  let itemFitCache: { scene: StackedScene<F>; width: number; height: number; scale: number } | null = null;
  function smallestItemFit(): number {
    const vp = rig.viewport;
    if (itemFitCache && itemFitCache.scene === current && itemFitCache.width === vp.width && itemFitCache.height === vp.height) return itemFitCache.scale;
    let scale = 0;
    for (const n of current.renderNodes) scale = Math.max(scale, Math.min(vp.width / n.width, vp.height / n.height));
    itemFitCache = { scene: current, width: vp.width, height: vp.height, scale };
    return scale;
  }

  /**
   * Where the camera may go in the current scene. The content is the scene, or inside one the
   * scene drawn around it, so the viewer can pan across into a neighbour. The zoom-out limit holds
   * only at the top of the stack, as zooming out of anything deeper leaves it; the zoom-in limit is
   * a multiple of the zoom at which the scene's smallest item fills the view.
   */
  function cameraLimits(options: CameraLimitOptions): CameraLimits {
    const vp = rig.viewport;
    const { width, height } = current.layout;
    const frame = stack[stack.length - 1];
    const bounds = frame
      ? parentBoxInChild({ x: 0, y: 0, width: frame.scene.layout.width, height: frame.scene.layout.height }, frame.anchorBox, width, height, frame.contain)
      : { x: 0, y: 0, width, height };
    const minScale = !frame && options.zoomOut !== null ? fitCamera(vp, width, height, 0.85).scale * options.zoomOut : 0;
    const fit = options.zoomIn !== null ? smallestItemFit() : 0;
    const maxScale = fit > 0 ? Math.max(minScale, fit * options.zoomIn!) : Infinity;
    return { bounds, keep: options.pan, minScale, maxScale };
  }

  // D1.3's prefetch bound, widened from one to `MAX_PREVIEW_LOADS` now that every visible node
  // previews. Not literally cancelled when superseded (fetch has no cheap abort here) — once a load
  // resolves the loader's own cache absorbs it harmlessly, and the slot clears.
  let previewLoadsInFlight = 0;
  // Focus key -> the earliest `performance.now()` a failed preview may be loaded again. Per stack,
  // not per holder: a holder swap (`enter`, `refreshCurrent`) must not reset a failure's back-off.
  const previewRetryAt = new Map<string, number>();

  // D7 — at most one ancestor climb in flight; a continued zoom-out while one is already resolving
  // must not fire a second, since both would try to push a stack frame for the same depth.
  let climbing = false;

  // Child scenes ready to be drawn inside their node *before* it is entered — one per visible node
  // big enough to be previewing, keyed like the loader's cache. Held as laid-out `StackedScene<F>`s
  // (not just the loader's `ExplorerScene`) so a preview and the scene `enter` swaps to are the
  // very same layout — identical positions either side of the swap. `here` is the current scene's
  // holder: on `enter` it moves to the pushed frame (the parent keeps drawing and loading its
  // siblings' children), on `leave` it comes back.
  let here = newHolder<F>();
  // `enter` with an approach animation keeps the node being entered previewing for the whole
  // tween, even if it starts off screen or too small.
  let previewAnchorOverride: string | null = null;
  // Each preview's nodes placed in the current scene's world, and each ghost sibling's preview
  // placed in the child's world — recomputed only when what they depend on changes.
  const previewNodeCache = new Map<string, { host: StackedScene<F>; child: StackedScene<F>; nodes: RenderNode[] }>();
  let ghostCache: { frame: Frame<F>; child: StackedScene<F>; nodes: RenderNode[]; byFocusKey: Map<string, RenderNode> } | null = null;
  const ghostPreviewCache = new Map<string, { frame: Frame<F>; host: StackedScene<F>; child: StackedScene<F>; nodes: RenderNode[] }>();

  function tween(durationMs: number, onFrame: (t: number) => void): Promise<void> {
    const generation = ++animationGeneration;
    if (prefersReducedMotion() || durationMs <= 0) {
      onFrame(1);
      return Promise.resolve();
    }
    animating = true;
    const start = performance.now();
    return new Promise<void>((resolve) => {
      function step(now: number) {
        if (generation !== animationGeneration) return resolve();
        const t = Math.min(1, (now - start) / durationMs);
        onFrame(1 - Math.pow(1 - t, 3)); // ease-out cubic
        if (t < 1) {
          scheduleFrame(step);
        } else {
          animating = false;
          resolve();
        }
      }
      scheduleFrame(step);
    });
  }

  function tweenZoomToWorldPoint(durationMs: number, worldPoint: ScreenPoint, endScreen: ScreenPoint, endScale: number) {
    const vp = rig.viewport;
    const startScreen = rig.worldToScreen(worldPoint.x, worldPoint.y);
    const startScale = rig.camera.scale;
    return tween(durationMs, (t) => {
      const scale = startScale + (endScale - startScale) * t;
      rig.set(
        cameraPlacing(vp, worldPoint, { x: startScreen.x + (endScreen.x - startScreen.x) * t, y: startScreen.y + (endScreen.y - startScreen.y) * t }, scale),
      );
    });
  }

  /** Drops every holder — the current scene's and the stack's — for a jump that discards them. */
  function dropAllHolders() {
    here.alive = false;
    for (const frame of stack) frame.holder.alive = false;
    here = newHolder<F>();
  }

  function rememberPreview(holder: PreviewHolder<F>, scene: StackedScene<F>, arrivedAt: number): PreviewEntry<F> {
    const entry = { scene, arrivedAt };
    holder.previews.delete(scene.key);
    holder.previews.set(scene.key, entry);
    // Oldest first, skipping any still on screen (and the one just remembered).
    for (const key of holder.previews.keys()) {
      if (holder.previews.size <= PREVIEW_CACHE_LIMIT) break;
      if (key !== scene.key && !holder.onScreen.has(key)) holder.previews.delete(key);
    }
    return entry;
  }

  /** Streams `focus`'s scene into the preview cache. Later pages refine the preview in place
   *  (positions stable, `sunflowerLayoutAppend`) — or the live scene, if the user has entered it
   *  by the time they arrive. */
  function loadPreview(focus: F, holder: PreviewHolder<F> = here): Promise<StackedScene<F>> {
    const key = keyOf(focus);
    const pending = holder.pending.get(key);
    if (pending) return pending;
    // The entry is updated by reference, so later pages keep reaching it wherever it is held — the
    // current scene's `previews`, or a frame's while its scene is the ghost. A preview left with
    // only its first pages would otherwise be entered later as if that were the whole scene.
    let entry: PreviewEntry<F> | null = null;
    const promise = streamScene(focus, (updated) => {
        if (current.key === key) return refineIfCurrent(focus, updated);
        if (!entry) return;
        const layout = layoutAppend(updated, entry.scene.layout);
        entry.scene = { ...entry.scene, heading: updated.heading, layout, scene: updated, ...renderable(updated, layout) };
        requestRedraw?.();
      }).then((scene) => stacked(focus, scene));
    holder.pending.set(key, promise);
    promise.then(
      (stacked) => {
        holder.pending.delete(key);
        if (!holder.alive) return;
        entry = rememberPreview(holder, stacked, performance.now());
        requestRedraw?.();
      },
      () => holder.pending.delete(key),
    );
    return promise;
  }

  /** Makes `scene` current. The caller decides what happens to `here` first — move it to a frame
   *  (`enter`), take a frame's back (`leave`), or drop it (`dropAllHolders`). */
  function swapTo(scene: StackedScene<F>, direction: NavigationDirection) {
    const from = current;
    current = scene;
    applyScene(scene);
    onNavigate?.({ from, to: scene, direction });
  }

  /** Merges a later `loadSceneStreaming` page into `current` — but only while `focus`'s scene is
   *  still the one on screen; if the user has since left it (drilled further, backed out, or the
   *  initial-mount race described on `SceneStack.refineIfCurrent` below), a late-arriving page is
   *  silently dropped rather than resurrecting a scene nobody is looking at. A `renderNodes`/
   *  `layout` swap only — it never touches the camera, so a scene filling in behind the user never
   *  moves anything they're looking at.
   *
   *  **Uses `layoutAppend`, not `toStackedScene`'s ordinary `layoutFor`.** A full relayout
   *  on every streamed page reshuffled and reshifted every already-visible dot each time (confirmed
   *  directly in a browser) — `sunflowerLayoutAppend`'s own doc comment has the reasoning. Streaming
   *  only ever targets a packed (non-neighbourhood) scene, which never has a
   *  `focusId`, so the incremental append — not `radialFocusLayout` — is always the right one here;
   *  a fixed scene's positions are its own, so `layoutAppend` simply lays it out again. */
  function refineIfCurrent(focus: F, updated: ExplorerScene<F>): void {
    if (current.key !== keyOf(focus)) return;
    const layout = layoutAppend(updated, current.layout);
    const refined: StackedScene<F> = { key: current.key, focus, heading: updated.heading, layout, scene: updated, ...renderable(updated, layout) };
    current = refined;
    applyScene(refined);
  }

  /**
   * US043 Step 4 — replaces the current scene with a fresh composition of the *same* focus, for a
   * write/invalidation-driven refresh rather than a navigation. **A full relayout via
   * `toStackedScene`**, not `refineIfCurrent`'s incremental append: a write can remove membership
   * (a collection filter dropping an item, a set no longer owned), not just add to it, and
   * `sunflowerLayoutAppend` only knows how to grow a layout, never shrink or re-decorate one already
   * placed — reusing it here would leave stale positions/marks behind for anything that changed.
   * Positions therefore are not guaranteed stable across a refresh the way a streamed page's
   * are; only the camera and stack frames are preserved (`swapTo` never touches either).
   *
   * A no-op while a gesture-driven transition is in flight (never fights the camera mid-animation;
   * the next invalidation notification or a subsequent settle catches it up) and a no-op if the
   * scene the caller was refreshing is no longer current by the time the loader resolves (the user
   * navigated away during the await) — both silent, matching `enter`/`climbToParent`'s own guarantee
   * that a failure or a lost race leaves the camera exactly where it was. Returns whether a refreshed
   * scene was actually applied, so the caller can decide whether to re-check its own selection.
   */
  async function refreshCurrent(): Promise<boolean> {
    if (animating || transitioning) return false;
    const focus = current.focus;
    let fresh: ExplorerScene<F>;
    try {
      fresh = await (source.refreshScene ? source.refreshScene(focus) : source.loadScene(focus));
    } catch {
      return false; // a failed refresh leaves the confirmed scene on screen, retryable by the next notification
    }
    if (current.key !== keyOf(focus)) return false; // navigated away during the await
    const refreshed = stacked(focus, fresh);
    current = refreshed;
    here.alive = false; // their decoration is as stale as the scene's was
    here = newHolder<F>();
    applyScene(refreshed);
    return true;
  }

  /** Resolves with the first available scene for `focus` — for a streamed scene, that's its first page
   *  direct sets (`loadSceneStreaming`), not the whole thing, so `enter()` can place the camera
   *  and swap in something immediately rather than blocking on every page a busy scene has. Later
   *  pages stream in via `refineIfCurrent`. */
  async function ensureChildScene(focus: F): Promise<StackedScene<F>> {
    const scene = await streamScene(focus, (updated) => refineIfCurrent(focus, updated));
    return stacked(focus, scene);
  }

  /** `approach: false` is the zoom-triggered path: the gesture has already zoomed the anchor past
   *  the entry threshold, so the approach animation is skipped and the swap happens at the current
   *  camera — continuing the motion in progress rather than replacing it with a redundant one. */
  async function enter(anchorId: string, opts: { approach?: boolean } = {}) {
    if (animating || transitioning) return;
    const node = current.renderNodes.find((n) => n.id === anchorId);
    const anchorBox = current.layout.boxes.find((b) => b.id === anchorId);
    if (!node || !anchorBox || !node.drillable || node.focus === null) return;

    transitioning = true;
    const fromScene = current;
    const fromCamera = { ...rig.camera };
    const childKey = keyOf(focusOf(node));

    if (opts.approach !== false) {
      // Start loading now, so the children fade in behind the cloud during the approach itself.
      if (!here.previews.has(childKey)) loadPreview(focusOf(node) as F).catch(() => {});
      previewAnchorOverride = anchorId;
      const vp = rig.viewport;
      const target = cameraFillingBox(vp, anchorBox, ENTER_FILL_FRACTION);
      await tweenZoomToWorldPoint(APPROACH_MS, boxCentre(anchorBox), { x: vp.width / 2, y: vp.height / 2 }, target.scale);
    }

    const vp = rig.viewport;
    const anchorCentre = boxCentre(anchorBox);
    const anchorScreenCentre = rig.worldToScreen(anchorCentre.x, anchorCentre.y);
    const anchorScale = rig.camera.scale;

    // An already-previewed child swaps in synchronously — the very layout that was just drawn
    // inside the anchor, so nothing moves.
    let nextScene = here.previews.get(childKey)?.scene;
    if (!nextScene) {
      try {
        nextScene = await (here.pending.get(childKey) ?? ensureChildScene(focusOf(node) as F));
      } catch {
        previewAnchorOverride = null;
        transitioning = false;
        return; // a failed fetch leaves the camera exactly where the gesture left it — no partial swap
      }
    }
    previewAnchorOverride = null;

    // Clamped BEFORE the placement is solved — see ADR-016 A14, the bug this guards against.
    const contain = containFraction(fromScene.scene, nextScene.scene);
    const containScale = clampScale(anchorScale * childToParentFactor(anchorBox, nextScene.layout.width, nextScene.layout.height, contain));
    stack.push({
      scene: fromScene,
      anchorId,
      anchorSolid: isSolid(node),
      holder: here,
      ghostSince: -Infinity,
      camera: fromCamera,
      anchorBox: plainBox(anchorBox),
      contain,
      entryScale: containScale,
    });
    here = newHolder<F>();
    swapTo(nextScene, "in");
    rig.set(cameraPlacing(vp, { x: nextScene.layout.width / 2, y: nextScene.layout.height / 2 }, anchorScreenCentre, containScale));
    transitioning = false;
  }

  /** The inverse of `enter`. `approach: false` is the zoom-out-triggered path — see `scenes.ts`'s
   *  spike doc comment (ported verbatim in spirit) for why the swap happens immediately rather than
   *  animating back up first. */
  async function leave(approach = true) {
    if (animating || transitioning || stack.length === 0) return;
    transitioning = true;
    const frame = stack.pop()!;
    const { anchorBox, entryScale } = frame;
    const anchorCentre = boxCentre(anchorBox);
    const vp = rig.viewport;
    const fromScene = current;

    // The exact inverse of `enter`'s placement: the child layout's centre stays where it is on
    // screen and one child world unit keeps its on-screen size, so the parent appears around the
    // child with nothing moving — and the child stays drawn, as the anchor's preview, fading out
    // behind the cloud as the zoom-out continues (`transition.ts`).
    const k = childToParentFactor(anchorBox, fromScene.layout.width, fromScene.layout.height, frame.contain);
    const swapToParent = () => {
      const childGroupScreen = rig.worldToScreen(fromScene.layout.width / 2, fromScene.layout.height / 2);
      const parentScale = rig.camera.scale / k;
      here.alive = false;
      here = frame.holder;
      rememberPreview(here, fromScene, -Infinity);
      swapTo(frame.scene, "out");
      rig.set(cameraPlacing(vp, anchorCentre, childGroupScreen, parentScale));
    };

    if (approach === false) {
      swapToParent();
      transitioning = false;
      return;
    }

    const entryCamera: Camera = { ...rig.camera, scale: entryScale };
    const start = { ...rig.camera };
    await tween(LEAVE_APPROACH_MS, (t) => rig.set(lerpCamera(start, entryCamera, t)));

    swapToParent();

    const endScreen = {
      x: (anchorCentre.x - frame.camera.x) * frame.camera.scale + vp.width / 2,
      y: (anchorCentre.y - frame.camera.y) * frame.camera.scale + vp.height / 2,
    };
    await tweenZoomToWorldPoint(RESTORE_MS, anchorCentre, endScreen, frame.camera.scale);
    transitioning = false;
  }

  /**
   * D7 — asks the source where zooming out of the current scene leads (`SceneSource.parentOf`,
   * US070 / ADR-016 A24) and pushes the synthetic frame `enter()` would have pushed had the user
   * arrived from above — built the same way `enter()` builds a real one, entryScale included.
   * **Never touches the scene or the camera itself** in the ordinary case: the existing `leave()`,
   * completely unmodified, is what actually swaps to the newly-pushed ancestor, on a later call once
   * its own scale threshold is crossed (D7's "lazy, one ancestor per zoom-out").
   *
   * - `anchored`: the parent scene has an item standing for this one (`anchorId`), so the frame
   *   continues the footprint from that item's box. If the anchor turns out to be missing (a data
   *   inconsistency), the camera is left untouched, `enter()`'s own failure guarantee.
   * - `unanchored`: there is a parent but nothing in it to continue a footprint from, so this is a
   *   direct swap to it (the shape `reset()` uses), never a pushed frame.
   * - `none`, or a rejection: nothing happens.
   *
   * A no-op at any depth but 0, and at the root.
   */
  async function climbToParent(): Promise<void> {
    if (animating || transitioning || climbing || stack.length > 0) return;
    const focus = current.focus;
    if (focus === null) return;

    climbing = true;
    try {
      const link = await source.parentOf(focus, current.scene);
      if (link.kind === "none") return;
      const parentFocus = link.focus;
      const anchorExpected = link.kind === "anchored";
      const parentScene = await source.loadScene(parentFocus);
      const parentStacked = stacked(parentFocus, parentScene);

      if (!anchorExpected) {
        dropAllHolders();
        swapTo(parentStacked, "out");
        rig.set(fitCamera(rig.viewport, parentStacked.layout.width, parentStacked.layout.height, 0.85));
        return;
      }

      const anchorBox = link.kind === "anchored" ? parentStacked.layout.boxes.find((b) => b.id === link.anchorId) : undefined;
      // An anchor was expected (the source said which item stands for this scene) but isn't actually there —
      // leave the camera untouched, the same guarantee `enter()`'s own failure path gives.
      if (!anchorBox) return;

      const vp = rig.viewport;
      const box = plainBox(anchorBox);
      // The camera this scene would have been *entered* at, had the user arrived from above —
      // `cameraFillingBox` is the plan's own "entryScale from cameraFillingBox", mirroring exactly
      // what a real `enter()` computes from its own (real) anchor and from-camera.
      const syntheticCamera = cameraFillingBox(vp, box, ENTER_FILL_FRACTION);
      const contain = containFraction(parentStacked.scene, current.scene);
      const entryScale = clampScale(syntheticCamera.scale * childToParentFactor(box, current.layout.width, current.layout.height, contain));

      const anchorNode = parentStacked.renderNodes.find((n) => n.id === anchorBox.id);
      stack.push({
        scene: parentStacked,
        anchorId: anchorBox.id,
        anchorSolid: anchorNode ? isSolid(anchorNode) : false,
        holder: newHolder<F>(),
        ghostSince: performance.now(),
        camera: syntheticCamera,
        anchorBox: box,
        contain,
        entryScale,
      });
      requestRedraw?.();
    } catch {
      // A failed climb (a missing scene, a network error) leaves the camera exactly where it was —
      // the same guarantee `enter()`'s own failure path gives.
    } finally {
      climbing = false;
    }
  }

  /** How much of the viewport a node fills on screen (`fillFraction`). */
  function fillOf(node: PlainBox): number {
    const vp = rig.viewport;
    return fillFraction(node, rig.camera.scale, vp.width, vp.height);
  }

  /** Whether any of `node`'s box (in the current scene's world) is inside the viewport. */
  function isOnScreen(node: RenderNode): boolean {
    const vp = rig.viewport;
    const topLeft = rig.worldToScreen(node.x, node.y);
    return topLeft.x < vp.width && topLeft.x + node.width * rig.camera.scale > 0 && topLeft.y < vp.height && topLeft.y + node.height * rig.camera.scale > 0;
  }

  /** Every drillable node of the current scene at least `minFill` big whose box is on screen at
   *  all — not just the one nearest the centre — biggest first. */
  function visibleDrillable(minFill: number): RenderNode[] {
    const vp = rig.viewport;
    const out: { node: RenderNode; fill: number }[] = [];
    for (const node of current.renderNodes) {
      if (!node.drillable || node.focus === null) continue;
      const fill = fillOf(node);
      if (fill < minFill && node.id !== previewAnchorOverride) continue;
      if (!isOnScreen(node) && node.id !== previewAnchorOverride) continue;
      out.push({ node, fill });
    }
    return out.sort((a, b) => b.fill - a.fill).map((entry) => entry.node);
  }

  /** The drillable node under the middle of the screen, if it's at least `minFill` big. Entering
   *  follows where the user is looking, not whichever node's centre happens to be nearest. */
  function nodeAtScreenCentre(minFill: number): RenderNode | null {
    const vp = rig.viewport;
    const middle = rig.screenToWorld(vp.width / 2, vp.height / 2);
    let best: RenderNode | null = null;
    let bestDistance = Infinity;
    for (const node of current.renderNodes) {
      if (!node.drillable || fillOf(node) < minFill || !contains(node, middle.x, middle.y)) continue;
      const distance = distanceToCentre(node, middle.x, middle.y);
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }

  function maybeAutoEnterOnZoom() {
    if (animating || transitioning) return;
    const node = nodeAtScreenCentre(AUTO_ENTER_SIZE_FRACTION);
    if (node) void enter(node.id, { approach: false });
  }

  function maybeAutoLeaveOnZoom() {
    if (animating || transitioning) return;
    if (stack.length === 0) {
      // D7 — at depth 0 there is no recorded `entryScale` to compare against (nothing was really
      // entered), so the trigger is the scene's own natural resting view instead: the same `0.85`
      // padding `reset`/`jumpTo` already use to fit a scene on arrival. Crossing 70% of *that* is
      // the depth-0 analogue of "zoomed out past where you came in".
      const vp = rig.viewport;
      const restScale = fitCamera(vp, current.layout.width, current.layout.height, 0.85).scale;
      if (rig.camera.scale <= restScale * AUTO_LEAVE_SCALE_FRACTION) void climbToParent();
      return;
    }
    const entryScale = stack[stack.length - 1]!.entryScale;
    if (rig.camera.scale <= entryScale * AUTO_LEAVE_SCALE_FRACTION) void leave(false);
  }

  /** A sibling drawn around the current scene that can be entered from here, by id. */
  function ghostSibling(id: string): RenderNode | null {
    const frame = stack[stack.length - 1];
    if (!frame || id === frame.anchorId) return null;
    const node = ghostNodesFor(frame).nodes.find((n) => n.id === id);
    return node && node.drillable ? node : null;
  }

  /**
   * Step 3 — moving sideways. Inside X, once the middle of the screen has left X's footprint and
   * sits on a sibling Y that is big enough to be inside, the current scene becomes Y: `leave` back
   * to the parent and `enter` Y, both at the current camera. Each of those already keeps the
   * picture unchanged, and Y's children are usually already loaded (it was being revealed around
   * X), so the move itself is invisible — only the scene the URL settles on changes.
   */
  function maybeMoveAcross() {
    if (animating || transitioning || climbing) return;
    const frame = stack[stack.length - 1];
    if (!frame) return;
    const vp = rig.viewport;
    const middle = rig.screenToWorld(vp.width / 2, vp.height / 2);
    const ghosts = ghostNodesFor(frame).nodes;
    // The node entered through, as drawn around the current scene.
    const own = ghosts.find((n) => n.id === frame.anchorId);
    if (own && contains(own, middle.x, middle.y)) return;

    let target: RenderNode | null = null;
    let bestDistance = Infinity;
    for (const node of ghosts) {
      if (node.id === frame.anchorId || !node.drillable || node.focus === null || fillOf(node) < LATERAL_MIN_FILL) continue;
      if (!contains(node, middle.x, middle.y)) continue;
      const distance = distanceToCentre(node, middle.x, middle.y);
      if (distance < bestDistance) {
        target = node;
        bestDistance = distance;
      }
    }
    if (target) void enterSibling(target.id, { approach: false });
  }

  /** Enters a sibling of the current scene — one drawn around it — via the parent: `leave` (at the
   *  current camera, so nothing moves) then an ordinary `enter`. */
  async function enterSibling(id: string, opts: { approach?: boolean } = {}) {
    if (animating || transitioning || !ghostSibling(id)) return;
    await leave(false);
    await enter(id, opts);
  }

  /**
   * Double-clicking `id`, an item drawn as one of `parent`'s children in its place: enters `parent`
   * where it is (nothing moves, the children already being where they will be), then the item
   * itself when it has a scene of its own, or otherwise brings it to the middle of the view. So the
   * scene you end in is the item's, not whichever is left in the middle. Resolves to what happened.
   */
  async function enterThrough(parent: PreviewParent, id: string): Promise<"entered" | "centred" | "none"> {
    if (animating || transitioning) return "none";
    if (parent.around) await enterSibling(parent.id, { approach: false });
    else await enter(parent.id, { approach: false });
    const node = current.renderNodes.find((n) => n.id === id);
    if (!node) return "none";
    if (!node.drillable) {
      await centreOn(node);
      return "centred";
    }
    await enter(id);
    return current.key === keyOf(focusOf(node)) ? "entered" : "none";
  }

  /** Brings `node` to the middle of the view, zooming in by a double-click's usual step, but never
   *  past where it fills the view, and never out. */
  function centreOn(node: RenderNode): Promise<void> {
    const vp = rig.viewport;
    const fits = cameraFillingBox(vp, node, ENTER_FILL_FRACTION).scale;
    const scale = clampScale(Math.max(rig.camera.scale, Math.min(rig.camera.scale * DOUBLE_TAP_ZOOM, fits)));
    return tweenZoomToWorldPoint(APPROACH_MS, boxCentre(node), { x: vp.width / 2, y: vp.height / 2 }, scale);
  }

  /**
   * D1.2/D1.3, widened — starts loading the children of every visible drillable node past the
   * prefetch threshold, biggest on screen first, at most `MAX_PREVIEW_LOADS` uncached at once.
   * Cheap to call every frame (the caller does, after each draw): a no-op for anything already
   * previewing or pending. Previews still on screen are refreshed in the cache's LRU order, and
   * marked so the cache's limit never evicts one (`PreviewHolder.onScreen`).
   */
  function schedulePreviews() {
    if (animating || transitioning) return;
    const candidates: { node: RenderNode; fill: number; holder: PreviewHolder<F> }[] = visibleDrillable(PREFETCH_SIZE_FRACTION).map((node) => ({
      node,
      fill: fillOf(node),
      holder: here,
    }));
    // Step 2 — the parent's siblings drawn around the current scene keep loading too, into the
    // parent's own holder, so they reveal their children here just as they would out there.
    const frame = stack[stack.length - 1];
    if (frame) {
      for (const node of ghostNodesFor(frame).nodes) {
        if (node.id === frame.anchorId || !node.drillable || node.focus === null) continue;
        const fill = fillOf(node);
        if (fill >= PREFETCH_SIZE_FRACTION && isOnScreen(node)) candidates.push({ node, fill, holder: frame.holder });
      }
    }
    candidates.sort((a, b) => b.fill - a.fill);
    here.onScreen.clear();
    frame?.holder.onScreen.clear();
    for (const { node, holder } of candidates) holder.onScreen.add(keyOf(focusOf(node) as F));

    for (const { node, holder } of candidates) {
      const focus = focusOf(node) as F;
      const key = keyOf(focus);
      const held = holder.previews.get(key);
      if (held) {
        holder.previews.delete(key);
        holder.previews.set(key, held);
        continue;
      }
      if (holder.pending.has(key)) continue;
      // Already in the loader's cache: only the layout is missing, which costs no request — so
      // the in-flight bound below does not apply.
      if (source.isCached(focus)) {
        loadPreview(focus, holder).catch(() => {});
        continue;
      }
      if (previewLoadsInFlight >= MAX_PREVIEW_LOADS) continue;
      const retryAt = previewRetryAt.get(key);
      if (retryAt !== undefined && performance.now() < retryAt) continue;
      previewLoadsInFlight++;
      loadPreview(focus, holder)
        .then(
          () => previewRetryAt.delete(key),
          // A failed preview is invisible — `enter` still retries straight away and surfaces the real failure.
          () => previewRetryAt.set(key, performance.now() + PREVIEW_RETRY_MS),
        )
        .finally(() => {
          previewLoadsInFlight--;
          requestRedraw?.(); // the next draw schedules whatever is waiting for the slot
        });
    }
  }

  let focusKeyCache: { host: StackedScene<F>; byKey: Map<string, RenderNode> } | null = null;
  function currentByFocusKey(): Map<string, RenderNode> {
    if (focusKeyCache?.host === current) return focusKeyCache.byKey;
    const byKey = new Map<string, RenderNode>();
    for (const n of current.renderNodes) if (n.drillable && n.focus !== null) byKey.set(keyOf(focusOf(n)), n);
    focusKeyCache = { host: current, byKey };
    return byKey;
  }

  /** A preview's nodes in the current scene's world, placed inside `node` exactly where `enter`
   *  will put them. */
  function previewNodesFor(node: RenderNode, child: StackedScene<F>): RenderNode[] {
    const cached = previewNodeCache.get(node.id);
    if (cached && cached.host === current && cached.child === child) return cached.nodes;
    const contain = containFraction(current.scene, child.scene);
    const nodes = child.renderNodes.map((n) => placed(n, childBoxInParent(n, node, child.layout.width, child.layout.height, contain)));
    previewNodeCache.set(node.id, { host: current, child, nodes });
    return nodes;
  }

  /** The parent scene's nodes in the current (child) scene's world — the inverse placement. */
  function ghostNodesFor(frame: Frame<F>): { nodes: RenderNode[]; byFocusKey: Map<string, RenderNode> } {
    if (ghostCache && ghostCache.frame === frame && ghostCache.child === current) return ghostCache;
    const { width, height } = current.layout;
    const nodes = frame.scene.renderNodes.map((n) => placed(n, parentBoxInChild(n, frame.anchorBox, width, height, frame.contain)));
    const byFocusKey = new Map<string, RenderNode>();
    for (const n of nodes) if (n.focus !== null) byFocusKey.set(keyOf(focusOf(n)), n);
    ghostCache = { frame, child: current, nodes, byFocusKey };
    return ghostCache;
  }

  /** A ghost sibling's preview, in the child's world: placed in its parent-world node, then moved
   *  across the same way the sibling itself was. */
  function ghostPreviewNodesFor(frame: Frame<F>, sibling: RenderNode, child: StackedScene<F>): RenderNode[] {
    const cached = ghostPreviewCache.get(sibling.id);
    if (cached && cached.frame === frame && cached.host === current && cached.child === child) return cached.nodes;
    const original = frame.scene.renderNodes.find((n) => n.id === sibling.id)!;
    const { width, height } = current.layout;
    const nodes = child.renderNodes.map((n) => {
      const inParent = childBoxInParent(n, original, child.layout.width, child.layout.height, containFraction(frame.scene.scene, child.scene));
      return placed(n, parentBoxInChild(inParent, frame.anchorBox, width, height, frame.contain));
    });
    ghostPreviewCache.set(sibling.id, { frame, host: current, child, nodes });
    return nodes;
  }

  /** One node's own reveal, from its own fill: how visible its children are, how thin its cloud. */
  function revealFor(node: RenderNode, fill: number, entry: PreviewEntry<F> | undefined, now: number) {
    const arrival = entry ? Math.min(1, Math.max(0, (now - entry.arrivedAt) / PREVIEW_ARRIVAL_MS)) : 0;
    const visible = entry ? childAlpha(fill, arrival) : 0;
    return { arrival, visible, cloud: cloudAlpha(fill, visible, isSolid(node)) };
  }

  /**
   * The cross-fades to draw for the current camera — see `transition.ts`. Every visible node big
   * enough reveals its own children behind its own cloud (`under`), by its own size on screen;
   * nothing fades because a *different* node is being zoomed into. Having entered this scene
   * through a parent, that parent is drawn over it (`over`): the node entered dissolving, and its
   * siblings — with any children they were already revealing — exactly as they were drawn before
   * the swap. Every quantity is a function of on-screen size, which `enter`/`leave` keep
   * continuous, so the swap itself changes nothing on screen.
   */
  function transitionView(now = performance.now()): TransitionView {
    const under: TransitionLayer[] = [];
    let over: TransitionLayer | null = null;
    let arriving = false;
    const passThrough = new Set<string>();

    // Every node with a loaded preview thins by its own size, on screen or not — the same rule the
    // ghost applies to the parent's nodes after entry, so the two agree for every node, not just
    // the visible ones. Only on-screen nodes get their children drawn.
    const cloudById = new Map<string, number>();
    const onScreen = new Set(visibleDrillable(PREVIEW_MIN_FILL).map((node) => node.id));
    const byKey = currentByFocusKey();
    for (const [key, entry] of here.previews) {
      const node = byKey.get(key);
      if (!node) continue;
      const reveal = revealFor(node, fillOf(node), entry, now);
      if (reveal.arrival < 1) arriving = true;
      if (reveal.cloud < 1) cloudById.set(node.id, reveal.cloud);
      if (onScreen.has(node.id) && reveal.visible > 0.002) {
        // Once a solid item's children show more than it does, they are what the pointer finds. (A
        // cloud stays the target however far it thins: it is a haze the children show through.)
        const handedOver = isSolid(node) && reveal.visible > reveal.cloud;
        if (handedOver) passThrough.add(node.id);
        under.push({
          nodes: previewNodesFor(node, entry.scene),
          edges: entry.scene.renderEdges,
          alpha: () => reveal.visible,
          decorated: true,
          ...(handedOver ? { pointable: () => true, via: { id: node.id, around: false } } : {}),
        });
      }
    }
    let currentAlpha: ((node: RenderNode) => number) | null = cloudById.size > 0 ? (n) => cloudById.get(n.id) ?? 1 : null;

    const frame = stack[stack.length - 1];
    if (frame) {
      const arrival = Math.min(1, Math.max(0, (now - frame.ghostSince) / PREVIEW_ARRIVAL_MS));
      if (arrival < 1) arriving = true;
      // The anchor's own fill, as drawn around this scene: continuous with its fill before the swap.
      const fill = fillOf(parentBoxInChild(frame.anchorBox, frame.anchorBox, current.layout.width, current.layout.height, frame.contain));
      const visible = childAlpha(fill);
      // A climb's ghost fades in from "no ghost": the child stays fully visible meanwhile.
      const childVisible = 1 - arrival * (1 - visible);

      const ghost = ghostNodesFor(frame);
      const ghostAlpha = new Map<string, number>([[frame.anchorId, cloudAlpha(fill, visible, frame.anchorSolid) * arrival]]);
      // Solid siblings whose children now show more than they do: the pointer finds the children.
      const handedOver = new Set<string>();
      for (const [key, entry] of frame.holder.previews) {
        const sibling = ghost.byFocusKey.get(key);
        if (!sibling || sibling.id === frame.anchorId) continue;
        const reveal = revealFor(sibling, fillOf(sibling), entry, now);
        ghostAlpha.set(sibling.id, reveal.cloud * arrival);
        if (isOnScreen(sibling) && reveal.visible > 0.002) {
          const children = isSolid(sibling) && reveal.visible > reveal.cloud;
          if (children) handedOver.add(sibling.id);
          under.push({
            nodes: ghostPreviewNodesFor(frame, sibling, entry.scene),
            edges: entry.scene.renderEdges,
            alpha: () => reveal.visible * arrival,
            decorated: true,
            ...(children ? { pointable: () => true, via: { id: sibling.id, around: true } } : {}),
          });
        }
      }
      // Every sibling on show can be pointed at, unless it is solid and its children show more than
      // it does (then they are pointed at instead), but never the dissolving cloud of the scene
      // you're in, which covers everything inside it.
      const ghostAlphaOf = (n: RenderNode) => ghostAlpha.get(n.id) ?? arrival;
      over = {
        nodes: ghost.nodes,
        edges: frame.scene.renderEdges,
        alpha: ghostAlphaOf,
        decorated: true,
        pointable: (n) => n.id !== frame.anchorId && !handedOver.has(n.id) && ghostAlphaOf(n) > MIN_POINTABLE_ALPHA,
      };
      const inner = currentAlpha;
      currentAlpha = inner ? (n) => childVisible * inner(n) : () => childVisible;
    }

    return { under, currentAlpha, passThrough, over, animating: arriving };
  }

  function breadcrumb(): { key: string; heading: string }[] {
    return [...stack.map((f) => ({ key: f.scene.key, heading: f.scene.heading })), { key: current.key, heading: current.heading }];
  }

  return {
    get current() {
      return current;
    },
    get depth() {
      return stack.length;
    },
    isLocked: () => animating || transitioning,
    isAnimating: () => animating,
    enter,
    leave,
    climbToParent,
    maybeAutoEnterOnZoom,
    maybeAutoLeaveOnZoom,
    schedulePreviews,
    maybeMoveAcross,
    enterSibling,
    enterThrough,
    ghostSibling,
    transitionView,
    breadcrumb,
    /** Exposed so the composition layer can merge a page that streamed in for the *initial*
     *  mount's focus — `loadSceneStreaming`'s `onUpdate` can fire before this stack even exists
     *  yet (the stack's own constructor needs the first-resolved scene as an argument), a race
     *  `ensureChildScene`'s own internal use of this never has to consider. The composition layer
     *  buffers at most the latest such update and applies it once the stack is constructed —
     *  see `PixiExplorerView.tsx`. */
    refineIfCurrent,
    refreshCurrent,
    /** Unwind every frame at once (the "back to the top"/root affordance). Re-fits the camera
     *  itself, same as the spike's `reset` — swapping the scene without doing so would leave the
     *  camera in the abandoned scene's coordinate space, which usually means nothing on screen. */
    async reset() {
      animationGeneration++;
      animating = false;
      transitioning = false;
      dropAllHolders();
      stack.length = 0;
      const root = stacked(null, await source.loadScene(null));
      swapTo(root, "jump");
      rig.set(fitCamera(rig.viewport, root.layout.width, root.layout.height, 0.85));
    },
    nodeById(id: string) {
      return current.renderNodes.find((n) => n.id === id);
    },
    boxById(id: string) {
      return current.layout.boxes.find((b) => b.id === id);
    },
    /** Reconciles the camera against a focus this stack didn't reach by its own `enter`/`leave` —
     *  a browser Back/Forward or a pasted deep link while the surface is already mounted (plan §1
     *  "Still open: ... the URL/history model" — an exact undo-stack reconstruction from an
     *  arbitrary history entry is not attempted; this jumps straight to the target and discards
     *  the in-flight zoom-out stack, same simplification `reset` already makes for the root case).
     *  A no-op if `focus` is already `current.focus` — the common case, since most URL changes
     *  this surface sees are its own settle-navigate calls landing back on themselves. */
    async jumpTo(focus: F | null) {
      if (keyOf(focus) === current.key) return;
      animationGeneration++;
      animating = false;
      transitioning = false;
      dropAllHolders();
      stack.length = 0;
      const scene = stacked(focus, await source.loadScene(focus));
      swapTo(scene, "jump");
      rig.set(fitCamera(rig.viewport, scene.layout.width, scene.layout.height, 0.85));
    },
  };
}

/** The stack `createSceneStack` returns. */
export type SceneStack<F = unknown> = ReturnType<typeof createSceneStack<F>>;
