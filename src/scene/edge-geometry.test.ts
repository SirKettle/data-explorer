import { describe, expect, test } from "bun:test";
import { arrowhead, capEdges, dashes, edgeCurve, meetsBox, pointAt, polyline, rangeInBox, shorten } from "./edge-geometry";

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("edge geometry (US071 AC2)", () => {
  test("a straight edge runs rim to rim, with its control point at the middle", () => {
    const curve = edgeCurve({ x: 0, y: 0, r: 10 }, { x: 100, y: 0, r: 20 })!;
    expect(curve.start).toEqual({ x: 10, y: 0 });
    expect(curve.end).toEqual({ x: 80, y: 0 });
    expect(curve.control).toEqual({ x: 50, y: 0 });
  });

  test("overlapping or touching circles have no edge to draw", () => {
    expect(edgeCurve({ x: 0, y: 0, r: 10 }, { x: 15, y: 0, r: 10 })).toBeNull();
    expect(edgeCurve({ x: 0, y: 0, r: 10 }, { x: 20, y: 0, r: 10 })).toBeNull();
  });

  test("a curve bows to the left of a → b, so opposite edges between one pair part", () => {
    const there = edgeCurve({ x: 0, y: 0, r: 1 }, { x: 100, y: 0, r: 1 }, 0.2)!;
    const back = edgeCurve({ x: 100, y: 0, r: 1 }, { x: 0, y: 0, r: 1 }, 0.2)!;
    expect(there.control).toEqual({ x: 50, y: 20 });
    expect(back.control.y).toBe(-20);
    // It leaves each rim heading towards the control point, so the start sits on the circle.
    expect(close(Math.hypot(there.start.x, there.start.y), 1)).toBe(true);
    // The midpoint of a quadratic: a quarter of each end plus half the control point.
    expect(pointAt(there, 0.5).y).toBeCloseTo(0.25 * there.start.y + 0.5 * 20 + 0.25 * there.end.y);
  });

  test("polyline, shorten and dashes measure along the curve", () => {
    const line = polyline(edgeCurve({ x: 0, y: 0, r: 0.0001 }, { x: 100, y: 0, r: 0.0001 })!, 1);
    const cut = shorten(line, 10, 5)!;
    expect(cut[0]!.x).toBeCloseTo(10);
    expect(cut[cut.length - 1]!.x).toBeCloseTo(95);
    expect(shorten(line, 60, 60)).toBeNull();
    const runs = dashes(line, 10, 15);
    expect(runs).toHaveLength(4); // starts at 0, 25, 50 and 75
    expect(runs[1]![0]!.x).toBeCloseTo(25);
    expect(runs[1]![runs[1]!.length - 1]!.x).toBeCloseTo(35);
    expect(dashes(line, 0, 5)).toEqual([]);
    expect(dashes(line, 5, 0)).toEqual([line]);
  });

  test("an arrowhead's tip is the end, its base sits back along the line", () => {
    const [tip, left, right] = arrowhead({ x: 100, y: 0 }, { x: 0, y: 0 }, 10, 6);
    expect(tip).toEqual({ x: 100, y: 0 });
    expect(left.x).toBeCloseTo(90);
    expect(right.x).toBeCloseTo(90);
    expect(Math.abs(left.y - right.y)).toBeCloseTo(6);
  });

  test("an edge is culled only when its bounding box misses the view", () => {
    const box = { left: 0, right: 100, top: 0, bottom: 100 };
    expect(meetsBox([{ x: -50, y: 50 }, { x: 150, y: 50 }], box)).toBe(true); // crosses with both ends off screen
    expect(meetsBox([{ x: 200, y: 0 }, { x: 300, y: 10 }], box)).toBe(false);
  });

  test("over the cap, edges to the focus come first and the rest are counted, not dropped silently", () => {
    const edges = [
      { id: "1", sourceId: "a", targetId: "b" },
      { id: "2", sourceId: "c", targetId: "f" },
      { id: "3", sourceId: "d", targetId: "e" },
      { id: "4", sourceId: "f", targetId: "g" },
    ];
    expect(capEdges(edges, "f", 10)).toEqual({ drawn: edges, omitted: 0 });
    expect(capEdges(edges, "f", 3)).toEqual({ drawn: [edges[1], edges[3], edges[0]], omitted: 1 });
    expect(capEdges(edges, null, 2)).toEqual({ drawn: [edges[0], edges[1]], omitted: 2 });
  });

  test("dashes limited to a range keep the same pattern as the whole line", () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const all = dashes(line, 10, 15).map((run) => run[0]!.x);
    const some = dashes(line, 10, 15, [30, 60]).map((run) => run[0]!.x);
    expect(all).toEqual([0, 25, 50, 75]);
    expect(some).toEqual([25, 50]); // the dash at 25 still reaches into 30-35; nothing outside is built
  });

  test("rangeInBox finds the stretch of a line inside a box, or null", () => {
    const box = { left: 0, right: 100, top: 0, bottom: 100 };
    expect(rangeInBox([{ x: -50, y: 50 }, { x: 150, y: 50 }], box)).toEqual([50, 150]);
    expect(rangeInBox([{ x: 10, y: 10 }, { x: 20, y: 10 }], box)).toEqual([0, 10]);
    expect(rangeInBox([{ x: -50, y: -50 }, { x: -10, y: 200 }], box)).toBeNull();
    // A two-segment line that is inside only on its second segment.
    expect(rangeInBox([{ x: -100, y: 50 }, { x: -50, y: 50 }, { x: 50, y: 50 }], box)).toEqual([100, 150]);
  });
});
