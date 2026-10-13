import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CameraRig, fitCamera, scheduleFrame } from "./camera/camera";
import { attachGestures, type GestureHandle } from "./camera/gestures";
import { createSceneStack, type RenderNode, type SceneStack, type StackedScene } from "./camera/scene-stack";
import type { SceneSource } from "./scene/source";
import type { ExplorerItem, ExplorerScene } from "./scene/types";
import type { Renderer, RendererStats } from "./renderer-pixi/renderer";
import { DEFAULT_RAMP, FALLBACK_PALETTE, type ExplorerPalette, type RampColours, type ResolvedPalette } from "./renderer-pixi/tint";
import { resolvePalette } from "./colour";
import { SceneOutline } from "./views/SceneOutline";
import { capEdges } from "./scene/edge-geometry";

/** US071 — a renderers module as the main entry sees it: views and textures are opaque here, so
 *  this entry never names a PixiJS type. Write one with `@thirkettle/data-explorer/pixi`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RenderersModule = Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { create(kit: any): unknown; update(view: any, item: any, frame: any): void; destroy?(view: any): void; animated?: boolean }
>;
import {
  optionsKey,
  resolveOptions,
  type ExplorerBackground,
  type ExplorerCustomViews,
  type ExplorerEdges,
  type ExplorerEffects,
  type ExplorerOptions,
  type ExplorerTextures,
  type ResolvedOptions,
} from "./options";
import {
  cameraReporter,
  createActivateEvent,
  type ExplorerActivateEvent,
  type ExplorerBackgroundClickEvent,
  type ExplorerCameraEvent,
  type ExplorerSceneEvent,
} from "./events";

// ---- The stats overlay ----------------------------------------------------------------------
//
// Draw time, frame rate and pool sizes, read off the live renderer (US036 Step 6, kept for the
// performance pages since). Switched on by the `stats` prop: the package never reads the page's
// URL (US072 Step 1), so a consumer that wants `?stats=1` passes it through itself.

// ---- Styles the view needs with no consumer CSS (US072 Step 1) --------------------------------
//
// Only what the view cannot work without, inline, at the values a styled consumer already uses,
// so a consumer's own rules never fight them: the wrapper anchors the overlay, the surface fills
// its width and owns its gestures, and the outline is visually hidden but read aloud. Everything
// cosmetic (borders, background, cursor) is the consumer's.
const WRAPPER_STYLE = { position: "relative" } as const;
const SURFACE_STYLE = { position: "relative", width: "100%", overflow: "hidden", touchAction: "none" } as const;
/** Given to the surface only when it has no height of its own at mount: a canvas host with no
 *  styles at all is 0 px tall, and an invisible explorer is the worst first impression. */
export const FALLBACK_SURFACE_HEIGHT = "480px";

function StatsOverlay({ stats }: { stats: RendererStats }) {
  // top-left + a fixed max-width, one stat per line: a `right`-anchored block with no width bound
  // clips itself off the left edge of anything narrower than the block's own text — exactly the
  // phone-width case this overlay exists for.
  const lines = [
    `avg ${stats.avgDrawMs.toFixed(2)}ms`,
    `last ${stats.lastDrawMs.toFixed(2)}ms`,
    `fps ${stats.fps.toFixed(0)}`,
    `nodes ${stats.nodes} (${stats.visible} visible)`,
    `edges ${stats.edges}  draws ${stats.draws}`,
    `textures ${stats.textures}  custom ${stats.customViews}`,
    `labels ${stats.labels}  sprites ${stats.sprites}`,
    `${stats.backend}  res ${stats.resolution.toFixed(2)}/${stats.resolutionCap}`,
    `fb ${(stats.framebufferPixels / 1e6).toFixed(2)}MP`,
  ];
  return (
    <div
      style={{
        // `.data-explorer` (the parent) is already `position: relative`, so this anchors to the
        // canvas area itself rather than the viewport — clear of the page header regardless of
        // header height, and it scrolls with the canvas rather than sitting fixed over content.
        position: "absolute",
        top: 8,
        left: 8,
        maxWidth: 180,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.78)",
        color: "#4ade80",
        font: "11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace",
        padding: "8px 10px",
        borderRadius: 6,
        pointerEvents: "none",
      }}
    >
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

/**
 * US036 plan Step 3R.1 Step 3 — the one composition boundary for the continuous-camera surface,
 * the same role `ExplorerConnector.tsx` plays for the discrete click-drill one. Owns the Pixi
 * `Application`, the `CameraRig`, the scene stack and the gesture attachment; renders a host `<div>`
 * for the canvas plus `SceneOutline` (D3/D4) alongside it.
 *
 * **`pixi.js` is reached only through a dynamically imported chunk** (`import("./renderer-pixi/renderer")`,
 * below) — A12 condition 1's route-split requirement. Nothing above this file imports
 * `renderer-pixi/**` at all (the `Renderer` type import is type-only, erased before anything
 * runs), so no other route's bundle pays for it.
 *
 * **The scene stack is built before the renderer is even attempted, and does not depend on it
 * succeeding.** `CameraRig` and `createSceneStack` import no pixi at all — the canvas is a
 * progressive enhancement on top of a surface (`SceneOutline`, the real link list) that already
 * works. This is not merely tidiness: A12 condition 2 is that the draw path has no WebGL context
 * to test against under `happy-dom`, confirmed directly by this component's own tests — with the
 * renderer attempt wrapped in its own `try`, that failure degrades to "no canvas, the outline is
 * still there and still fully functional" instead of the whole surface reporting an error. The
 * same fallback covers a real browser with WebGL genuinely unavailable, not just the test harness.
 *
 * **D1's URL model**: the camera owns the scene stack; no `navigate` and no fetch fire mid-gesture.
 * Every scene-stack transition (`applyScene`, called by the stack itself) restarts a short debounce
 * timer; once it fires with no further transition in that window, `onSettle` is called exactly
 * once with the *current* focus, however many scenes a fast zoom passed through on the way.
 * `SETTLE_DEBOUNCE_MS` is a plan-acknowledged guess
 * (§6 risk — the same epistemic status as D1.2's 40% prefetch threshold), tuned against a real
 * device, not asserted by a test that could only assert its own guess back at itself.
 *
 * **Click selects, double-click drills** (desktop-first; a touch-specific equivalent is
 * deliberately unresolved — see `gestures.ts`'s own note). A single click/tap on a node no longer
 * enters it: it selects (the Pixi ring highlight) and reports the node through `onNodeSelect`,
 * leaving what that *means* — a detail panel, anything else — entirely to the composing page.
 * Only a double-click/tap drills, on a drillable node; on anything else (empty space, or a node
 * with nowhere further to go) it's an ordinary zoom-in at that point, unifying "double-click to
 * zoom" and "double-click a node to enter it" into one gesture rather than two. Continuous
 * zoom-triggered auto-enter (crossing 85% of the viewport via pinch/wheel) is untouched by any of
 * this — it was never click-based to begin with.
 */
const SETTLE_DEBOUNCE_MS = 400;

/** The props of `DataExplorer`. `F` is your focus type and `D` your items' `data` type; both are inferred from `source`. */
export interface DataExplorerProps<F, D = unknown> {
  /** Owned by the caller, so its cache outlives this component being torn down and rebuilt by a
   *  re-render above it. Pass a new source to start over with an empty cache. */
  source: SceneSource<F, D>;
  /** The URL's own current focus — read once at mount to resolve the initial scene, and watched
   *  afterward only to reconcile a navigation this component didn't itself cause (Back/Forward, a
   *  pasted deep link) via the scene stack's `jumpTo`. */
  focus: F | null;
  /** Called once the camera comes to rest on a new scene: store it (state or URL) and pass it back
   *  as `focus`. Optional (US072 change 7): without it the explorer simply keeps its own place. */
  onSettle?: (focus: F | null) => void;
  /** Fired on every scene swap, immediately — unlike `onSettle`, never debounced. For chrome that
   *  should track what's on screen right now (the breadcrumb); cheap because it fires once per
   *  scene, not once per frame. Carries the scene itself so the caller can work out where it sits
   *  in the hierarchy without waiting for the URL to settle. */
  onSceneChange?: (scene: { heading: string; focus: F | null; scene: ExplorerScene<F, D> }) => void;
  /**
   * A single click/tap on a node, confirmed — fires only once it's clear a second tap isn't
   * following (the standard click/dblclick wait, `DOUBLE_TAP_MS` in `gestures.ts`), and never for
   * a double-click (that drills instead — see this file's own gesture wiring below). `null` when
   * a click/tap on empty space clears the selection. Deliberately just a hook: this component
   * itself only tracks the Pixi selection-ring highlight from it; what a click *means* (open a
   * detail panel, whatever) is entirely the composing page's call.
   */
  onNodeSelect?: (item: ExplorerItem<F, D> | null) => void;
  /** US071 — the item under the mouse, or `null` when it leaves every item. Mouse only (touch has
   *  no hover), and only when the hovered item changes. */
  onNodeHover?: (item: ExplorerItem<F, D> | null) => void;
  /** US071 — a double-click or double-tap on an item, or Enter on its outline entry. Call
   *  `event.preventDefault()` to stop the explorer entering it (or zooming in). */
  onNodeActivate?: (event: ExplorerActivateEvent<F, D>) => void;
  /** US071 — the viewer entered a scene, by any route. Fires after `onLeave` for the scene left. */
  onEnter?: (event: ExplorerSceneEvent<F, D>) => void;
  /** US071 — the viewer left a scene. Fires before `onEnter` for the scene arrived at. */
  onLeave?: (event: ExplorerSceneEvent<F, D>) => void;
  /** US071 — the camera moved. At most once per drawn frame, and only while the canvas is up. */
  onCameraChange?: (camera: ExplorerCameraEvent) => void;
  /** US071 — a confirmed single click or tap on empty space. `onNodeSelect(null)` fires as well. */
  onBackgroundClick?: (event: ExplorerBackgroundClickEvent) => void;
  /** US071 — an item texture could not be loaded or drawn (often a host without CORS headers).
   *  Once per URL; the item keeps its plain shape. */
  onTextureError?: (event: { url: string }) => void;
  /** US071 — item images: the size they start at, and how many are held. */
  textures?: ExplorerTextures;
  /**
   * US071 — custom renderers, keyed by item `kind`, loaded lazily the way the canvas itself is:
   * `renderers={() => import("./my-renderers")}`. Called once, when the canvas starts. The module
   * (and PixiJS) stay out of your page's entry chunk as long as it is only reached through this.
   */
  renderers?: () => Promise<RenderersModule | { default: RenderersModule }>;
  /** US071 — how many items custom renderers may draw at once. */
  customViews?: ExplorerCustomViews;
  /** Shows a small overlay of draw time, frame rate and pool sizes. Read once, at mount. */
  stats?: boolean;
  /** US070 Step 4 — the canvas colours. Pass a new object when they change (a light/dark or
   *  colour-scheme switch) and the live canvas re-tints, with no new scene and no camera reset. */
  palette?: ExplorerPalette;
  /** The colour ramp item `ramp` positions are drawn on. Read once, when the canvas starts. */
  ramp?: RampColours;
  /** US071 — the background behind the scene (today: the dot grid). Changes apply live. */
  background?: ExplorerBackground;
  /** US071 — switch the built-in effects on or off. Each defaults to on. Changes apply live. */
  effects?: ExplorerEffects;
  /** US071 — draw the scene's edges, styled per `kind`. Off by default. Changes apply live. */
  edges?: ExplorerEdges;
  /** Shown while the first scene loads. */
  renderLoading?: () => ReactNode;
  /** Shown when the first scene fails to load. */
  renderError?: () => ReactNode;
  /** Shown above the list fallback when the canvas cannot start (no WebGL). */
  renderCanvasUnavailable?: () => ReactNode;
}

const defaultLoading = () => <p role="status">Loading…</p>;
const defaultError = () => <p role="alert">This view could not be loaded.</p>;
const defaultCanvasUnavailable = () => <p>Showing the list view: the visual canvas could not start on this device.</p>;

/**
 * A continuous, zoomable explorer over your tree or graph: give it a scene `source` and the current
 * `focus`, and it draws the scene there, lets the viewer zoom into items and out again, and keeps an
 * accessible outline of real links beside the canvas. PixiJS is loaded lazily, when it first mounts.
 */
export function DataExplorer<F, D = unknown>({
  source,
  focus,
  onSettle,
  onSceneChange,
  onNodeSelect,
  onNodeHover,
  onNodeActivate,
  onEnter,
  onLeave,
  onCameraChange,
  onBackgroundClick,
  onTextureError,
  palette = FALLBACK_PALETTE,
  ramp = DEFAULT_RAMP,
  background,
  effects,
  edges,
  textures,
  renderers,
  customViews,
  stats: statsProp = false,
  renderLoading = defaultLoading,
  renderError = defaultError,
  renderCanvasUnavailable = defaultCanvasUnavailable,
}: DataExplorerProps<F, D>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<SceneStack<F> | null>(null);
  const focusAtMount = useRef(focus);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [canvasAvailable, setCanvasAvailable] = useState(true);
  const [activeScene, setActiveScene] = useState<StackedScene<F> | null>(null);
  // Step 6 scaffolding — decided once, at mount, the same way `focusAtMount` is.
  const statsEnabledRef = useRef(statsProp);
  const [stats, setStats] = useState<RendererStats | null>(null);

  // The setup effect below is deliberately mount-once (see its own comment) and closes over
  // `applyScene`/`onSettle` at that single point in time — refs, updated every render with no
  // effect dependency of their own, are what let it always call the *current* callback instead of
  // a stale closure over the `route` a parent's `onSettle` implementation reads.
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  const onSceneChangeRef = useRef(onSceneChange);
  onSceneChangeRef.current = onSceneChange;
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  // US071 — the same always-current refs, for the events.
  const eventsRef = useRef({ onNodeHover, onNodeActivate, onEnter, onLeave, onCameraChange, onBackgroundClick, onTextureError });
  eventsRef.current = { onNodeHover, onNodeActivate, onEnter, onLeave, onCameraChange, onBackgroundClick, onTextureError };
  // US063 — set once the renderer exists; re-tints the canvas in place on an appearance change.
  const setPaletteRef = useRef<((palette: ResolvedPalette) => void) | null>(null);
  // Read by the mount-once setup effect when the canvas starts, then kept current for it.
  // Resolved once per palette object (US072 change 5): CSS strings become numbers here, so the
  // renderer only ever sees numbers.
  const resolvedPalette = useMemo(() => resolvePalette(palette), [palette]);
  const paletteRef = useRef(resolvedPalette);
  paletteRef.current = resolvedPalette;
  const rampAtMount = useRef(ramp);
  // US071 — resolved, and compared by value, so an inline `effects={{ … }}` does not redraw on
  // every parent render. Applied live through `setOptionsRef`, the same path as the palette.
  const resolvedOptions = useResolvedOptions({ background, effects, edges, textures, customViews });
  const renderersAtMount = useRef(renderers);
  const optionsRef = useRef(resolvedOptions);
  optionsRef.current = resolvedOptions;
  const setOptionsRef = useRef<((options: ResolvedOptions) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let gestures: GestureHandle | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let destroyRenderer: (() => void) | null = null;
    let statsTimer: ReturnType<typeof setInterval> | null = null; // Step 6 scaffolding
    let unsubscribeRefresh: (() => void) | null = null;

    async function setup() {
      const host = hostRef.current;
      if (!host) return;

      // Only the scene itself is allowed to fail the whole surface — a network error resolving
      // the initial focus. Everything renderer-related is attempted separately, below, and its
      // own failure only turns off the canvas layer (see this file's own doc comment).
      //
      // Streamed, not `loadScene`, so a cold deep link straight into a busy scene (a shared URL,
      // a reload) gets the same progressive-fill treatment `enter()` gets via `ensureChildScene` —
      // otherwise this path would still block on every page. `stack` doesn't exist until *after*
      // the first scene resolves (its own constructor needs one), so an update arriving in that
      // narrow window is buffered — at most the latest, since each is already cumulative — and
      // applied via `stack.refineIfCurrent` the instant the stack exists.
      let stackForInitialUpdates: SceneStack<F> | null = null;
      let pendingInitialUpdate: ExplorerScene<F> | null = null;
      let initialScene: ExplorerScene<F>;
      try {
        const startFocus = focusAtMount.current;
        const onInitialUpdate = (updated: ExplorerScene<F>) => {
          if (stackForInitialUpdates && startFocus !== null) {
            stackForInitialUpdates.refineIfCurrent(startFocus, updated);
          } else {
            pendingInitialUpdate = updated; // stack doesn't exist yet — see the flush just after it's constructed
          }
        };
        initialScene =
          startFocus !== null && source.loadSceneStreaming
            ? await source.loadSceneStreaming(startFocus, onInitialUpdate)
            : await source.loadScene(startFocus);
      } catch {
        if (!cancelled) setPhase("error");
        return;
      }
      if (cancelled) return;

      // A host nobody sized is 0 px tall: give it the fallback height before measuring.
      if (host.clientHeight === 0 && !host.style.height) host.style.height = FALLBACK_SURFACE_HEIGHT;
      const viewport = { width: host.clientWidth || window.innerWidth, height: host.clientHeight || window.innerHeight };
      const rig = new CameraRig(() => viewport, { x: 0, y: 0, scale: 1 });

      let rendererHandle: Renderer | null = null;
      // Assigned once the stack exists; the draw reads the cross-fade from it (`transition.ts`).
      let stackForDraw: SceneStack<F> | null = null;
      let dirty = true;
      let drawScheduled = false;
      const reportCamera = cameraReporter((camera) => eventsRef.current.onCameraChange?.(camera));
      function requestDraw() {
        if (!rendererHandle) return;
        dirty = true;
        if (drawScheduled) return;
        drawScheduled = true;
        scheduleFrame(() => {
          drawScheduled = false;
          if (!dirty || !rendererHandle) return;
          dirty = false;
          const transition = stackForDraw?.transitionView() ?? null;
          rendererHandle.draw(rig.camera, transition);
          reportCamera(rig.camera);
          // Still drawing on change only — a preview fading in after arriving, or a node growing in
          // the first time it's drawn, *is* a change, for the few hundred milliseconds it lasts.
          if (transition?.animating || rendererHandle.isAnimating()) requestDraw();
          // After the draw, so it sees what's actually on screen now — panning brings nodes into
          // view as much as zooming does. A no-op for anything already previewing or pending.
          stackForDraw?.schedulePreviews();
          // Step 3 — panning (or zooming) from one scene across into a sibling makes the sibling
          // the current scene. Checked after the draw for the same reason as above.
          stackForDraw?.maybeMoveAcross();
        });
      }
      rig.onChange = requestDraw;

      let settleTimer: ReturnType<typeof setTimeout> | null = null;
      let lastAppliedScene: StackedScene<F> | undefined;

      const stack = createSceneStack<F>({
        rig,
        source,
        initialFocus: focusAtMount.current,
        initialScene,
        applyScene: (scene) => {
          rendererHandle?.setNodes(scene.renderNodes, scene.renderEdges, scene.scene.focusId ?? null);
          setActiveScene(scene);
          onSceneChangeRef.current?.(sceneInfo<F, D>(scene));
          requestDraw();

          // A same-key call is a scene filling in behind the camera (`ensureChildScene`'s
          // streaming `onUpdate`), not a real transition — it must not restart the settle timer
          // (which would keep re-firing `onSettle` with the same focus for every page a busy scene
          // streams in).
          const previous = lastAppliedScene;
          const isRealTransition = !previous || previous.key !== scene.key;
          lastAppliedScene = scene;
          if (!isRealTransition) return;

          if (!previous) return; // the initial scene is where the URL already is
          if (settleTimer) clearTimeout(settleTimer);
          settleTimer = setTimeout(() => {
            settleTimer = null;
            onSettleRef.current?.(scene.focus);
          }, SETTLE_DEBOUNCE_MS);
        },
        requestRedraw: requestDraw,
        onNavigate: ({ from, to, direction }) => {
          const { onLeave, onEnter } = eventsRef.current;
          onLeave?.({ ...sceneInfo<F, D>(from), direction });
          onEnter?.({ ...sceneInfo<F, D>(to), direction });
        },
      });
      stackRef.current = stack;
      stackForDraw = stack;
      stackForInitialUpdates = stack;
      // Flush a page that streamed in during the narrow window before the stack existed (see the
      // comment on `initialScene` above) — `refineIfCurrent` itself still checks the scene is
      // still current, so this is safe even if it somehow raced past that too.
      if (pendingInitialUpdate && focusAtMount.current) stack.refineIfCurrent(focusAtMount.current, pendingInitialUpdate);

      // US043 Step 4 — the write-driven refresh path. `selectedId` is shared with the gesture
      // handlers set up below (`onTap`), since only this effect (not `ExplorerConnector`, which
      // only hears about a selection through `onNodeSelect`) knows what's currently selected on the
      // canvas itself.
      let selectedId: string | null = null;
      let hoveredId: string | null = null;
      let refreshInFlight = false;
      let refreshQueued = false;
      function scheduleRefresh() {
        if (refreshInFlight) {
          refreshQueued = true; // coalesce a burst of settling queries into one rebuild, not several
          return;
        }
        refreshInFlight = true;
        void stack
          .refreshCurrent()
          .then((applied) => {
            if (!applied || selectedId === null) return;
            // A collection-filtered refresh can remove the very node that was selected — clear it
            // rather than leave the ring/detail panel pointing at something no longer on screen
            // (design requirement — "clears removed selection").
            if (!stack.current.renderNodes.some((n) => n.id === selectedId)) {
              selectedId = null;
              rendererHandle?.setSelected(null);
              requestDraw();
              onNodeSelectRef.current?.(null);
            }
          })
          .finally(() => {
            refreshInFlight = false;
            if (refreshQueued) {
              refreshQueued = false;
              scheduleRefresh();
            }
          });
      }
      unsubscribeRefresh = source.subscribeToInvalidation?.(scheduleRefresh) ?? null;
      lastAppliedScene = stack.current;
      setActiveScene(stack.current);
      onSceneChangeRef.current?.(sceneInfo<F, D>(stack.current));
      rig.set(fitCamera(viewport, stack.current.layout.width, stack.current.layout.height, 0.85));
      // The accessible surface (SceneOutline) is fully functional the moment the stack exists —
      // "ready" does not wait on the canvas layer below.
      if (!cancelled) setPhase("ready");

      // US071 — the consumer's renderers load alongside the canvas chunk, not after it. A failure
      // leaves every item drawn as its shape.
      const renderersLoad = renderersAtMount.current?.().then(
        (loaded) => ("default" in loaded && typeof loaded.default === "object" ? (loaded.default as RenderersModule) : (loaded as RenderersModule)),
        (error: unknown) => {
          console.warn("data-explorer: the renderers module failed to load, so every item is drawn as its shape.", error);
          return null;
        },
      );

      try {
        const { createRenderer } = await import("./renderer-pixi/renderer");
        if (cancelled) return;
        const startPalette = paletteRef.current;
        const startOptions = optionsRef.current;
        const renderer = await createRenderer(host, () => viewport, startPalette, rampAtMount.current, undefined, startOptions, () => requestDraw(), (url) => eventsRef.current.onTextureError?.({ url }));
        if (cancelled) {
          renderer.destroy();
          return;
        }
        rendererHandle = renderer;
        destroyRenderer = () => renderer.destroy();
        setPaletteRef.current = (next) => {
          renderer.setPalette(next);
          requestDraw();
        };
        setOptionsRef.current = (next) => {
          renderer.setOptions(next);
          requestDraw();
        };
        // A palette or options change that arrived while the renderer chunk was loading had no
        // renderer to reach.
        if (paletteRef.current !== startPalette) renderer.setPalette(paletteRef.current);
        if (optionsRef.current !== startOptions) renderer.setOptions(optionsRef.current);
        renderer.setNodes(stack.current.renderNodes, stack.current.renderEdges, stack.current.scene.focusId ?? null);
        requestDraw();
        void renderersLoad?.then((module) => {
          if (!module || cancelled) return;
          // The main entry's `RenderersModule` is deliberately loose (no PixiJS types); `./pixi` is precise.
          renderer.setRenderers(module as Parameters<typeof renderer.setRenderers>[0]);
          requestDraw();
        });

        // Step 6 scaffolding — see this file's own top-of-file note. `avgDrawMs` is a rolling
        // average already maintained by the renderer regardless of this timer; polling it every
        // 250ms is cheap (one object spread) and never runs unless `?stats=1` was on the URL.
        if (statsEnabledRef.current) {
          statsTimer = setInterval(() => {
            if (!cancelled) setStats({ ...renderer.stats });
          }, 250);
        }

        gestures = attachGestures(host, rig, {
          isLocked: () => stack.isLocked(),
          onZoomIn: () => stack.maybeAutoEnterOnZoom(),
          onZoomOut: () => stack.maybeAutoLeaveOnZoom(),
          // A single click/tap selects (and reports the node up to the composing page) but never
          // drills — that's double-click-only now, the same disambiguation an icon grid or a map
          // pin uses. `gestures.ts` already defers this behind the double-tap window; hit-testing
          // twice (once here, once in `onDoubleTap`) is deliberate rather than shared/cached,
          // since the camera can't move between a tap's release and this timer firing anyway, and
          // caching one hit-test result across two independent hooks would be a false economy for
          // one extra `hitTest` call.
          onTap: (point) => {
            const node = renderer.hitTest(rig.camera, point);
            selectedId = node?.id ?? null;
            renderer.setSelected(selectedId);
            requestDraw();
            onNodeSelectRef.current?.(node ? itemOf(node) : null);
            if (!node) eventsRef.current.onBackgroundClick?.({ screen: { x: point.x, y: point.y }, world: rig.screenToWorld(point.x, point.y) });
          },
          // D6 — mouse-only (`gestures.ts` itself never calls this for touch); one hit-test per
          // hover-throttled frame, same cost class as a single click's own hit-test.
          onHover: (point) => {
            const node = point ? renderer.hitTest(rig.camera, point) : null;
            const id = node?.id ?? null;
            renderer.setHovered(id);
            requestDraw();
            // The event fires on a change of item only; the renderer is told every time, as before.
            if (id === hoveredId) return;
            hoveredId = id;
            eventsRef.current.onNodeHover?.(node ? itemOf(node) : null);
          },
          // A double-click/tap on a drillable node enters it (the old single-click behaviour,
          // moved here); on anything else — empty space, or a node that isn't drillable (a
          // scene's own focus, which has nowhere further to go) — it's an ordinary zoom-in at that
          // point, same as before this story ever distinguished the two.
          onDoubleTap: (point) => {
            const node = renderer.hitTest(rig.camera, point);
            if (node && activationCancelled(node, "pointer")) return;
            if (node?.drillable && stack.nodeById(node.id)) {
              void stack.enter(node.id);
              return;
            }
            // A sibling drawn around the current scene: enter it via the parent.
            if (node && stack.ghostSibling(node.id)) {
              void stack.enterSibling(node.id);
              return;
            }
            rig.zoomAtScreen(point, 2.5);
          },
        });

        resizeObserver = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          viewport.width = Math.round(entry.contentRect.width);
          viewport.height = Math.round(entry.contentRect.height);
          renderer.resize();
          requestDraw();
        });
        resizeObserver.observe(host);
      } catch {
        // No canvas layer (WebGL unavailable, or — this component's own test environment — no
        // real canvas context at all under happy-dom). `SceneOutline` is already rendering and
        // stays the fully interactive surface; nothing above needed the renderer to have worked.
        if (!cancelled) setCanvasAvailable(false);
      }
    }

    void setup();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      gestures?.detach();
      destroyRenderer?.();
      if (statsTimer !== null) clearInterval(statsTimer);
      unsubscribeRefresh?.();
      setPaletteRef.current = null;
      setOptionsRef.current = null;
      stackRef.current = null;
    };
    // Intentionally mount-once (empty deps): the whole point of this surface is one continuous
    // camera/renderer instance for as long as it's shown, never rebuilt on a focus change — that
    // is what `jumpTo` below is for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A no-op whenever `stackRef.current` isn't set yet (this component's own mount, before
    // `setup()` reaches it) or `focus` already matches the stack's own current scene — `jumpTo`
    // makes that check itself, so this effect doesn't need a parallel one against `focusAtMount`.
    void stackRef.current?.jumpTo(focus);
  }, [focus]);

  // US063, a prop since US070 Step 4 — a new palette object re-tints the live renderer: no new
  // scene, no refetch, no camera reset. The first run (mount) is a no-op: the renderer does not
  // exist yet, and it starts from `paletteRef` instead.
  useEffect(() => {
    setPaletteRef.current?.(resolvedPalette);
  }, [resolvedPalette]);

  useEffect(() => {
    setOptionsRef.current?.(resolvedOptions);
  }, [resolvedOptions]);

  function handleOutlineActivate(id: string) {
    const stack = stackRef.current;
    const node = stack?.nodeById(id);
    if (node && activationCancelled(node, "keyboard")) return;
    void stack?.enter(id);
  }

  /** Raises `onNodeActivate` and reports whether the consumer cancelled the default action. */
  function activationCancelled(node: RenderNode, source: ExplorerActivateEvent["source"]): boolean {
    const handler = eventsRef.current.onNodeActivate;
    if (!handler) return false;
    const event = createActivateEvent<F, D>(itemOf<F, D>(node), source);
    handler(event);
    return event.defaultPrevented;
  }

  return (
    <div className="data-explorer" style={WRAPPER_STYLE}>
      {phase === "loading" && renderLoading()}
      {phase === "error" && renderError()}
      {phase === "ready" && !canvasAvailable && renderCanvasUnavailable()}
      <div ref={hostRef} className="data-explorer__surface" style={SURFACE_STYLE} aria-hidden="true" />
      {activeScene && (
        <SceneOutline
          scene={activeScene.scene}
          onActivate={handleOutlineActivate}
          edges={resolvedOptions.edges.visible ? capEdges(activeScene.renderEdges, activeScene.scene.focusId, resolvedOptions.edges.max) : null}
        />
      )}
      {statsEnabledRef.current && stats && <StatsOverlay stats={stats} />}
    </div>
  );
}

/** What the scene events carry: the scene as the source wrote it, typed as the view's `F` and `D`. */
function sceneInfo<F, D>(scene: StackedScene<F>): { heading: string; focus: F | null; scene: ExplorerScene<F, D> } {
  return { heading: scene.heading, focus: scene.focus, scene: scene.scene as ExplorerScene<F, D> };
}

/** The consumer's own item behind a render node, typed as the view's `F` and `D` (US072 change 1). */
function itemOf<F, D>(node: RenderNode): ExplorerItem<F, D> {
  return node.item as ExplorerItem<F, D>;
}

/** Resolves the option props, returning the same object until their resolved value changes. */
function useResolvedOptions(options: ExplorerOptions): ResolvedOptions {
  const resolved = resolveOptions(options);
  const key = optionsKey(resolved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => resolved, [key]);
}
