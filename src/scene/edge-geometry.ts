// Edge geometry — US071 Step 4 (ADR-016 A25).
//
// Pure numbers, so it is tested without WebGL and the renderer only strokes what it is given. An
// edge runs between the rims of its two items' circles: straight, or a quadratic curve bowed to
// one side. Dashes and arrowheads are computed here in world units; the renderer converts screen
// pixels to world units before asking.

export interface Point {
  x: number;
  y: number;
}

export interface Circle extends Point {
  r: number;
}

/** A quadratic Bézier from `start` to `end` through `control`; a straight edge has its control
 *  at the midpoint. */
export interface EdgeCurve {
  start: Point;
  control: Point;
  end: Point;
}

/**
 * The visible part of an edge between two circles, trimmed to their rims. `curve` bows it
 * sideways by that fraction of the centre distance (positive to the left of `a → b`, so two
 * edges between the same pair in opposite directions part instead of overlapping). `null` when
 * the circles overlap and there is nothing between them to draw.
 */
export function edgeCurve(a: Circle, b: Circle, curve = 0): EdgeCurve | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= a.r + b.r) return null;
  const control = {
    x: (a.x + b.x) / 2 - (dy / distance) * curve * distance,
    y: (a.y + b.y) / 2 + (dx / distance) * curve * distance,
  };
  // Leave each circle towards the control point, which is where the curve itself heads.
  return { start: towards(a, control, a.r), control, end: towards(b, control, b.r) };
}

function towards(from: Point, to: Point, by: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / length) * by, y: from.y + (dy / length) * by };
}

export function pointAt({ start, control, end }: EdgeCurve, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
    y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
  };
}

/** The curve as a polyline, `segments` long (1 for a straight edge). */
export function polyline(curve: EdgeCurve, segments: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= segments; i++) points.push(pointAt(curve, i / segments));
  return points;
}

/** The curve cut short by `fromStart` and `fromEnd` world units, measured along it — where an
 *  arrowhead sits, so the stroke does not show through its tip. `null` if nothing is left. */
export function shorten(points: readonly Point[], fromStart: number, fromEnd: number): Point[] | null {
  const lengths = cumulative(points);
  const total = lengths[lengths.length - 1]!;
  if (fromStart + fromEnd >= total) return null;
  return slice(points, lengths, fromStart, total - fromEnd);
}

/**
 * Dashes along a polyline: `[on, off]` in world units, starting with a dash at the line's start.
 * `within`, a distance range along the line, limits the work to that stretch (the part on
 * screen) without moving the pattern, so dashes do not crawl as the view pans.
 */
export function dashes(points: readonly Point[], on: number, off: number, within?: readonly [number, number]): Point[][] {
  if (on <= 0) return [];
  if (off <= 0) return [points.slice()];
  const lengths = cumulative(points);
  const total = lengths[lengths.length - 1]!;
  const [lo, hi] = within ? [Math.max(0, within[0]), Math.min(total, within[1])] : [0, total];
  const period = on + off;
  const out: Point[][] = [];
  for (let from = Math.floor(lo / period) * period; from < hi; from += period) {
    const to = Math.min(total, from + on);
    if (to > lo) out.push(slice(points, lengths, from, to));
  }
  return out;
}

/** The stretch of a polyline, as distances along it, that lies inside a box: from the first point
 *  of entry to the last point of exit (a curve that leaves and comes back counts the gap too).
 *  `null` when no part of it is inside. Liang-Barsky clipping, one segment at a time. */
export function rangeInBox(points: readonly Point[], box: { left: number; right: number; top: number; bottom: number }): [number, number] | null {
  let from = Infinity;
  let to = -Infinity;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    let t0 = 0;
    let t1 = 1;
    let inside = true;
    for (const [p, q] of [[-dx, a.x - box.left], [dx, box.right - a.x], [-dy, a.y - box.top], [dy, box.bottom - a.y]] as const) {
      if (p === 0) {
        if (q < 0) inside = false;
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (inside && t0 <= t1) {
      from = Math.min(from, walked + t0 * length);
      to = Math.max(to, walked + t1 * length);
    }
    walked += length;
  }
  return from <= to ? [from, to] : null;
}

/** A filled triangle whose tip is `tip`, pointing away from `from`. */
export function arrowhead(tip: Point, from: Point, length: number, width: number): [Point, Point, Point] {
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const baseX = tip.x - ux * length;
  const baseY = tip.y - uy * length;
  return [
    { x: tip.x, y: tip.y },
    { x: baseX - uy * (width / 2), y: baseY + ux * (width / 2) },
    { x: baseX + uy * (width / 2), y: baseY - ux * (width / 2) },
  ];
}

/** Whether a polyline's bounding box meets a rectangle — enough to cull an edge off screen. */
export function meetsBox(points: readonly Point[], box: { left: number; right: number; top: number; bottom: number }): boolean {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of points) {
    if (p.x < left) left = p.x;
    if (p.x > right) right = p.x;
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  return right >= box.left && left <= box.right && bottom >= box.top && top <= box.bottom;
}

function cumulative(points: readonly Point[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  return lengths;
}

/** The part of a polyline between two distances along it. */
function slice(points: readonly Point[], lengths: readonly number[], from: number, to: number): Point[] {
  const at = (distance: number): Point => {
    let i = 1;
    while (i < lengths.length - 1 && lengths[i]! < distance) i++;
    const span = lengths[i]! - lengths[i - 1]! || 1;
    const t = (distance - lengths[i - 1]!) / span;
    return { x: points[i - 1]!.x + (points[i]!.x - points[i - 1]!.x) * t, y: points[i - 1]!.y + (points[i]!.y - points[i - 1]!.y) * t };
  };
  const out = [at(from)];
  for (let i = 0; i < points.length; i++) if (lengths[i]! > from && lengths[i]! < to) out.push(points[i]!);
  out.push(at(to));
  return out;
}

/**
 * The edges a scene draws under a cap: all of them when they fit, otherwise the ones touching the
 * scene's focus first, in order, then the rest, until `max`. `omitted` is how many were left out,
 * which the outline states, so a capped scene never looks complete.
 */
export function capEdges<E extends { sourceId: string; targetId: string }>(edges: readonly E[], focusId: string | null | undefined, max: number): { drawn: E[]; omitted: number } {
  if (edges.length <= max) return { drawn: edges.slice(), omitted: 0 };
  const touching = focusId ? edges.filter((e) => e.sourceId === focusId || e.targetId === focusId) : [];
  const rest = focusId ? edges.filter((e) => e.sourceId !== focusId && e.targetId !== focusId) : edges.slice();
  const drawn = [...touching, ...rest].slice(0, max);
  return { drawn, omitted: edges.length - drawn.length };
}
