import type { ExplorerShape } from "./types";

/**
 * What is under a point, and how much of the view an item fills: the one answer every pointer,
 * zoom and sideways-move test asks for, so they never disagree with each other or with what is
 * drawn. Pure, in world units; imports only `./types`.
 */

/** An item's box (left, top, width, height) and the shape drawn in it. */
export interface ShapedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: ExplorerShape;
  /** A `region`'s outline, relative to the box: (0, 0) its top left, (1, 1) its bottom right (see
   *  `relativeOutline`). Absent, a region is its whole box. */
  outline?: number[][][][] | null;
}

/**
 * Whether the point (`px`, `py`) is inside the item as drawn: a `square` fills its box, a `region`
 * is its outline (or its whole box), and a `disc` or `cloud` is the largest circle that fits it,
 * centred. `minRadius` is a smallest target: an item smaller than a circle of that radius also
 * counts anywhere in that circle round its centre, so it stays easy to point at. A bigger item is
 * only its shape, so a hole in the middle of a region is never hit.
 */
export function contains(box: ShapedBox, px: number, py: number, minRadius = 0): boolean {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const distance = Math.hypot(px - cx, py - cy);
  if (distance <= minRadius && Math.min(box.width, box.height) / 2 < minRadius) return true;
  if (box.shape === "square" || box.shape === "region") {
    const inBox = px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height;
    if (!inBox || box.shape === "square" || !box.outline) return inBox;
    return insideOutline(box.outline, (px - box.x) / box.width, (py - box.y) / box.height);
  }
  return distance <= Math.min(box.width, box.height) / 2;
}

/** Whether (`u`, `v`) is inside any polygon of `outline`: inside its first ring, and in none of its
 *  holes. */
function insideOutline(outline: readonly (readonly (readonly (readonly number[])[])[])[], u: number, v: number): boolean {
  return outline.some((polygon) => polygon.length > 0 && insideRing(polygon[0]!, u, v) && !polygon.slice(1).some((hole) => insideRing(hole, u, v)));
}

/** Even-odd crossing test against one closed ring. */
function insideRing(ring: readonly (readonly number[])[], u: number, v: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > v !== yj! > v && u < ((xj! - xi!) * (v - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

/** `outline`, given in the same units as `box`, made relative to the box: (0, 0) its top left and
 *  (1, 1) its bottom right, so it moves and scales with the box wherever the box is placed. */
export function relativeOutline(outline: readonly (readonly (readonly (readonly number[])[])[])[], box: { x: number; y: number; width: number; height: number }): number[][][][] {
  return outline.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [(x! - box.x) / box.width, (y! - box.y) / box.height])));
}

/** The distance from the point to the item's centre: among items that contain a point, the nearest
 *  centre wins, so a small item drawn over a big one is the one you get. */
export function distanceToCentre(box: Pick<ShapedBox, "x" | "y" | "width" | "height">, px: number, py: number): number {
  return Math.hypot(px - (box.x + box.width / 2), py - (box.y + box.height / 2));
}

/**
 * How much of a `viewWidth` × `viewHeight` view the box fills at `scale`: its on-screen size over
 * the view's along whichever axis it fills more. For a square box, its side over the view's smaller
 * dimension; 1 means it just fits, the same measure `cameraFillingBox` frames by.
 */
export function fillFraction(box: Pick<ShapedBox, "width" | "height">, scale: number, viewWidth: number, viewHeight: number): number {
  return Math.max((box.width * scale) / viewWidth, (box.height * scale) / viewHeight);
}
