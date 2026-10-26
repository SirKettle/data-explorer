import { describe, expect, test } from "bun:test";
import { contains, distanceToCentre, fillFraction, relativeOutline } from "./geometry";

describe("contains", () => {
  const disc = { x: 0, y: 0, width: 100, height: 100, shape: "disc" as const };
  const square = { ...disc, shape: "square" as const };

  test("a disc or cloud is the circle in its box; a square is the whole box", () => {
    expect(contains(disc, 50, 50)).toBe(true);
    expect(contains(disc, 50, 1)).toBe(true);
    // A corner of the box is outside the circle, inside the square.
    expect(contains(disc, 5, 5)).toBe(false);
    expect(contains(square, 5, 5)).toBe(true);
    expect(contains({ ...disc, shape: "cloud" }, 5, 5)).toBe(false);
    expect(contains(square, 101, 50)).toBe(false);
  });

  test("in a box that is not square, a disc is the largest circle that fits, and a square fills it", () => {
    const wide = { x: 0, y: 0, width: 300, height: 100 };
    expect(contains({ ...wide, shape: "disc" }, 150, 10)).toBe(true);
    expect(contains({ ...wide, shape: "disc" }, 20, 50)).toBe(false);
    expect(contains({ ...wide, shape: "square" }, 20, 50)).toBe(true);
    expect(contains({ ...wide, shape: "square" }, 299, 99)).toBe(true);
  });

  test("a smallest target round the centre also counts", () => {
    const tiny = { x: 0, y: 0, width: 2, height: 2, shape: "disc" as const };
    expect(contains(tiny, 6, 1)).toBe(false);
    expect(contains(tiny, 6, 1, 6)).toBe(true);
  });
});

describe("a region", () => {
  const box = { x: 100, y: 0, width: 200, height: 100 };

  test("without an outline, is its whole box", () => {
    expect(contains({ ...box, shape: "region" }, 101, 1)).toBe(true);
    expect(contains({ ...box, shape: "region" }, 99, 1)).toBe(false);
  });

  test("with one, is its outline: inside an edge and in none of its holes, across every polygon", () => {
    // A triangle with a square hole, and a separate island in the bottom-right corner, in box units.
    const outline = relativeOutline(
      [
        [
          [[100, 0], [300, 0], [100, 100]],
          [[120, 10], [140, 10], [140, 30], [120, 30]],
        ],
        [[[280, 80], [300, 80], [300, 100], [280, 100]]],
      ],
      box,
    );
    expect(outline[1]![0]![0]).toEqual([0.9, 0.8]);
    const region = { ...box, shape: "region" as const, outline };
    expect(contains(region, 110, 40)).toBe(true);
    expect(contains(region, 130, 20)).toBe(false); // the hole
    expect(contains(region, 250, 80)).toBe(false); // in the box, past the triangle's long edge
    expect(contains(region, 290, 90)).toBe(true); // the island
    expect(contains(region, 400, 50)).toBe(false);
  });

  test("the smallest target never fills a hole in a region big enough to point at", () => {
    const lake = { x: 0, y: 0, width: 100, height: 100, shape: "region" as const, outline: [[[[0, 0], [1, 0], [1, 1], [0, 1]], [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]]]] };
    expect(contains(lake, 50, 50, 22)).toBe(false);
    expect(contains({ ...lake, width: 10, height: 10 }, 5, 5, 22)).toBe(true);
  });
});

test("distanceToCentre measures from the middle of the box", () => {
  expect(distanceToCentre({ x: 10, y: 10, width: 20, height: 40 }, 20, 30)).toBe(0);
  expect(distanceToCentre({ x: 0, y: 0, width: 6, height: 8 }, 0, 0)).toBe(5);
});

describe("fillFraction", () => {
  test("for a square box, its side on screen over the view's smaller dimension", () => {
    expect(fillFraction({ width: 100, height: 100 }, 3, 800, 600)).toBeCloseTo(0.5);
  });

  test("for any box, along whichever axis it fills more", () => {
    expect(fillFraction({ width: 400, height: 100 }, 1, 800, 600)).toBeCloseTo(0.5);
    expect(fillFraction({ width: 100, height: 450 }, 1, 800, 600)).toBeCloseTo(0.75);
  });
});
