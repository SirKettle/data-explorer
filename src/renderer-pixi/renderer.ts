// The PixiJS renderer: scene graph, camera transform, culling, level-of-detail and hit testing.
//
// US036 plan Step 3R.1 Step 3 — adapted from
// `apps/explorer/__scratch/pixijs-explorer-spike/renderer.ts` (ADR-016 A11-A15) to draw the
// production `RenderNode[]` (`../camera/scene-stack.ts`) instead of the spike's synthetic data,
// and to resolve its base palette from US028's CSS custom properties at runtime (A12 condition 3)
// instead of the spike's hardcoded hex values.
//
// **This is the one file in the tree allowed to import `pixi.js`** (`architecture.test.ts`,
// verified failing before being trusted, the same discipline every other import-boundary rule in
// this codebase uses) — A12 condition 2's mitigation for "the draw path cannot be tested under
// `happy-dom`": every other file this surface needs (`camera.ts`, `gestures.ts`,
// `scene-stack.ts`, `scene/layout.ts`) imports no pixi and is tested directly.
//
// Everything about the drawing strategy below is shaped by "it has to hold up on a phone" — see
// the spike's own README for the measurements that justified each one:
//
//  * One shared circle texture, one sprite per visible node, tinted — not a `Graphics` per node.
//  * Sprites are pooled *positionally*, not by node id, so nothing carries stale per-node state
//    across a scene swap.
//  * Labels live in a screen-space overlay, created lazily and capped, because a `Text` is a
//    texture and hundreds of them is what would actually run a phone out of memory.
//  * Nothing is drawn on a timer — `draw()` runs only when the camera or the scene changed.

import { clampPresence, easePresence, MAX_PRESENCE_FRAME_MS, presenceLook, type ExplorerPresence } from "../presence";
import { Application, Container, Graphics, Rectangle, Sprite, Text, TextStyle, Texture, TilingSprite } from "pixi.js";
import type { RenderEdge, RenderNode, TransitionView } from "../camera/scene-stack";
import { createEdgeDrawer, type EdgeLayer } from "./edges";
import { createTextureStore, CROP_SIZE } from "./textures";
import { createCustomViews, itemZ, PIXI_KIT } from "./custom";
import { nearestFirst, type RendererModule } from "../custom-views";
import { appearanceFor, hashId, type GlowSwitches, type ResolvedPalette, type RampColours } from "./tint";
import { prefersReducedMotion, pulseLevel, wantsNextFrame } from "../motion";
import type { Camera, ScreenPoint, Viewport } from "../camera/camera";
import { contains, distanceToCentre } from "../scene/geometry";
import { DEFAULT_OPTIONS, type ExplorerGridTile, type ExplorerGridTileModule, type ResolvedOptions } from "../options";

export interface RendererStats {
  nodes: number;
  /** US071 — edges stroked in the last draw. */
  edges: number;
  /** US071 — draws since the renderer started. Still at rest means no frames are being drawn. */
  draws: number;
  /** US071 — item images held or loading, against `textures.budget`. */
  textures: number;
  /** US071 — custom renderer views alive (drawn or pooled). */
  customViews: number;
  visible: number;
  labels: number;
  sprites: number;
  lastDrawMs: number;
  avgDrawMs: number;
  fps: number;
  backend: string;
  resolutionCap: number;
  resolution: number;
  framebufferPixels: number;
}

const DISC_TEXTURE_SIZE = 128;
const LABEL_MIN_DIAMETER_PX = 34;
const SUBLABEL_MIN_DIAMETER_PX = 96;
const MAX_LABELS = 64;
const GRID_TEXTURE_SIZE = 64;
/** A `cloud` item is drawn as a nebula, not a disc: a soft, ragged nebula that its children can show
 *  through as it's zoomed into (`camera/transition.ts`). A few procedural variants, picked and
 *  rotated per id, so neighbouring clouds don't read as copies of one stamp. */
const NEBULA_TEXTURE_SIZE = 192;
const NEBULA_VARIANTS = 4;
/** The cloud spills past the node's own box (hit-testing still uses the box), so its wispy edge
 *  isn't cropped to the circle the disc used to fill. */
const NEBULA_SPREAD = 1.7;
const NEBULA_ALPHA = 0.8;
/** Remembered ids are dropped wholesale past this, so the map can't grow without bound. */
const MAX_REMEMBERED_IDS = 20_000;
/** US071 — the glow behind a `glow`/`pulse` item: white with a soft radial falloff, tinted per item. */
const GLOW_TEXTURE_SIZE = 128;

function glowCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = GLOW_TEXTURE_SIZE;
  canvas.height = GLOW_TEXTURE_SIZE;
  const ctx = canvas.getContext("2d")!;
  const centre = GLOW_TEXTURE_SIZE / 2;
  const fill = ctx.createRadialGradient(centre, centre, 0, centre, centre, centre);
  fill.addColorStop(0, "rgba(255,255,255,1)");
  fill.addColorStop(0.35, "rgba(255,255,255,0.55)");
  fill.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);
  return canvas;
}

/** A node grows from a dot to its full size the first time it is drawn — a streamed page, a
 *  revealed child, a node panned into view — over `durationMs`, after a per-id stagger of up to
 *  `staggerMs` so a page pops in as a scatter rather than all at once (`options.ts`).
 *  Ease-out with a small overshoot: a dot that swells slightly past its size and settles. */
function growScale(elapsedMs: number, grow: ResolvedOptions["effects"]["growIn"]): number {
  if (elapsedMs <= 0) return 0;
  const t = Math.min(1, elapsedMs / grow.durationMs);
  const c1 = 1.4;
  const eased = 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  return grow.startScale + (1 - grow.startScale) * eased;
}

/** Below this, a node isn't worth a sprite (or a label) at all. */
const MIN_DRAWN_ALPHA = 0.01;
/** A15's "already the single biggest saving available" — no on-screen toggle in production
 *  (that was the spike's own live fill-rate experiment), just the sane default it settled on. */
const DEFAULT_RESOLUTION_CAP = 2;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function latticeHash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = latticeHash(xi, yi, seed);
  const b = latticeHash(xi + 1, yi, seed);
  const c = latticeHash(xi, yi + 1, seed);
  const d = latticeHash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < 4; octave++) {
    sum += amplitude * valueNoise(x * frequency, y * frequency, seed + octave * 101);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / norm;
}

/** One nebula variant: white, with all the shape in its alpha, so it tints like every other
 *  texture here. Domain-warped noise gives the edge its wisps; a soft core keeps the centre
 *  readable as "the thing" at overview zoom. Built once, at renderer creation. */
function nebulaCanvas(seed: number): HTMLCanvasElement {
  const size = NEBULA_TEXTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const r = Math.hypot(nx, ny);
      const warpX = fbm(nx * 1.6 + seed * 7.1, ny * 1.6, seed);
      const warpY = fbm(nx * 1.6, ny * 1.6 + seed * 3.7, seed + 11);
      const density = fbm(nx * 2.4 + (warpX - 0.5) * 1.8, ny * 2.4 + (warpY - 0.5) * 1.8, seed + 23);
      const envelope = 1 - smoothstep(0.3, 0.98, r + (density - 0.5) * 0.45);
      const core = Math.exp(-r * r * 5);
      const alpha = Math.min(1, envelope * (0.3 + density) * 0.85 + core * 0.4) * (1 - smoothstep(0.84, 1, r));
      const i = (y * size + x) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export async function createRenderer(
  host: HTMLElement,
  readViewport: () => Viewport,
  palette: ResolvedPalette,
  ramp: RampColours,
  resolutionCap = DEFAULT_RESOLUTION_CAP,
  initialOptions: ResolvedOptions = DEFAULT_OPTIONS,
  /** Called when something the renderer loaded itself (a background image, an item texture) is
   *  ready to draw. */
  onBackdropReady?: () => void,
  /** US071 — an item texture could not be loaded or used; once per URL. */
  onTextureError?: (url: string) => void,
) {
  let tokens = palette;
  let currentRamp = ramp;
  let options = initialOptions;
  let destroyed = false;
  let cap = resolutionCap;
  let resolution = Math.min(window.devicePixelRatio || 1, cap);
  const app = new Application();
  const initial = readViewport();
  await app.init({
    width: initial.width,
    height: initial.height,
    background: options.background.color ?? tokens.background,
    antialias: true,
    resolution,
    autoDensity: true,
    // The ticker is off and `resizeTo` is unused: both drive themselves from rAF, which this
    // surface deliberately avoids relying on (`camera.ts`'s `scheduleFrame` doc comment) — draws
    // happen only when the camera or scene actually changed.
    autoStart: false,
    sharedTicker: false,
    preference: "webgl",
    powerPreference: "high-performance",
  });
  app.ticker.stop();
  host.appendChild(app.canvas);

  const discTexture = app.renderer.generateTexture({
    target: new Graphics()
      .circle(DISC_TEXTURE_SIZE / 2, DISC_TEXTURE_SIZE / 2, DISC_TEXTURE_SIZE / 2 - 2)
      .fill(0xffffff),
    resolution: 2,
    antialias: true,
  });
  const ringTexture = app.renderer.generateTexture({
    target: new Graphics()
      .circle(DISC_TEXTURE_SIZE / 2, DISC_TEXTURE_SIZE / 2, DISC_TEXTURE_SIZE / 2 - 6)
      .stroke({ color: 0xffffff, width: 7 }),
    resolution: 2,
    antialias: true,
  });
  const gridTexture = app.renderer.generateTexture({
    target: new Graphics().circle(GRID_TEXTURE_SIZE / 2, GRID_TEXTURE_SIZE / 2, 1.6).fill(0xffffff),
    resolution: 2,
    antialias: true,
  });

  // US036 3R.2 D4, declared since US070 Step 3 — a `cloud` is a nebula (`nebulaTextures`, below),
  // a `disc` a circle, a `square` a rounded square, chosen for silhouette distinctness at
  // label-suppressed sizes. The adapter decides which shape an item gets; this file only draws it.
  const SQUARE_SIDE = 100;
  const squareTexture = app.renderer.generateTexture({
    target: new Graphics()
      .roundRect((DISC_TEXTURE_SIZE - SQUARE_SIDE) / 2, (DISC_TEXTURE_SIZE - SQUARE_SIDE) / 2, SQUARE_SIDE, SQUARE_SIDE, 16)
      .fill(0xffffff),
    resolution: 2,
    antialias: true,
  });

  const nebulaTextures = Array.from({ length: NEBULA_VARIANTS }, (_, seed) => Texture.from(nebulaCanvas(seed)));
  const glowTexture = Texture.from(glowCanvas());

  function textureForShape(shape: "square" | "disc"): Texture {
    if (shape === "square") return squareTexture;
    return discTexture;
  }

  // The ownership ring matches the shape it marks (a circle ring clips a square's corners). Baked
  // at the *same* geometry as its fill — `ringTexture` itself is baked slightly smaller than
  // `discTexture` (radius 58 vs 62) and only reads as "outside" the fill because `draw()` scales
  // every ring up by the same runtime factor, so no shape needs a scale of its own.
  const squareRingTexture = app.renderer.generateTexture({
    target: new Graphics()
      .roundRect((DISC_TEXTURE_SIZE - SQUARE_SIDE) / 2, (DISC_TEXTURE_SIZE - SQUARE_SIDE) / 2, SQUARE_SIDE, SQUARE_SIDE, 16)
      .stroke({ color: 0xffffff, width: 7 }),
    resolution: 2,
    antialias: true,
  });

  function ringTextureForShape(shape: "square" | "disc"): Texture {
    if (shape === "square") return squareRingTexture;
    return ringTexture;
  }

  // US071 — the consumer's gradient and image, fixed to the view, under the grid. Built only when
  // the resolved option changes, and laid out again on resize.
  const backdrop = new Container();
  app.stage.addChild(backdrop);
  const gradientSprite = new Sprite(Texture.EMPTY);
  gradientSprite.visible = false;
  backdrop.addChild(gradientSprite);
  let gradientKey = "";
  let backgroundImage: { url: string; texture: Texture | null; sprite: Sprite | TilingSprite | null } | null = null;
  const failedImages = new Set<string>();

  // A faint world-anchored dot grid — without it, panning across empty space reads as nothing
  // moving at all once a cluster is off screen.
  const grid = new TilingSprite({
    texture: gridTexture,
    width: initial.width,
    height: initial.height,
  });
  grid.tint = options.background.grid.color ?? tokens.grid;
  grid.alpha = options.background.grid.alpha;
  grid.visible = options.background.grid.visible;
  app.stage.addChild(grid);
  applyBackdrop();

  // A host-drawn tile replaces the dot texture once its lazy module has loaded; until then, and if
  // it fails, the dots show. `gridTileSize` is the side of whichever texture the grid tiles now.
  let gridTileSize = GRID_TEXTURE_SIZE;
  let customGridTexture: Texture | null = null;
  let loadedGridTile: ExplorerGridTile | null = null;
  function applyGridTile(next: ExplorerGridTile | null) {
    if (next === loadedGridTile) return;
    loadedGridTile = next;
    const useDots = () => {
      grid.texture = gridTexture;
      gridTileSize = GRID_TEXTURE_SIZE;
      customGridTexture?.destroy(true);
      customGridTexture = null;
    };
    if (!next) return useDots();
    void next().then(
      (loaded) => {
        if (destroyed || loadedGridTile !== next) return;
        try {
          const tile = "default" in loaded && typeof loaded.default === "object" ? loaded.default : (loaded as ExplorerGridTileModule);
          if (!(tile.size > 0) || !Number.isFinite(tile.size)) throw new Error("`size` must be a positive number");
          const view = tile.draw(PIXI_KIT) as Container;
          const texture = app.renderer.generateTexture({
            target: view,
            frame: new Rectangle(0, 0, tile.size, tile.size),
            resolution: 2,
            antialias: true,
          });
          view.destroy({ children: true });
          customGridTexture?.destroy(true);
          customGridTexture = texture;
          grid.texture = texture;
          gridTileSize = tile.size;
          onBackdropReady?.();
        } catch (error) {
          console.warn("data-explorer: the grid tile failed to draw, so the dot grid is used.", error);
          useDots();
        }
      },
      (error: unknown) => {
        if (loadedGridTile !== next) return;
        console.warn("data-explorer: the grid tile module failed to load, so the dot grid is used.", error);
        useDots();
      },
    );
  }
  applyGridTile(options.background.grid.tile);

  const world = new Container();
  app.stage.addChild(world);
  // US071 — under every node, halos included (`createEdgeDrawer` inserts itself at index 0).
  const edgeDrawer = createEdgeDrawer(world);

  // US036 — the ownership halo: a soft, shape-matched glow drawn *behind* the node sprite, so an
  // owned item reads as "lit up" rather than merely "circled". Added before `itemLayer` so it sits
  // underneath every node regardless of draw order within a frame.
  // US071 — item glows, under the ownership halos and every node, above the edges.
  const glowLayer = new Container();
  world.addChild(glowLayer);

  const haloLayer = new Container();
  world.addChild(haloLayer);

  // Every item's body (its shape sprite, or a custom renderer's view) and its texture, in one layer
  // sorted by `zIndex` (`itemZ`): items stack in the order they are drawn, scene layer by scene
  // layer, so during a transition a custom view or an image from the scene beneath never sits above
  // the shapes of the scene in front (issue #5). Separate layers for shapes, textures and custom
  // views stacked by type instead.
  const itemLayer = new Container();
  itemLayer.sortableChildren = true;
  world.addChild(itemLayer);
  const textureStore = createTextureStore(options.textures.budget, () => onBackdropReady?.(), (url) => onTextureError?.(url));
  const customViews = createCustomViews(itemLayer);

  // US036 3R.2 D5 — the ownership accent ring, one layer above every item so it always reads as
  // "on top of" the item it marks, the same relationship `selectionRing` already has.

  const markLayer = new Container();
  world.addChild(markLayer);

  // A region's outline is stroked rather than ringed by a sprite (a ring texture cannot follow it):
  // the `ring` emphasis, hover and selection, redrawn each frame in world units at a constant width
  // on screen. Above every item, like the rings it stands in for.
  const regionStrokes = new Graphics();
  world.addChild(regionStrokes);

  const overlay = new Container();
  app.stage.addChild(overlay);

  const selectionRing = new Sprite(ringTexture);
  selectionRing.anchor.set(0.5);
  selectionRing.visible = false;
  world.addChild(selectionRing);

  // US036 3R.2 D6 — a subtle hover ring, distinct from the selection ring (a different tint and a
  // tighter scale), drawn for the currently-hovered node regardless of whether it's also selected.
  const hoverRing = new Sprite(ringTexture);
  hoverRing.anchor.set(0.5);
  hoverRing.visible = false;
  world.addChild(hoverRing);

  const labelLayer = new Container();
  overlay.addChild(labelLayer);

  const labelStyle = new TextStyle({
    fill: tokens.label,
    fontSize: 13,
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    fontWeight: "600",
    align: "center",
    stroke: { color: tokens.labelStroke, width: 4, join: "round" },
  });

  const spritePool: Sprite[] = [];
  /** Region fills, pooled in draw order like `spritePool`. Each is built once at a size of 1 × 1
   *  round (0, 0) and scaled to its box, so it is rebuilt only when it is given another outline. */
  const regionPool: Graphics[] = [];
  const regionBuiltFor: (number[][][][] | null | undefined)[] = [];
  const markRingPool: Sprite[] = [];
  const haloPool: Sprite[] = [];
  const glowPool: Sprite[] = [];
  const texturePool: Sprite[] = [];
  const labelPool: Text[] = [];
  const labelText: string[] = [];

  let nodes: RenderNode[] = [];
  let edges: readonly RenderEdge[] = [];
  let focusId: string | null = null;
  // When each id was first drawn (stagger included) — see `growScale`. Never reset by a scene swap:
  // a child revealed in its parent's preview has already grown, and must not grow again on entry.
  const firstDrawnAt = new Map<string, number>();
  let growing = false;
  // US071 — a `pulse` glow was drawn on screen last frame, so the next one is wanted too.
  let pulsing = false;
  let reducedMotion = false;
  // Presence (`DataExplorer`'s `presence` prop): the host's answer per id, and what is on screen,
  // eased towards it. `presenceMoving` keeps frames coming until every item has arrived.
  let presenceOf: ExplorerPresence | null = null;
  const shownPresence = new Map<string, number>();
  let presenceMoving = false;
  let lastPresenceFrameAt: number | null = null;
  let nodesById = new Map<string, RenderNode>();
  // The parent's nodes drawn around the current scene (`TransitionView.over`) that the layer marks
  // pointable — hoverable, selectable and hit-testable like the scene's own, but only where none of
  // the scene's own nodes is under the pointer.
  let around: RenderNode[] = [];
  let aroundById = new Map<string, RenderNode>();
  const findNode = (id: string) => nodesById.get(id) ?? aroundById.get(id);
  let selectedId: string | null = null;
  let hoveredId: string | null = null;

  const drawSamples: number[] = [];
  let lastDrawAt = 0;
  let fps = 0;
  const stats: RendererStats = {
    nodes: 0,
    edges: 0,
    draws: 0,
    textures: 0,
    customViews: 0,
    visible: 0,
    labels: 0,
    sprites: 0,
    lastDrawMs: 0,
    avgDrawMs: 0,
    fps: 0,
    backend: app.renderer.name,
    resolutionCap: cap,
    resolution,
    framebufferPixels: 0,
  };

  function acquireRegion(index: number, outline: number[][][][] | null): Graphics {
    let region = regionPool[index];
    if (!region) {
      region = new Graphics();
      regionPool[index] = region;
      regionBuiltFor[index] = undefined;
      itemLayer.addChild(region);
    }
    if (regionBuiltFor[index] !== outline) {
      region.clear();
      if (!outline) region.rect(-0.5, -0.5, 1, 1).fill(0xffffff);
      else
        for (const [edge, ...holes] of outline) {
          if (!edge) continue;
          region.poly(edge.flatMap(([u, v]) => [u! - 0.5, v! - 0.5])).fill(0xffffff);
          for (const hole of holes) region.poly(hole.flatMap(([u, v]) => [u! - 0.5, v! - 0.5])).cut();
        }
      regionBuiltFor[index] = outline;
    }
    return region;
  }

  /** Strokes `node`'s region outline (or its box) into `regionStrokes`, `widthPx` wide on screen,
   *  at `grow` of its size round its middle, as its fill is while it grows in. */
  function strokeRegion(node: RenderNode, widthPx: number, color: number, alpha: number, scale: number, grow = 1) {
    const stroke = { width: widthPx / scale, color, alpha, join: "round" as const };
    const w = node.width * grow;
    const h = node.height * grow;
    const left = node.x + (node.width - w) / 2;
    const top = node.y + (node.height - h) / 2;
    if (!node.outline) {
      regionStrokes.rect(left, top, w, h).stroke(stroke);
      return;
    }
    for (const polygon of node.outline)
      for (const ring of polygon) regionStrokes.poly(ring.flatMap(([u, v]) => [left + u! * w, top + v! * h])).stroke(stroke);
  }

  function acquireSprite(index: number): Sprite {
    let sprite = spritePool[index];
    if (!sprite) {
      sprite = new Sprite(discTexture);
      sprite.anchor.set(0.5);
      spritePool[index] = sprite;
      itemLayer.addChild(sprite);
    }
    return sprite;
  }

  function acquireMarkRing(index: number): Sprite {
    let ring = markRingPool[index];
    if (!ring) {
      ring = new Sprite(ringTexture);
      ring.anchor.set(0.5);
      markRingPool[index] = ring;
      markLayer.addChild(ring);
    }
    return ring;
  }

  function acquireHalo(index: number): Sprite {
    let halo = haloPool[index];
    if (!halo) {
      halo = new Sprite(discTexture);
      halo.anchor.set(0.5);
      haloPool[index] = halo;
      haloLayer.addChild(halo);
    }
    return halo;
  }

  function acquireTextured(index: number): Sprite {
    let sprite = texturePool[index];
    if (!sprite) {
      sprite = new Sprite(Texture.EMPTY);
      sprite.anchor.set(0.5);
      texturePool[index] = sprite;
      itemLayer.addChild(sprite);
    }
    return sprite;
  }

  function acquireGlow(index: number): Sprite {
    let glow = glowPool[index];
    if (!glow) {
      glow = new Sprite(glowTexture);
      glow.anchor.set(0.5);
      glowPool[index] = glow;
      glowLayer.addChild(glow);
    }
    return glow;
  }

  function acquireLabel(index: number): Text {
    let text = labelPool[index];
    if (!text) {
      text = new Text({ text: "", style: labelStyle, resolution });
      text.anchor.set(0.5, 0);
      labelPool[index] = text;
      labelText[index] = "";
      labelLayer.addChild(text);
    }
    return text;
  }

  function resize() {
    const vp = readViewport();
    app.renderer.resize(vp.width, vp.height, resolution);
    grid.width = vp.width;
    grid.height = vp.height;
    applyBackdrop();
  }

  /** A gradient drawn once into a small canvas at the view's aspect ratio, then stretched. The
   *  CSS angle convention: 0° points up, 90° right, and the line is long enough that both ends
   *  land on the corners, as `linear-gradient` does. */
  function gradientTexture(gradient: { from: number; to: number; angle: number }, vp: Viewport): Texture {
    const width = 256;
    const height = Math.max(1, Math.round((width * vp.height) / Math.max(1, vp.width)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const radians = (gradient.angle * Math.PI) / 180;
    const dx = Math.sin(radians);
    const dy = -Math.cos(radians);
    const half = (Math.abs(dx) * width + Math.abs(dy) * height) / 2;
    const fill = ctx.createLinearGradient(width / 2 - dx * half, height / 2 - dy * half, width / 2 + dx * half, height / 2 + dy * half);
    const css = (colour: number) => `#${colour.toString(16).padStart(6, "0")}`;
    fill.addColorStop(0, css(gradient.from));
    fill.addColorStop(1, css(gradient.to));
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, width, height);
    return Texture.from(canvas);
  }

  function dropBackgroundImage() {
    if (!backgroundImage) return;
    if (backgroundImage.sprite) {
      backdrop.removeChild(backgroundImage.sprite);
      backgroundImage.sprite.destroy();
    }
    backgroundImage.texture?.destroy(true);
    backgroundImage = null;
  }

  /** Loads with `crossOrigin = "anonymous"`: a canvas cannot use pixels from a host that does not
   *  allow it. A failure is reported once per URL and the image is simply left out. */
  function loadBackgroundImage(url: string) {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!backgroundImage || backgroundImage.url !== url || destroyed) return;
      backgroundImage.texture = Texture.from(image);
      applyBackdrop();
      onBackdropReady?.();
    };
    image.onerror = () => {
      if (failedImages.has(url)) return;
      failedImages.add(url);
      console.warn(`data-explorer: the background image ${url} could not be loaded (it must be same-origin or served with CORS headers), so it is left out.`);
    };
    image.src = url;
  }

  /** Brings the backdrop in line with the resolved options and the current viewport. */
  function applyBackdrop() {
    const vp = readViewport();
    const { gradient, image } = options.background;

    const key = gradient ? `${gradient.from}:${gradient.to}:${gradient.angle}:${vp.width}x${vp.height}` : "";
    if (key !== gradientKey) {
      if (gradientSprite.texture !== Texture.EMPTY) gradientSprite.texture.destroy(true);
      gradientSprite.texture = gradient ? gradientTexture(gradient, vp) : Texture.EMPTY;
      gradientSprite.visible = gradient !== null;
      gradientKey = key;
    }
    gradientSprite.width = vp.width;
    gradientSprite.height = vp.height;

    if (!image) {
      dropBackgroundImage();
      return;
    }
    if (!backgroundImage || backgroundImage.url !== image.url) {
      dropBackgroundImage();
      backgroundImage = { url: image.url, texture: null, sprite: null };
      loadBackgroundImage(image.url);
      return;
    }
    const texture = backgroundImage.texture;
    if (!texture) return; // still loading
    const wantTile = image.fit === "tile";
    if (!backgroundImage.sprite || (backgroundImage.sprite instanceof TilingSprite) !== wantTile) {
      if (backgroundImage.sprite) {
        backdrop.removeChild(backgroundImage.sprite);
        backgroundImage.sprite.destroy();
      }
      backgroundImage.sprite = wantTile ? new TilingSprite({ texture, width: vp.width, height: vp.height }) : new Sprite(texture);
      backdrop.addChild(backgroundImage.sprite);
    }
    const sprite = backgroundImage.sprite;
    sprite.alpha = image.alpha;
    if (sprite instanceof TilingSprite) {
      sprite.width = vp.width;
      sprite.height = vp.height;
    } else {
      const scale = Math.max(vp.width / texture.width, vp.height / texture.height);
      sprite.scale.set(scale);
      sprite.position.set((vp.width - texture.width * scale) / 2, (vp.height - texture.height * scale) / 2);
    }
  }

  /** Change the device-pixel-ratio cap at runtime — the lever A15 names for adaptive quality if
   *  the fixed per-draw cost ever bites on weaker hardware. Not wired to any control in
   *  production yet (there is no measured need); kept because the renderer already measures its
   *  own rolling draw cost, which is what such a control would key off. */
  function setResolutionCap(nextCap: number) {
    cap = nextCap;
    resolution = Math.min(window.devicePixelRatio || 1, cap);
    for (const text of labelPool) {
      labelLayer.removeChild(text);
      text.destroy();
    }
    labelPool.length = 0;
    labelText.length = 0;
    resize();
  }

  function draw(camera: Camera, transition: TransitionView | null = null) {
    if (!app.renderer) {
      return;
    }
    const t0 = performance.now();
    // Capped: after the canvas sat still, the first frame of a change must ease, not jump.
    const elapsedMs = lastPresenceFrameAt === null ? 0 : Math.min(t0 - lastPresenceFrameAt, MAX_PRESENCE_FRAME_MS);
    lastPresenceFrameAt = t0;
    growing = false;
    pulsing = false;
    presenceMoving = false;
    reducedMotion = prefersReducedMotion();
    if (shownPresence.size > MAX_REMEMBERED_IDS) shownPresence.clear();
    textureStore.beginFrame();
    customViews.begin();
    if (firstDrawnAt.size > MAX_REMEMBERED_IDS) firstDrawnAt.clear();
    const vp = readViewport();
    if (app.renderer.width !== vp.width || app.renderer.height !== vp.height) resize();
    const { growIn, halo: haloLook, ring: ringLook, hoverRing: hoverLook, selectionRing: selectionLook, glow: glowLook, pulse: pulseLook } = options.effects;
    const switches: GlowSwitches = { glow: glowLook.enabled, pulse: pulseLook.enabled, reducedMotion };

    const originScreenX = vp.width / 2 - camera.x * camera.scale;
    const originScreenY = vp.height / 2 - camera.y * camera.scale;
    world.scale.set(camera.scale);
    world.position.set(originScreenX, originScreenY);

    const gridLook = options.background.grid;
    let step = gridLook.step;
    let gridFade = 1;
    if (gridLook.zoom === "snap") {
      while (step * camera.scale < 36) step *= 4;
      while (step * camera.scale > 190) step /= 4;
    }
    const gridScreenStep = step * camera.scale;
    if (gridLook.zoom === "continuous") {
      // Too fine to read, the pattern fades out rather than aliasing.
      gridFade = Math.min(1, Math.max(0, (gridScreenStep - gridLook.minScreenStep / 2) / (gridLook.minScreenStep / 2)));
    }
    grid.visible = gridLook.visible && gridFade > 0;
    grid.alpha = gridLook.alpha * gridFade;
    grid.tileScale.set(gridScreenStep / gridTileSize);
    grid.tilePosition.set(originScreenX, originScreenY);

    const halfW = vp.width / 2 / camera.scale;
    const halfH = vp.height / 2 / camera.scale;
    const buffer = 120 / camera.scale;
    const left = camera.x - halfW - buffer;
    const right = camera.x + halfW + buffer;
    const top = camera.y - halfH - buffer;
    const bottom = camera.y + halfH + buffer;

    let spriteIndex = 0;
    let regionIndex = 0;
    const ringedRegions: { node: RenderNode; alpha: number; grow: number }[] = [];
    regionStrokes.clear();
    const labelCandidates: { node: RenderNode; diameter: number; alpha: number }[] = [];

    let markRingIndex = 0;
    let haloIndex = 0;
    let glowIndex = 0;
    let textureIndex = 0;
    let drawOrder = 0;

    // US071 — which items a custom renderer may draw this frame: all of them up to the cap, then the
    // nearest the middle of the view. Keyed by layer, since a preview can repeat an id.
    const isCustomCandidate = (node: RenderNode, opacity: number) =>
      node.kind !== null &&
      !node.aggregate &&
      opacity >= MIN_DRAWN_ALPHA &&
      node.x + node.width >= left &&
      node.x <= right &&
      node.y + node.height >= top &&
      node.y <= bottom &&
      customViews.has(node.kind);
    const customCandidates: { key: string; distance: number }[] = [];
    const considerLayer = (tag: string, layerNodes: readonly RenderNode[], alpha: (node: RenderNode) => number) => {
      for (const node of layerNodes) {
        if (!isCustomCandidate(node, alpha(node))) continue;
        customCandidates.push({ key: `${tag}:${node.id}`, distance: Math.hypot(node.x + node.width / 2 - camera.x, node.y + node.height / 2 - camera.y) });
      }
    };
    (transition?.under ?? []).forEach((layer, i) => considerLayer(`u${i}`, layer.nodes, layer.alpha));
    considerLayer("c", nodes, transition?.currentAlpha ?? (() => 1));
    if (transition?.over) considerLayer("o", transition.over.nodes, transition.over.alpha);
    const customAllowed = nearestFirst(customCandidates, options.customViews.max);

    /** One node, at `opacity` (a transition's multiplier — 1 outside one). Sprites are pooled in
     *  draw order, so calling this layer by layer is what stacks the layers. `tag` names the
     *  layer, for the custom-view cap. */
    function drawNode(node: RenderNode, opacity: number, decorated: boolean, tag: string) {
      if (opacity < MIN_DRAWN_ALPHA) return;
      const look = appearanceFor(node, currentRamp, switches);
      // The shape is drawn centred in the item's box: a square stretched to fill it (a rectangle, in a
      // box that is not square), a disc or cloud as big as fits. In a square box, the box itself.
      const side = Math.min(node.width, node.height);
      const spanX = look.shape === "square" ? node.width : side;
      const spanY = look.shape === "square" ? node.height : side;
      const spread = look.shape === "nebula" ? NEBULA_SPREAD : 1;
      const reach = (side * (spread - 1)) / 2;
      if (
        node.x + node.width + reach < left ||
        node.x - reach > right ||
        node.y + node.height + reach < top ||
        node.y - reach > bottom
      )
        return;

      let grow = 1;
      // Reduced motion: items appear at their size, without growing in (US071 AC5).
      if (growIn.enabled && !reducedMotion) {
        let shownAt = firstDrawnAt.get(node.id);
        if (shownAt === undefined) {
          shownAt = t0 + (hashId(node.id) % growIn.staggerMs);
          firstDrawnAt.set(node.id, shownAt);
        }
        grow = growScale(t0 - shownAt, growIn);
        if (grow < 1 || t0 - shownAt < growIn.durationMs) growing = true;
        if (grow <= 0) return; // still waiting out its stagger
      }

      // Presence scales and fades the item in place; its layout box never changes.
      if (presenceOf) {
        const target = clampPresence(presenceOf(node.id));
        const shown = easePresence(shownPresence.get(node.id) ?? target, target, elapsedMs, reducedMotion);
        shownPresence.set(node.id, shown);
        if (shown !== target) presenceMoving = true;
        const presence = presenceLook(shown);
        grow *= presence.scale;
        opacity *= presence.alpha;
      }

      const centreX = node.x + node.width / 2;
      const centreY = node.y + node.height / 2;
      const order = drawOrder++;

      // US071 — a custom renderer draws the item instead of its shape and texture. It returns false
      // (no module yet, no renderer for this kind, a throw, over the cap) and the shape is drawn.
      const custom =
        node.kind !== null &&
        customAllowed.has(`${tag}:${node.id}`) &&
        customViews.draw(
          node.kind,
          node,
          {
            size: grow * side,
            width: grow * node.width,
            height: grow * node.height,
            screenSize: side * camera.scale,
            opacity,
            hovered: hoveredId === node.id,
            selected: selectedId === node.id,
            timeMs: t0,
            tint: look.tint,
            texture: node.texture && decorated ? textureStore.textureFor(node.texture, "disc", side * camera.scale, options.textures.minDiameterPx) : null,
            reducedMotion,
          },
          (view) => {
            view.position.set(centreX, centreY);
            view.alpha = opacity;
            view.zIndex = itemZ(order, "body");
          },
        );
      if (!custom) drawShape();
      if (!decorated) return;

      function drawShape() {
        if (look.shape === "region") {
          const region = acquireRegion(regionIndex++, node.outline);
          region.visible = true;
          region.zIndex = itemZ(order, "body");
          region.position.set(centreX, centreY);
          region.scale.set(grow * node.width, grow * node.height);
          region.tint = look.tint!;
          region.alpha = (node.drillable ? 1 : 0.86) * opacity;
          return;
        }
        const sprite = acquireSprite(spriteIndex++);
        sprite.visible = true;
        sprite.rotation = 0;
        sprite.zIndex = itemZ(order, "body");
        sprite.position.set(centreX, centreY);
        // D4/Step 2 — a non-navigable aggregate draws hollow and muted whatever shape it declares, so
        // it can never be mistaken for a real, drillable item (ADR-016 Decision 3).
        if (look.shape === "aggregate") {
          sprite.texture = ringTexture;
          sprite.scale.set(grow * (side * 0.94) / DISC_TEXTURE_SIZE);
          sprite.tint = tokens.aggregate;
          sprite.alpha = 0.6 * opacity;
        } else if (look.shape === "nebula") {
          const hash = hashId(node.id);
          sprite.texture = nebulaTextures[hash % NEBULA_VARIANTS]!;
          sprite.rotation = ((hash >>> 8) % 628) / 100;
          sprite.scale.set(grow * (side * NEBULA_SPREAD) / NEBULA_TEXTURE_SIZE);
          // Coloured by its sets' mean year, on the same ramp as the sets themselves.
          sprite.tint = look.tint!;
          sprite.alpha = NEBULA_ALPHA * opacity;
        } else {
          sprite.texture = look.shape === "square" ? squareTexture : discTexture;
          sprite.scale.set((grow * spanX) / DISC_TEXTURE_SIZE, (grow * spanY) / DISC_TEXTURE_SIZE);
          // D4 — a dated set is tinted by its era ramp instead of the ordinary per-id hash; anything
          // without a recorded year (or that isn't a set at all) falls back to `nodeTint` unchanged.
          sprite.tint = look.tint!;
          sprite.alpha = (node.drillable ? 1 : 0.86) * opacity;
        }

        // US071 — the item's image over its shape, once big enough on screen and loaded. Until then
        // (and if it fails) the plain shape above is what shows.
        if (decorated && node.texture && (look.shape === "disc" || look.shape === "square")) {
          const texture = textureStore.textureFor(node.texture, look.shape, side * camera.scale, options.textures.minDiameterPx);
          if (texture) {
            const textured = acquireTextured(textureIndex++);
            textured.visible = true;
            textured.texture = texture;
            textured.zIndex = itemZ(order, "texture");
            textured.position.copyFrom(sprite.position);
            textured.scale.set((grow * side) / CROP_SIZE);
            textured.alpha = sprite.alpha;
          }
        }
      }

      // US071 — a glow in the item's own colour; a pulse breathes it, each item on its own phase.
      if (look.glow !== "none" && look.tint !== null) {
        let size = glowLook.scale;
        let alpha = glowLook.alpha;
        if (look.glow === "pulse") {
          const level = pulseLevel(t0 + (hashId(node.id) % pulseLook.periodMs), pulseLook.periodMs);
          size *= 1 + pulseLook.scaleBy * level;
          alpha *= pulseLook.alphaFloor + (1 - pulseLook.alphaFloor) * level;
          pulsing = true;
        }
        const glow = acquireGlow(glowIndex++);
        glow.visible = true;
        glow.position.set(centreX, centreY);
        glow.scale.set((grow * side * size) / GLOW_TEXTURE_SIZE);
        glow.tint = look.tint;
        glow.alpha = alpha * opacity;
      }

      // D5, restyled — a shape-matched outline plus a soft shape-matched halo behind it, for the
      // `ring` emphasis the adapter declares. Other marks are text, surfaced via the detail modal's
      // `rawMarks` only. An aggregate is drawn hollow above, so its ring (if any) is a disc.
      if (look.ring === "region") {
        ringedRegions.push({ node, alpha: opacity, grow });
      } else if (look.ring !== null) {
        const ringX = look.ring === "square" ? node.width : side;
        const ringY = look.ring === "square" ? node.height : side;
        if (haloLook.enabled) {
          const halo = acquireHalo(haloIndex++);
          halo.visible = true;
          halo.texture = textureForShape(look.ring);
          halo.position.set(centreX, centreY);
          halo.scale.set((grow * ringX * haloLook.scale) / DISC_TEXTURE_SIZE, (grow * ringY * haloLook.scale) / DISC_TEXTURE_SIZE);
          halo.tint = tokens.ownership;
          halo.alpha = haloLook.alpha * opacity;
        }

        const ring = acquireMarkRing(markRingIndex++);
        ring.visible = true;
        ring.texture = ringTextureForShape(look.ring);
        ring.position.set(centreX, centreY);
        ring.scale.set((grow * ringX * ringLook.scale) / DISC_TEXTURE_SIZE, (grow * ringY * ringLook.scale) / DISC_TEXTURE_SIZE);
        ring.tint = tokens.ownership;
        ring.alpha = opacity;
      }

      // A region is labelled inside itself, so its long side, not its short one, says whether a label fits.
      const diameter = (look.shape === "region" ? Math.max(node.width, node.height) : side) * camera.scale;
      if (diameter >= LABEL_MIN_DIAMETER_PX && opacity > 0.15 && grow > 0.6) labelCandidates.push({ node, diameter, alpha: opacity });
    }

    // US071 — edges first, under everything: each layer's own, at the alpha its nodes are drawn at.
    if (options.edges.visible) {
      const edgeLayers: EdgeLayer[] = [];
      for (const layer of transition?.under ?? []) if (layer.edges) edgeLayers.push({ nodes: layer.nodes, edges: layer.edges, alpha: layer.alpha, focusId: null });
      const currentAlphaFn = transition?.currentAlpha;
      edgeLayers.push({ nodes, edges, alpha: currentAlphaFn ?? (() => 1), focusId });
      if (transition?.over?.edges) edgeLayers.push({ nodes: transition.over.nodes, edges: transition.over.edges, alpha: transition.over.alpha, focusId: null });
      edgeDrawer.draw(edgeLayers, options.edges, tokens.label, camera.scale, { left, right, top, bottom });
    } else {
      edgeDrawer.draw([], options.edges, tokens.label, camera.scale, { left, right, top, bottom });
    }

    // Beneath: the children of the node being zoomed into, showing through its cloud. Then the
    // scene itself. Above: the parent just left, dissolving as a haze (`camera/transition.ts`).
    (transition?.under ?? []).forEach((layer, i) => {
      for (const node of layer.nodes) drawNode(node, layer.alpha(node), layer.decorated, `u${i}`);
    });
    const currentAlpha = transition?.currentAlpha;
    for (const node of nodes) drawNode(node, currentAlpha ? currentAlpha(node) : 1, true, "c");
    if (transition?.over) for (const node of transition.over.nodes) drawNode(node, transition.over.alpha(node), transition.over.decorated, "o");
    customViews.end();
    const over = transition?.over;
    around = over?.pointable ? over.nodes.filter((node) => over.pointable!(node) && over.alpha(node) > MIN_DRAWN_ALPHA) : [];
    aroundById = new Map(around.map((node) => [node.id, node]));

    for (let i = spriteIndex; i < spritePool.length; i++) spritePool[i]!.visible = false;
    for (let i = regionIndex; i < regionPool.length; i++) regionPool[i]!.visible = false;
    for (const { node, alpha, grow } of ringedRegions) strokeRegion(node, 3, tokens.ownership, alpha, camera.scale, grow);
    for (let i = markRingIndex; i < markRingPool.length; i++) markRingPool[i]!.visible = false;
    for (let i = haloIndex; i < haloPool.length; i++) haloPool[i]!.visible = false;
    for (let i = glowIndex; i < glowPool.length; i++) glowPool[i]!.visible = false;
    for (let i = textureIndex; i < texturePool.length; i++) texturePool[i]!.visible = false;

    // Biggest node first, then greedily drop any label that would overlap one already placed
    // (ADR-016 A14 — the ring-density label-collision bug the spike found and fixed here).
    labelCandidates.sort((a, b) => b.diameter - a.diameter);
    if (labelCandidates.length > MAX_LABELS) labelCandidates.length = MAX_LABELS;

    let labelIndex = 0;
    const placed: { left: number; right: number; top: number; bottom: number }[] = [];
    for (const { node, diameter, alpha } of labelCandidates) {
      const text = acquireLabel(labelIndex);
      const wanted =
        diameter >= SUBLABEL_MIN_DIAMETER_PX && node.sublabel
          ? `${node.label}\n${node.sublabel}`
          : node.label;
      if (labelText[labelIndex] !== wanted) {
        text.text = wanted;
        labelText[labelIndex] = wanted;
      }
      const { x: centreX, y: topY } = labelPosition(node, camera, vp, text.height);
      const halfWidth = text.width / 2 + 3;
      const rect = {
        left: centreX - halfWidth,
        right: centreX + halfWidth,
        top: topY - 2,
        bottom: topY + text.height + 2,
      };

      let collides = false;
      for (const other of placed) {
        if (
          rect.left < other.right &&
          rect.right > other.left &&
          rect.top < other.bottom &&
          rect.bottom > other.top
        ) {
          collides = true;
          break;
        }
      }
      if (collides) {
        text.visible = false;
        continue;
      }

      text.position.set(centreX, topY);
      text.alpha = alpha;
      text.visible = true;
      placed.push(rect);
      labelIndex++;
    }

    // D6 — the hovered node's label, unconditionally: bypasses `LABEL_MIN_DIAMETER_PX` and the
    // collision pass above (the whole point — the nodes too small to have earned a label are
    // exactly the ones a hover needs to name), reuses the next pool slot, and is moved to the top
    // of `labelLayer`'s own child order so it is never drawn under an already-placed label.
    const hovered = hoveredId ? findNode(hoveredId) : undefined;
    if (hovered) {
      const diameter = Math.min(hovered.width, hovered.height) * camera.scale;
      const text = acquireLabel(labelIndex);
      const wanted =
        diameter >= SUBLABEL_MIN_DIAMETER_PX && hovered.sublabel ? `${hovered.label}\n${hovered.sublabel}` : hovered.label;
      if (labelText[labelIndex] !== wanted) {
        text.text = wanted;
        labelText[labelIndex] = wanted;
      }
      const at = labelPosition(hovered, camera, vp, text.height);
      text.position.set(at.x, at.y);
      text.alpha = 1;
      text.visible = true;
      labelLayer.setChildIndex(text, labelLayer.children.length - 1);
      labelIndex++;
    }
    for (let i = labelIndex; i < labelPool.length; i++) labelPool[i]!.visible = false;

    const selected = selectedId ? findNode(selectedId) : undefined;
    if (selected && selectionLook.enabled && selected.shape === "region") {
      selectionRing.visible = false;
      strokeRegion(selected, 3, tokens.selection, 1, camera.scale);
    } else if (selected && selectionLook.enabled) {
      selectionRing.visible = true;
      fitRing(selectionRing, selected, selectionLook.scale);
      selectionRing.tint = tokens.selection;
    } else {
      selectionRing.visible = false;
    }

    if (hovered && hoverLook.enabled && hovered.shape === "region") {
      hoverRing.visible = false;
      strokeRegion(hovered, 2, tokens.hover, hoverLook.alpha, camera.scale);
    } else if (hovered && hoverLook.enabled) {
      hoverRing.visible = true;
      fitRing(hoverRing, hovered, hoverLook.scale);
      hoverRing.tint = tokens.hover;
      hoverRing.alpha = hoverLook.alpha;
    } else {
      hoverRing.visible = false;
    }

    app.render();

    const now = performance.now();
    const ms = now - t0;
    drawSamples.push(ms);
    if (drawSamples.length > 120) drawSamples.shift();
    if (lastDrawAt) {
      const delta = now - lastDrawAt;
      if (delta > 0) fps = fps ? fps * 0.9 + (1000 / delta) * 0.1 : 1000 / delta;
    }
    lastDrawAt = now;

    stats.nodes = nodes.length;
    stats.edges = edgeDrawer.drawn;
    stats.draws++;
    stats.textures = textureStore.held();
    stats.customViews = customViews.count();
    stats.visible = spriteIndex;
    stats.labels = labelIndex;
    stats.sprites = spritePool.length;
    stats.lastDrawMs = ms;
    stats.avgDrawMs = drawSamples.reduce((a, b) => a + b, 0) / drawSamples.length;
    stats.fps = fps;
    stats.resolutionCap = cap;
    stats.resolution = resolution;
    stats.framebufferPixels =
      Math.round(vp.width * resolution) * Math.round(vp.height * resolution);
  }

  /** Nearest node under a screen point, with a minimum touch radius so a small dot is still
   *  tappable on a phone. */
  /** US063 — re-reads the palette after the appearance changed and re-tints in place. Textures,
   *  pools, nodes, selection and the camera are untouched: the shape textures are white and tinted
   *  per draw, so only the handful of colour-bearing properties below need updating, and the next
   *  `draw()` picks up the rest from `tokens`. The caller schedules that draw. */
  /** US063, a prop since US070 Step 4 — re-tints the live canvas: no new scene, no camera reset. */
  function setPalette(next: ResolvedPalette) {
    tokens = next;
    app.renderer.background.color = options.background.color ?? tokens.background;
    grid.tint = options.background.grid.color ?? tokens.grid;
    labelStyle.fill = tokens.label;
    labelStyle.stroke = { color: tokens.labelStroke, width: 4, join: "round" };
  }

  /** US071 — the same in-place path as `setPalette`, for the resolved declarative options. The
   *  caller schedules the next draw. */
  function setOptions(next: ResolvedOptions) {
    options = next;
    app.renderer.background.color = options.background.color ?? tokens.background;
    grid.visible = options.background.grid.visible;
    grid.alpha = options.background.grid.alpha;
    grid.tint = options.background.grid.color ?? tokens.grid;
    applyGridTile(options.background.grid.tile);
    textureStore.setBudget(options.textures.budget);
    applyBackdrop();
  }

  /** Where a label's top middle goes on screen: inside a region, centred on its `labelAt` or the
   *  middle of its box; under anything else. */
  function labelPosition(node: RenderNode, camera: Camera, vp: Viewport, textHeight: number): ScreenPoint {
    const toScreenX = (x: number) => (x - camera.x) * camera.scale + vp.width / 2;
    const toScreenY = (y: number) => (y - camera.y) * camera.scale + vp.height / 2;
    if (node.shape === "region") {
      const at = node.labelAt ?? { x: 0.5, y: 0.5 };
      return { x: toScreenX(node.x + at.x * node.width), y: toScreenY(node.y + at.y * node.height) - textHeight / 2 };
    }
    return { x: toScreenX(node.x + node.width / 2), y: toScreenY(node.y + node.height) + 6 };
  }

  /** Places a hover or selection ring round `node`: a circle, or round a square-shaped item whose
   *  box is not square, a rectangle that follows it. */
  function fitRing(ring: Sprite, node: RenderNode, scale: number) {
    const stretched = node.shape === "square" && node.width !== node.height;
    const side = Math.min(node.width, node.height);
    ring.texture = stretched ? squareRingTexture : ringTexture;
    ring.position.set(node.x + node.width / 2, node.y + node.height / 2);
    ring.scale.set(((stretched ? node.width : side) * scale) / DISC_TEXTURE_SIZE, ((stretched ? node.height : side) * scale) / DISC_TEXTURE_SIZE);
  }

  function hitTest(camera: Camera, point: ScreenPoint, minRadiusPx = 22): RenderNode | null {
    return nearestUnder(nodes, camera, point, minRadiusPx) ?? nearestUnder(around, camera, point, minRadiusPx);
  }

  function nearestUnder(candidates: readonly RenderNode[], camera: Camera, point: ScreenPoint, minRadiusPx: number): RenderNode | null {
    const vp = readViewport();
    const worldX = (point.x - vp.width / 2) / camera.scale + camera.x;
    const worldY = (point.y - vp.height / 2) / camera.scale + camera.y;
    let best: RenderNode | null = null;
    let bestDistance = Infinity;
    for (const node of candidates) {
      if (!contains(node, worldX, worldY, minRadiusPx / camera.scale)) continue;
      const d = distanceToCentre(node, worldX, worldY);
      if (d < bestDistance) {
        best = node;
        bestDistance = d;
      }
    }
    return best;
  }

  return {
    app,
    stats,
    /** The current scene's nodes, and (US071) its edges and focus, which the edge cap keeps first. */
    setNodes(next: RenderNode[], nextEdges: readonly RenderEdge[] = [], nextFocusId: string | null = null) {
      nodes = next;
      edges = nextEdges;
      focusId = nextFocusId;
      nodesById = new Map(next.map((n) => [n.id, n]));
      if (selectedId && !findNode(selectedId)) selectedId = null;
      if (hoveredId && !findNode(hoveredId)) hoveredId = null;
      labelText.length = 0;
      for (const text of labelPool) text.visible = false;
    },
    setSelected(id: string | null) {
      selectedId = id;
    },
    getSelected() {
      return selectedId;
    },
    setHovered(id: string | null) {
      hoveredId = id;
    },
    draw,
    /** True while a node drawn last frame is still growing in, or (US071) a pulse is on screen —
     *  keep drawing until neither is. Never under reduced motion. */
    isAnimating: () => presenceMoving || wantsNextFrame({ growing, pulsingOnScreen: pulsing || customViews.animatedOnScreen(), reducedMotion }),
    /** US071 — the consumer's renderers module, once its lazy import resolves. */
    setRenderers(module: RendererModule<Container, RenderNode, Texture>) {
      customViews.setModule(module);
    },
    hitTest,
    setPalette,
    /** The colour ramp, applied live like the palette: items re-tint on the next draw, which the
     *  caller schedules. */
    setRamp(next: RampColours) {
      currentRamp = next;
    },
    /** Presence, applied live like the palette: no new scene, no new layout. The caller schedules the draw. */
    setPresence(next: ExplorerPresence | null) {
      presenceOf = next;
      if (!next) shownPresence.clear();
    },
    setOptions,
    resize,
    setResolutionCap,
    destroy() {
      destroyed = true;
      textureStore.destroy();
      customViews.destroy();
      customGridTexture?.destroy(true);
      app.destroy(true, { children: true, texture: true });
    },
  };
}

export type Renderer = Awaited<ReturnType<typeof createRenderer>>;
