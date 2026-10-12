// The view's declarative options and their defaults — US071 Step 1 (ADR-016 A25).
//
// Pure: no PixiJS, no DOM. A consumer passes partial, grouped options (`background`, `effects`);
// `resolveOptions` fills every gap with what the renderer drew before options existed, so a
// consumer that passes nothing sees no change at all (US071 AC1). The renderer reads only the
// resolved shape, never a module constant, and `options.test.ts` pins every default.

import { parseColour, type ExplorerColour } from "./colour";

/** The dot grid behind the scene. `false` hides it; an object restyles it. */
export type ExplorerGridOption = boolean | { alpha?: number; color?: ExplorerColour };

/** A linear gradient across the view. `angle` is in degrees, as in CSS: 180 (the default) runs
 *  from the top (`from`) to the bottom (`to`), 90 from left to right. */
export interface ExplorerGradient {
  /** The colour at the start of the gradient. */
  from: ExplorerColour;
  /** The colour at the end. */
  to: ExplorerColour;
  /** Degrees, as in CSS: 180 (the default) runs top to bottom, 90 left to right. */
  angle?: number;
}

/** An image behind the scene, fixed to the view. It is drawn on the canvas, so it must come from
 *  the same origin or from a host that sends CORS headers; if it fails to load it is left out. */
export interface ExplorerBackgroundImage {
  /** Same origin, or a host that sends CORS headers. */
  url: string;
  /** `cover` (the default) scales it to fill the view; `tile` repeats it at its own size. */
  fit?: "cover" | "tile";
  /** Opacity, 0 to 1; 1 by default. */
  alpha?: number;
}

/** Bottom to top: `color`, then `gradient`, then `image`, then the grid. */
export interface ExplorerBackground {
  /** Overrides `palette.background`. */
  color?: ExplorerColour;
  /** A linear gradient across the view, above `color`. */
  gradient?: ExplorerGradient | null;
  /** An image fixed to the view, above the gradient: a URL, or `{ url, fit, alpha }`. */
  image?: string | ExplorerBackgroundImage | null;
  /** The dot grid, on top: `false` hides it, `{ alpha, color }` restyles it. */
  grid?: ExplorerGridOption;
}

/** The built-in effects. Each defaults to on, as drawn before US071. */
export interface ExplorerEffects {
  /** A node grows from a dot to its size the first time it is drawn. */
  growIn?: boolean;
  /** The soft glow behind an item with the `ring` emphasis. The ring itself always draws. */
  halo?: boolean;
  /** The ring around the hovered item. */
  hoverRing?: boolean;
  /** The ring around the selected item. */
  selectionRing?: boolean;
  /** US071 — glows on items that ask for `glow` or `pulse`. Off means no glow at all. */
  glow?: boolean;
  /** US071 — whether a `pulse` breathes. Off (or `prefers-reduced-motion`) holds it as a still glow. */
  pulse?: boolean;
}

/** How an edge is stroked. Widths and dashes are screen pixels, whatever the zoom. */
export interface ExplorerEdgeStyle {
  /** Defaults to `palette.label`. */
  color?: ExplorerColour;
  /** Line width in screen pixels; 1.5 by default. */
  width?: number;
  /** Opacity, 0 to 1, multiplied by the lower opacity of the edge's two items; 0.5 by default. */
  alpha?: number;
  /** `[dash, gap]` in pixels, or `null` for a solid line. */
  dash?: [number, number] | null;
  /** Arrowheads: at the `targetId` end (`"end"`), the `sourceId` end, both, or none (the default). */
  arrow?: "none" | "start" | "end" | "both";
  /** Bows the edge sideways by this fraction of its length: 0 is straight, 0.2 a gentle arc. */
  curve?: number;
}

/** US071 — drawing a scene's edges. Off by default: before options existed, nothing drew them. */
export interface ExplorerEdges {
  /** Draw the scene's edges. Off by default. */
  visible?: boolean;
  /** The style every edge starts from. */
  style?: ExplorerEdgeStyle;
  /** Per edge `kind`, merged over `style`. */
  styles?: Record<string, ExplorerEdgeStyle>;
  /** The most edges drawn in one scene. Over it, edges to the scene's focus come first, and the
   *  outline says how many were left out. */
  max?: number;
}

/** US071 — item images on the canvas (`ExplorerNode.texture`). */
export interface ExplorerTextures {
  /** An item smaller than this on screen draws its plain shape and loads nothing. */
  minDiameterPx?: number;
  /** The most images held at once. The least recently drawn go first; past it, items draw shapes. */
  budget?: number;
}

/** US071 — items drawn by the `renderers` module. */
export interface ExplorerCustomViews {
  /** The most items drawn by custom renderers at once. Past it, the ones furthest from the middle
   *  of the view are drawn as their shape. */
  max?: number;
}

/** Every option group of the view, as `resolveOptions` (in `./headless`) takes them. Pass each as its own prop. */
export interface ExplorerOptions {
  /** What is behind the scene. */
  background?: ExplorerBackground;
  /** Built-in effects, each on by default. */
  effects?: ExplorerEffects;
  /** Drawing the scene's edges. */
  edges?: ExplorerEdges;
  /** Item images on the canvas. */
  textures?: ExplorerTextures;
  /** Items drawn by custom renderers. */
  customViews?: ExplorerCustomViews;
}

/** One edge style with every default filled in. */
export interface ResolvedEdgeStyle {
  /** `null` means "use `palette.label`". */
  color: number | null;
  /** Line width in screen pixels. */
  width: number;
  /** Opacity, 0 to 1. */
  alpha: number;
  /** `[dash, gap]` in screen pixels, or `null` for solid. */
  dash: [number, number] | null;
  /** Where arrowheads go. */
  arrow: "none" | "start" | "end" | "both";
  /** How far the edge bows sideways, as a fraction of its length (-1 to 1). */
  curve: number;
}

/** Every option with its default filled in: what the renderer draws with, and what `resolveOptions` returns. */
export interface ResolvedOptions {
  /** The resolved `background`. */
  background: {
    /** `null` means "use `palette.background`". */
    color: number | null;
    gradient: { from: number; to: number; angle: number } | null;
    image: { url: string; fit: "cover" | "tile"; alpha: number } | null;
    /** `color: null` means "use `palette.grid`". */
    grid: { visible: boolean; alpha: number; color: number | null };
  };
  /** The resolved `effects`, with each effect's sizes and timings. */
  effects: {
    growIn: { enabled: boolean; durationMs: number; staggerMs: number; startScale: number };
    halo: { enabled: boolean; scale: number; alpha: number };
    /** The `ring` emphasis outline, which is a mark, not an effect: it cannot be turned off. */
    ring: { scale: number };
    hoverRing: { enabled: boolean; scale: number; alpha: number };
    selectionRing: { enabled: boolean; scale: number };
    glow: { enabled: boolean; scale: number; alpha: number };
    pulse: { enabled: boolean; periodMs: number; scaleBy: number; alphaFloor: number };
  };
  /** The resolved `edges`. */
  edges: {
    visible: boolean;
    max: number;
    style: ResolvedEdgeStyle;
    /** Already merged over `style`. */
    styles: Record<string, ResolvedEdgeStyle>;
  };
  /** The resolved `textures`. */
  textures: { minDiameterPx: number; budget: number };
  /** The resolved `customViews`. */
  customViews: { max: number };
}

/** The most custom views drawn at once unless a consumer says otherwise — see the plan's Step 7
 *  measurements. */
export const DEFAULT_MAX_CUSTOM_VIEWS = 200;

/** The most edges one scene draws unless a consumer says otherwise. Measured at Step 4 (plan
 *  Step 4, desktop Chrome, 1,000 items): 500 curved, dashed, arrowed edges add ~5 ms a frame,
 *  the costliest style; 2,000 straight ones add under 1 ms. Dashes dominate. */
export const DEFAULT_MAX_EDGES = 500;

/** What the renderer drew before US071, as one value. `resolveOptions` copies it; never mutate it. */
export const DEFAULT_OPTIONS: ResolvedOptions = {
  background: { color: null, gradient: null, image: null, grid: { visible: true, alpha: 0.22, color: null } },
  effects: {
    growIn: { enabled: true, durationMs: 420, staggerMs: 320, startScale: 0.1 },
    halo: { enabled: true, scale: 1.7, alpha: 0.3 },
    ring: { scale: 1.24 },
    hoverRing: { enabled: true, scale: 1.15, alpha: 0.55 },
    selectionRing: { enabled: true, scale: 1.34 },
    // No item asked for an effect before US071, so these change nothing by default.
    glow: { enabled: true, scale: 2.4, alpha: 0.7 },
    pulse: { enabled: true, periodMs: 1800, scaleBy: 0.3, alphaFloor: 0.45 },
  },
  edges: {
    visible: false,
    max: DEFAULT_MAX_EDGES,
    style: { color: null, width: 1.5, alpha: 0.5, dash: null, arrow: "none", curve: 0 },
    styles: {},
  },
  // Each image is cropped to a 256 px square (256 KB of GPU memory), so 128 of them hold 32 MB.
  textures: { minDiameterPx: 48, budget: 128 },
  customViews: { max: DEFAULT_MAX_CUSTOM_VIEWS },
};

function unit(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.min(1, Math.max(0, value));
}

/** Fills every option in with its default: the values the view draws with when given `options`. For tests and tooling. */
export function resolveOptions(options: ExplorerOptions = {}): ResolvedOptions {
  const d = DEFAULT_OPTIONS;
  const background = options.background ?? {};
  const grid = background.grid ?? true;
  const effects = options.effects ?? {};
  return {
    background: {
      color: parseColour(background.color),
      gradient: resolveGradient(background.gradient),
      image: resolveImage(background.image),
      grid: {
        visible: grid !== false,
        alpha: typeof grid === "object" ? unit(grid.alpha, d.background.grid.alpha) : d.background.grid.alpha,
        color: typeof grid === "object" ? parseColour(grid.color) : null,
      },
    },
    effects: {
      growIn: { ...d.effects.growIn, enabled: effects.growIn ?? true },
      halo: { ...d.effects.halo, enabled: effects.halo ?? true },
      ring: { ...d.effects.ring },
      hoverRing: { ...d.effects.hoverRing, enabled: effects.hoverRing ?? true },
      selectionRing: { ...d.effects.selectionRing, enabled: effects.selectionRing ?? true },
      glow: { ...d.effects.glow, enabled: effects.glow ?? true },
      pulse: { ...d.effects.pulse, enabled: effects.pulse ?? true },
    },
    edges: resolveEdges(options.edges),
    textures: {
      minDiameterPx: positive(options.textures?.minDiameterPx, d.textures.minDiameterPx),
      budget:
        options.textures?.budget !== undefined && Number.isFinite(options.textures.budget)
          ? Math.max(0, Math.floor(options.textures.budget))
          : d.textures.budget,
    },
    customViews: {
      max:
        options.customViews?.max !== undefined && Number.isFinite(options.customViews.max)
          ? Math.max(0, Math.floor(options.customViews.max))
          : d.customViews.max,
    },
  };
}

function resolveEdges(edges: ExplorerEdges = {}): ResolvedOptions["edges"] {
  const d = DEFAULT_OPTIONS.edges;
  const style = resolveEdgeStyle(edges.style, d.style);
  const styles: Record<string, ResolvedEdgeStyle> = {};
  for (const kind of Object.keys(edges.styles ?? {}).sort()) styles[kind] = resolveEdgeStyle(edges.styles![kind], style);
  const max = edges.max !== undefined && Number.isFinite(edges.max) ? Math.max(0, Math.floor(edges.max)) : d.max;
  return { visible: edges.visible ?? d.visible, max, style, styles };
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveEdgeStyle(style: ExplorerEdgeStyle = {}, base: ResolvedEdgeStyle): ResolvedEdgeStyle {
  const color = style.color === undefined ? base.color : parseColour(style.color) ?? base.color;
  let dash = base.dash;
  if (style.dash === null) dash = null;
  else if (style.dash) dash = [positive(style.dash[0], 4), positive(style.dash[1], 4)];
  const arrows = ["none", "start", "end", "both"] as const;
  const arrow = style.arrow && arrows.includes(style.arrow) ? style.arrow : base.arrow;
  const curve = style.curve !== undefined && Number.isFinite(style.curve) ? Math.max(-1, Math.min(1, style.curve)) : base.curve;
  return { color, width: positive(style.width, base.width), alpha: unit(style.alpha, base.alpha), dash, arrow, curve };
}

/** The style an edge of `kind` is drawn with. */
export function edgeStyleFor(edges: ResolvedOptions["edges"], kind: string): ResolvedEdgeStyle {
  return edges.styles[kind] ?? edges.style;
}

/** A gradient with an unparseable end is left out entirely, rather than drawn half-defaulted. */
function resolveGradient(gradient: ExplorerGradient | null | undefined): ResolvedOptions["background"]["gradient"] {
  if (!gradient) return null;
  const from = parseColour(gradient.from);
  const to = parseColour(gradient.to);
  if (from === null || to === null) return null;
  const angle = gradient.angle !== undefined && Number.isFinite(gradient.angle) ? ((gradient.angle % 360) + 360) % 360 : 180;
  return { from, to, angle };
}

function resolveImage(image: string | ExplorerBackgroundImage | null | undefined): ResolvedOptions["background"]["image"] {
  if (!image) return null;
  const spec = typeof image === "string" ? { url: image } : image;
  if (!spec.url) return null;
  return { url: spec.url, fit: spec.fit === "tile" ? "tile" : "cover", alpha: unit(spec.alpha, 1) };
}

/** Equal resolved options draw identically, so the view re-applies options only when this changes. */
export function optionsKey(options: ResolvedOptions): string {
  return JSON.stringify(options);
}
