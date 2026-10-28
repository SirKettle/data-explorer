import type { ExplorerRect } from "@data-xplorer/core";
import { CATALOGUE, type LegoSet, type Theme } from "./data";

/**
 * Where everything sits on the one giant baseplate, in studs. Nothing here knows about the
 * explorer beyond `ExplorerRect`: it is a stud layout, worked out once, bottom up.
 *
 * - A set is a brick whose footprint grows with its part count (`brickFor`).
 * - A theme is a plate just big enough for its bricks and its sub-themes' plates. The bricks are
 *   laid like masonry, butted up against each other, turned whichever way fits, and dropped into
 *   the gaps the bigger ones leave; each sub-theme's plate keeps a stud of clearance all round, and
 *   so does the plate's own edge.
 * - The root themes are packed the same way onto the baseplate, rounded up to whole 32 × 32 plates.
 *
 * Every box is in the same units (absolute studs), so a theme's scene can use its plate's box as
 * its `bounds` and its bricks land exactly where the plate was drawn, at the same stud size.
 */

/** A footprint in studs, long side first, by part count. Real brick sizes, up to a big plate. */
const BRICKS: { below: number; long: number; short: number }[] = [
  { below: 20, long: 1, short: 1 },
  { below: 50, long: 2, short: 1 },
  { below: 100, long: 2, short: 2 },
  { below: 200, long: 3, short: 2 },
  { below: 400, long: 4, short: 2 },
  { below: 800, long: 6, short: 2 },
  { below: 1500, long: 8, short: 2 },
  { below: 3000, long: 6, short: 4 },
  { below: Infinity, long: 8, short: 6 },
];

/** A set's brick, long side across: the packer may turn it. */
export function brickFor(set: Pick<LegoSet, "parts">): { w: number; h: number } {
  const { long, short } = BRICKS.find((brick) => set.parts < brick.below)!;
  return { w: long, h: short };
}

export interface PackItem<T> {
  item: T;
  w: number;
  h: number;
  /** Studs kept clear all round it; 0 lets neighbours butt up against it. */
  margin?: number;
  /** Whether it may be turned a quarter, to fit better. */
  turn?: boolean;
}

export interface Packed<T> {
  /** Where each item went, and its footprint as placed (turned, if it was). */
  placed: { item: T; x: number; y: number; w: number; h: number }[];
  width: number;
  height: number;
}

/**
 * Rectangles packed onto a stud grid, `pad` studs in from the edge: an occupancy grid, filled
 * biggest first, each item in the first free spot in reading order (top row first, then left to
 * right) where its whole footprint, margin included, is clear. A gap left round a big item is
 * still free, so a smaller one that fits it goes there before anything is added further down.
 * An item that may `turn` takes whichever way round comes first. The width is chosen from the
 * total area so the result comes out about `aspect` wide to high.
 */
export function pack<T>(items: readonly PackItem<T>[], pad: number, aspect = 1.5): Packed<T> {
  if (items.length === 0) return { placed: [], width: 2 * pad, height: 2 * pad };
  const area = items.reduce((sum, { w, h, margin = 0 }) => sum + (w + 2 * margin) * (h + 2 * margin), 0);
  const widest = Math.max(...items.map(({ w, h, turn, margin = 0 }) => (turn ? Math.min(w, h) : w) + 2 * margin));
  const columns = Math.max(widest, Math.ceil(Math.sqrt(area * aspect)));
  const order = items
    .map((entry, i) => ({ ...entry, i }))
    .sort((a, b) => b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h) || a.i - b.i);

  // One row of cells per stud down, added as the packing grows; 1 is taken.
  const rows: Uint8Array[] = [];
  const row = (y: number) => {
    while (rows.length <= y) rows.push(new Uint8Array(columns));
    return rows[y]!;
  };
  /** Rows above this are full: no search starts higher. */
  let firstOpen = 0;

  /** The first column at or after `x` in row `y`'s span `[x, x + w)` that is taken, or -1. */
  function blocked(x: number, y: number, w: number, h: number): number {
    for (let j = y; j < y + h; j++) {
      const cells = row(j);
      for (let i = x + w - 1; i >= x; i--) if (cells[i]) return i;
    }
    return -1;
  }

  /** The first spot in reading order where a `w` × `h` footprint is clear. */
  function firstFit(w: number, h: number): { x: number; y: number } {
    for (let y = firstOpen; ; y++) {
      for (let x = 0; x + w <= columns; ) {
        const taken = blocked(x, y, w, h);
        if (taken < 0) return { x, y };
        x = taken + 1; // nothing starting at or before the taken cell can fit
      }
    }
  }

  const placed: Packed<T>["placed"] = [];
  let width = 0;
  let height = 0;
  for (const { item, w, h, margin = 0, turn = false } of order) {
    const ways = turn && w !== h ? [{ w, h }, { w: h, h: w }] : [{ w, h }];
    let best: { x: number; y: number; w: number; h: number } | null = null;
    for (const way of ways) {
      if (way.w + 2 * margin > columns) continue;
      const at = firstFit(way.w + 2 * margin, way.h + 2 * margin);
      if (!best || at.y < best.y || (at.y === best.y && at.x < best.x)) best = { ...at, ...way };
    }
    const { x, y } = best!;
    const [rw, rh] = [best!.w + 2 * margin, best!.h + 2 * margin];
    for (let j = y; j < y + rh; j++) row(j).fill(1, x, x + rw);
    while (firstOpen < rows.length && rows[firstOpen]!.every(Boolean)) firstOpen++;
    width = Math.max(width, x + rw);
    height = Math.max(height, y + rh);
    placed.push({ item, x: x + margin + pad, y: y + margin + pad, w: best!.w, h: best!.h });
  }
  return { placed, width: width + 2 * pad, height: height + 2 * pad };
}

/** Studs kept clear round a sub-theme's plate on its parent's plate, and inside every plate's edge. */
const PLATE_MARGIN = 1;
/** Studs round the edge of the baseplate. */
const BASEPLATE_PAD = 3;
/** A baseplate's side in studs: the catalogue is a whole number of them. */
const BASEPLATE = 32;

type Entry = { kind: "theme"; theme: Theme } | { kind: "set"; set: LegoSet };

export interface Layout {
  /** The whole catalogue: a whole number of 32 × 32 baseplates. */
  baseplate: ExplorerRect;
  themeBox: Map<Theme, ExplorerRect>;
  setBox: Map<LegoSet, ExplorerRect>;
  /** How many 32 × 32 baseplates, across and down. */
  plates: { across: number; down: number };
}

export function layOut(roots: readonly Theme[]): Layout {
  // Bottom up: each theme's packing, in its own studs, from (0, 0).
  const local = new Map<Theme, Packed<Entry>>();
  function size(theme: Theme): { w: number; h: number } {
    const entries: PackItem<Entry>[] = [
      ...theme.children.map((child) => ({ item: { kind: "theme", theme: child } as Entry, ...size(child), margin: PLATE_MARGIN })),
      ...theme.sets.map((set) => ({ item: { kind: "set", set } as Entry, ...brickFor(set), turn: true })),
    ];
    const packed = pack(entries, PLATE_MARGIN);
    local.set(theme, packed);
    return { w: packed.width, h: packed.height };
  }
  const top = pack(
    roots.map((theme) => ({ item: theme, ...size(theme), margin: PLATE_MARGIN })),
    BASEPLATE_PAD,
  );
  const across = Math.ceil(top.width / BASEPLATE);
  const down = Math.ceil(top.height / BASEPLATE);
  const baseplate = { x: 0, y: 0, width: across * BASEPLATE, height: down * BASEPLATE };
  // Centred on the plates, on whole studs.
  const dx = Math.floor((baseplate.width - top.width) / 2);
  const dy = Math.floor((baseplate.height - top.height) / 2);

  // Top down: every local position made absolute.
  const themeBox = new Map<Theme, ExplorerRect>();
  const setBox = new Map<LegoSet, ExplorerRect>();
  function place(theme: Theme, x: number, y: number, width: number, height: number) {
    themeBox.set(theme, { x, y, width, height });
    for (const at of local.get(theme)!.placed) {
      if (at.item.kind === "set") setBox.set(at.item.set, { x: x + at.x, y: y + at.y, width: at.w, height: at.h });
      else place(at.item.theme, x + at.x, y + at.y, at.w, at.h);
    }
  }
  for (const at of top.placed) place(at.item, dx + at.x, dy + at.y, at.w, at.h);
  return { baseplate, themeBox, setBox, plates: { across, down } };
}

export const LAYOUT = layOut(CATALOGUE.roots);
