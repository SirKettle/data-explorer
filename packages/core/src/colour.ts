// Colour values at the package boundary — US071 Step 3 (story Q3: numbers and CSS strings both).
//
// Pure: no DOM, so it runs under `happy-dom` and in a worker alike. A colour is accepted as a
// `0xRRGGBB` number (as `palette` always has been) or as a CSS string, converted once here, and
// the renderer only ever sees numbers. Alpha in a CSS string is ignored: the explorer sets its own
// transparency per layer.

import { FALLBACK_PALETTE, hslToRgbNumber, type ExplorerPalette, type ResolvedPalette } from "./renderer-pixi/tint";
import type { ExplorerColour } from "./scene/types";

export type { ExplorerColour };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const FUNCTION = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i;

function channel(part: string, max: number): number | null {
  const percent = part.endsWith("%");
  const value = Number.parseFloat(percent ? part.slice(0, -1) : part);
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(0, percent ? (value / 100) * max : value));
}

/**
 * `0xRRGGBB` for a number in range, `#rgb`, `#rrggbb`, `rgb()`/`rgba()` or `hsl()`/`hsla()` (comma
 * or space separated); `null` for anything else, which callers treat as "not set". Named colours
 * (`"tomato"`) are not supported: they would need a 148-entry table for a convenience a hex code
 * already gives.
 */
export function parseColour(value: ExplorerColour | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 && value <= 0xffffff ? value : null;
  const text = value.trim();
  const hex = HEX.exec(text);
  if (hex) {
    const digits = hex[1]!.length === 3 ? [...hex[1]!].map((d) => d + d).join("") : hex[1]!;
    return Number.parseInt(digits, 16);
  }
  const fn = FUNCTION.exec(text);
  if (!fn) return null;
  const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  if (fn[1]!.toLowerCase().startsWith("rgb")) {
    const [r, g, b] = parts.slice(0, 3).map((p) => channel(p, 255));
    if (r === null || g === null || b === null) return null;
    return (Math.round(r!) << 16) | (Math.round(g!) << 8) | Math.round(b!);
  }
  const h = Number.parseFloat(parts[0]!.replace(/deg$/i, ""));
  const s = channel(parts[1]!.endsWith("%") ? parts[1]! : `${parts[1]}%`, 1);
  const l = channel(parts[2]!.endsWith("%") ? parts[2]! : `${parts[2]}%`, 1);
  if (!Number.isFinite(h) || s === null || l === null) return null;
  return hslToRgbNumber(h, s, l);
}

/** Every palette colour as `0xRRGGBB`; one that does not parse takes `FALLBACK_PALETTE`'s. */
export function resolvePalette(palette: ExplorerPalette): ResolvedPalette {
  const resolved = { ...FALLBACK_PALETTE };
  for (const key of Object.keys(FALLBACK_PALETTE) as (keyof ResolvedPalette)[]) resolved[key] = parseColour(palette[key]) ?? FALLBACK_PALETTE[key];
  return resolved;
}
