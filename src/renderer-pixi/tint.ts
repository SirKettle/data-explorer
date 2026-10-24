// The renderer's colour and shape choice, as pure functions — US070 plan Step 1.
//
// Split out of `renderer.ts` so the choice can be characterised under `happy-dom`: **this file
// must never import `pixi.js`** (it cannot initialise there, ADR-016 A18), which
// `architecture.test.ts` asserts. `renderer.ts` keeps the textures; this decides which one a node
// gets, its tint, and its ownership ring. Behaviour is byte-for-byte what `renderer.ts` did inline.

import type { RenderNode } from "../camera/scene-stack";
import type { ExplorerColour } from "../scene/types";
// `colour.ts` imports this module too; both only call each other's functions, never at load time.
import { parseColour } from "../colour";

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

/** One colour on a ramp: a bare colour, spaced evenly with the others, or placed `at` a position (0 to 1). */
export type RampStop = ExplorerColour | { color: ExplorerColour; at: number };

/** How a ramp blends the colours between two stops. */
export type RampInterpolation = "oklab" | "srgb" | "hsl";

/**
 * The colour ramp an item's `ramp` position is drawn on (US070 Step 4: a prop, not a constant):
 * colour `stops` from position 0 to position 1, blended in `interpolation`'s colour space. Two
 * stops make a two-tone scale, three a diverging one, and two stops at the same `at` a hard band
 * edge. A stop that does not parse is skipped; with none left, `DEFAULT_RAMP` applies.
 */
export interface RampColours {
  /** The colours, in order. Bare colours are spaced evenly, as in a CSS gradient; a stop's `at`
   *  places it (clamped to 0–1, and never before the stop ahead of it). One stop is a solid colour. */
  stops: readonly RampStop[];
  /**
   * How colours between stops are blended. `oklab` (the default) keeps the steps perceptually even
   * and avoids a muddy middle; `srgb` is a plain channel mix, what CSS gradients do by default;
   * `hsl` turns the hue the shorter way round between each pair of stops, for a sweep round the
   * colour wheel.
   */
  interpolation?: RampInterpolation;
}

/** The ramp used when a consumer passes none: red (0) through magenta, blue and cyan to green (1). */
export const DEFAULT_RAMP: RampColours = {
  stops: ["hsl(0 74% 58%)", "hsl(300 74% 58%)", "hsl(235 74% 64%)", "hsl(185 74% 58%)", "hsl(130 74% 58%)"],
  interpolation: "hsl",
};

/** How many colours a ramp is sampled into; a position takes the nearest, finer than the eye can
 *  tell. One more than a power of two, so halves and quarters land exactly on a sample. */
const RAMP_STEPS = 257;

/** Each ramp object, sampled once, so a draw colouring thousands of items never blends a colour. */
const sampledRamps = new WeakMap<RampColours, Uint32Array>();

/** The colour at position `t` (0 to 1, clamped) on `ramp`. */
export function rampColor(t: number, ramp: RampColours = DEFAULT_RAMP): number {
  let table = sampledRamps.get(ramp);
  if (!table) {
    table = sampleRamp(ramp);
    sampledRamps.set(ramp, table);
  }
  const clamped = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  return table[Math.round(clamped * (RAMP_STEPS - 1))]!;
}

interface PlacedStop {
  color: number;
  at: number;
}

/** The stops that parse, each with a position: as in a CSS gradient, an unplaced first or last stop
 *  sits at its end, unplaced ones between are spread evenly between their placed neighbours, and
 *  no stop sits before the one ahead of it. */
function placeStops(ramp: RampColours): PlacedStop[] {
  const stops: { color: number; at: number | null }[] = [];
  for (const stop of Array.isArray(ramp?.stops) ? ramp.stops : []) {
    const placed = typeof stop === "object" && stop !== null;
    const color = parseColour(placed ? stop.color : stop);
    if (color === null) continue;
    stops.push({ color, at: placed && Number.isFinite(stop.at) ? Math.min(1, Math.max(0, stop.at)) : null });
  }
  if (stops.length === 0) return [];
  if (stops[0]!.at === null) stops[0]!.at = 0;
  if (stops[stops.length - 1]!.at === null) stops[stops.length - 1]!.at = 1;
  let floor = 0;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i]!.at === null) {
      let j = i;
      while (stops[j]!.at === null) j++;
      const from = stops[i - 1]!.at!;
      const to = Math.max(from, stops[j]!.at!);
      for (let k = i; k < j; k++) stops[k]!.at = from + ((to - from) * (k - i + 1)) / (j - i + 1);
    }
    floor = Math.max(floor, stops[i]!.at!);
    stops[i]!.at = floor;
  }
  return stops as PlacedStop[];
}

function sampleRamp(ramp: RampColours): Uint32Array {
  const stops = placeStops(ramp);
  if (stops.length === 0) return ramp === DEFAULT_RAMP ? new Uint32Array(RAMP_STEPS).fill(0x808080) : sampleRamp(DEFAULT_RAMP);
  const mix = MIXERS[ramp?.interpolation ?? "oklab"] ?? MIXERS.oklab;
  const table = new Uint32Array(RAMP_STEPS);
  for (let i = 0; i < RAMP_STEPS; i++) {
    const t = i / (RAMP_STEPS - 1);
    const next = stops.findIndex((stop) => stop.at > t);
    if (next <= 0) {
      table[i] = (next === 0 ? stops[0] : stops[stops.length - 1])!.color;
      continue;
    }
    const a = stops[next - 1]!;
    const b = stops[next]!;
    table[i] = mix(a.color, b.color, (t - a.at) / (b.at - a.at));
  }
  return table;
}

type Triple = [number, number, number];
const toRgb = (c: number): Triple => [((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255];
function fromRgb([r, g, b]: Triple): number {
  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (x: Triple, y: Triple, t: number): Triple => [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)];

const MIXERS: Record<RampInterpolation, (a: number, b: number, t: number) => number> = {
  srgb: (a, b, t) => fromRgb(lerp3(toRgb(a), toRgb(b), t)),
  oklab: (a, b, t) => fromRgb(oklabToRgb(lerp3(rgbToOklab(toRgb(a)), rgbToOklab(toRgb(b)), t))),
  hsl(a, b, t) {
    const x = rgbToHsl(toRgb(a));
    const y = rgbToHsl(toRgb(b));
    // A grey has no hue of its own, so it takes its neighbour's rather than swinging through red.
    const from = x[1] === 0 ? y[0] : x[0];
    const to = y[1] === 0 ? x[0] : y[0];
    const turn = ((to - from + 540) % 360) - 180;
    return hslToRgbNumber(from + turn * t, lerp(x[1], y[1], t), lerp(x[2], y[2], t));
  },
};

function rgbToHsl([r, g, b]: Triple): Triple {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** sRGB to OKLab, with Björn Ottosson's published matrices. */
function rgbToOklab(rgb: Triple): Triple {
  const [r, g, b] = rgb.map(toLinear) as Triple;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, A, B]: Triple): Triple {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const linear: Triple = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((v) => toGamma(Math.max(0, Math.min(1, v)))) as Triple;
}

/** Value equality for ramps, so a consumer's inline `ramp={{ … }}` is not a change on every render. */
export function sameRamp(a: RampColours, b: RampColours): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
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
