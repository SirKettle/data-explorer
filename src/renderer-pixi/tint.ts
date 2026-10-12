// The renderer's colour and shape choice, as pure functions — US070 plan Step 1.
//
// Split out of `renderer.ts` so the choice can be characterised under `happy-dom`: **this file
// must never import `pixi.js`** (it cannot initialise there, ADR-016 A18), which
// `architecture.test.ts` asserts. `renderer.ts` keeps the textures; this decides which one a node
// gets, its tint, and its ownership ring. Behaviour is byte-for-byte what `renderer.ts` did inline.

import type { RenderNode } from "../camera/scene-stack";
import type { ExplorerColour } from "../scene/types";

export function hslToRgbNumber(h: number, s: number, l: number): number {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)));
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

/** FNV-1a — deterministic per-id "hue" so a node's colour never changes across scene reloads
 *  without needing to store a hue anywhere (the scene model carries no such field). */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hueForId(id: string, shape: RenderNode["shape"]): number {
  // Clouds read as one family (blues through violets), matching the spike's own palette and
  // giving shape a second, colour signal even when a scene mixes clouds and discs.
  if (shape === "cloud") return 200 + (hashId(id) % 70);
  return hashId(id) % 360;
}

export function nodeTint(node: RenderNode): number {
  const hue = hueForId(node.id, node.shape);
  if (node.shape === "cloud") return hslToRgbNumber(hue, 0.6, 0.66);
  if (node.shape === "disc") return hslToRgbNumber(hue, 0.68, 0.62);
  return hslToRgbNumber(hue, 0.45, 0.74);
}

/**
 * The colour ramp an item's `ramp` position is drawn on (US070 Step 4: a prop, not a constant). A
 * hue sweep rather than a lightness change, because a data-encoding channel needs endpoints far
 * apart, which a swappable brand palette cannot promise. `fromHue` is position 0 and `toHue`
 * position 1; going from 360 down to 130 sweeps red → magenta → blue → cyan → green.
 */
export interface RampColours {
  /** The hue (degrees) at position 0. */
  fromHue: number;
  /** The hue at position 1; it may run past 360 to sweep the other way round. */
  toHue: number;
  /** HSL saturation, 0 to 1. */
  saturation: number;
  /** HSL lightness, 0 to 1. */
  lightness: number;
}

/** The ramp used when a consumer passes none: red (0) through blue to green (1). */
export const DEFAULT_RAMP: RampColours = { fromHue: 360, toHue: 130, saturation: 0.74, lightness: 0.58 };

export function rampColor(t: number, ramp: RampColours = DEFAULT_RAMP): number {
  const hue = ramp.fromHue + (ramp.toHue - ramp.fromHue) * t;
  // Pure blues read darker than the rest at the same HSL lightness; lift them a little.
  const blueLift = 0.06 * Math.max(0, 1 - Math.abs(hue - 235) / 45);
  return hslToRgbNumber(hue, ramp.saturation, ramp.lightness + blueLift);
}

/**
 * The surface's base colours — a prop of the view (US070 Step 4 / A24 clause 6), so the renderer
 * never reads a consumer's CSS. Each is a `0xRRGGBB` number or a CSS colour string (US072 review
 * change 5, like every other colour); a value that does not parse falls back to
 * `FALLBACK_PALETTE`'s. Pass a new object when they change, and the live canvas re-tints.
 */
export interface ExplorerPalette {
  /** Behind everything (unless `background.color` overrides it). */
  background: ExplorerColour;
  /** The dot grid (unless `background.grid.color` overrides it). */
  grid: ExplorerColour;
  /** Item labels, and edges unless styled. */
  label: ExplorerColour;
  /** The outline behind label text, for contrast against the scene. */
  labelStroke: ExplorerColour;
  /** The ring round the selected item. */
  selection: ExplorerColour;
  /** The `ring` emphasis colour. */
  ownership: ExplorerColour;
  /** The muted fill/stroke of a non-navigable aggregate. */
  aggregate: ExplorerColour;
  /** The hover ring — deliberately not an accent colour, so it never reads as one more meaning. */
  hover: ExplorerColour;
}

/** A palette with every colour resolved to `0xRRGGBB`: what the renderer draws with. */
export type ResolvedPalette = { [K in keyof ExplorerPalette]: number };

/** A dark palette for a consumer that passes none, and for environments without a document. */
export const FALLBACK_PALETTE: ResolvedPalette = {
  background: 0x0b0e13,
  grid: 0x8ea2c0,
  label: 0xeef3fa,
  labelStroke: 0x05070b,
  selection: 0xffffff,
  ownership: 0x93c5fd,
  aggregate: 0x8ea2c0,
  hover: 0xeef3fa,
};

/** Which texture family a node is drawn with. `aggregate` is the hollow, muted ring a
 *  non-navigable overflow cluster gets (ADR-016 Decision 3). */
export type NodeShape = "aggregate" | "nebula" | "square" | "disc";

/** How the canvas draws one item. */
export interface NodeAppearance {
  /** Which texture family: `aggregate` is the hollow ring of an aggregate cluster, `nebula` a cloud. */
  shape: NodeShape;
  /** The sprite tint, or `null` for an aggregate, which takes the `aggregate` token instead. */
  tint: number | null;
  /** The ownership halo/ring's shape, or `null` when the node carries no ring. */
  ring: "square" | "disc" | null;
  /** US071 — the item's glow: `pulse` breathes, `static` holds still, `none` draws nothing. */
  glow: "none" | "static" | "pulse";
}

/** US071 — the switches and the motion preference the glow choice depends on. */
export interface GlowSwitches {
  /** Whether glows are drawn at all (`effects.glow`). */
  glow: boolean;
  /** Whether a pulse breathes (`effects.pulse`). */
  pulse: boolean;
  /** Whether the viewer asked for less motion. */
  reducedMotion: boolean;
}

const ALL_EFFECTS: GlowSwitches = { glow: true, pulse: true, reducedMotion: false };

/** `pulse` breathes only when pulses are on and motion is allowed; otherwise it holds as a glow. */
export function glowFor(node: RenderNode, switches: GlowSwitches = ALL_EFFECTS): NodeAppearance["glow"] {
  if (node.aggregate || !switches.glow) return "none";
  if (node.effects.includes("pulse")) return switches.pulse && !switches.reducedMotion ? "pulse" : "static";
  return node.effects.includes("glow") ? "static" : "none";
}

/** The shape, colour, ring and glow the canvas uses for an item, without drawing anything. For tests and tooling. */
export function appearanceFor(node: RenderNode, ramp: RampColours = DEFAULT_RAMP, switches: GlowSwitches = ALL_EFFECTS): NodeAppearance {
  const ringed = node.emphasis.includes("ring");
  // An aggregate is drawn as a hollow disc, so its ring (if any) is a disc too.
  const ring = ringed ? (!node.aggregate && node.shape === "square" ? "square" : "disc") : null;
  const glow = glowFor(node, switches);
  if (node.aggregate) return { shape: "aggregate", tint: null, ring, glow };
  // US071 — an item's own colour wins over its ramp position, which wins over the per-id tint.
  const tint = node.color !== null ? node.color : node.ramp !== null ? rampColor(node.ramp, ramp) : nodeTint(node);
  if (node.shape === "cloud") return { shape: "nebula", tint, ring, glow };
  return { shape: node.shape, tint, ring, glow };
}
