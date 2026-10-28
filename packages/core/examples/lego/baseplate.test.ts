import { describe, expect, test } from "bun:test";
import type { ExplorerRect } from "@data-xplorer/core";
import { brickFor, LAYOUT, pack } from "./baseplate";
import { CATALOGUE, type Theme } from "./data";

const inside = (inner: ExplorerRect, outer: ExplorerRect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

/** `rect` with `by` studs taken off every side. */
const inset = (rect: ExplorerRect, by: number) => ({ x: rect.x + by, y: rect.y + by, width: rect.width - 2 * by, height: rect.height - 2 * by });

/** Apart by at least `gap` studs on one axis (0: touching is fine, overlapping is not). */
const apart = (a: ExplorerRect, b: ExplorerRect, gap: number) =>
  a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y;

const rect = ({ x, y, w, h }: { x: number; y: number; w: number; h: number }) => ({ x, y, width: w, height: h });

describe("pack", () => {
  const bricks = Array.from({ length: 60 }, (_, i) => ({ item: `b${i}`, w: 1 + (i % 4), h: 1 + (i % 2), turn: true }));
  const plates = Array.from({ length: 4 }, (_, i) => ({ item: `p${i}`, w: 5 + i, h: 4, margin: 1 }));

  test("butts bricks together, keeps a margin round plates, and stays inside the pad", () => {
    const { placed, width, height } = pack([...plates, ...bricks], 2);
    for (const at of placed) expect(inside(rect(at), { x: 2, y: 2, width: width - 4, height: height - 4 })).toBe(true);
    placed.forEach((a, i) =>
      placed.slice(i + 1).forEach((b) => {
        const gap = a.item.startsWith("p") || b.item.startsWith("p") ? 1 : 0;
        expect(apart(rect(a), rect(b), gap)).toBe(true);
      }),
    );
  });

  test("turns a brick only if it may, keeping its footprint", () => {
    const { placed } = pack([{ item: "fixed", w: 1, h: 6 }, ...bricks], 0);
    const fixed = placed.find((at) => at.item === "fixed")!;
    expect([fixed.w, fixed.h]).toEqual([1, 6]);
    for (const at of placed.filter((p) => p.item !== "fixed")) {
      const source = bricks.find((b) => b.item === at.item)!;
      expect([at.w, at.h].sort()).toEqual([source.w, source.h].sort());
    }
  });
});

describe("the catalogue's baseplate", () => {
  test("a brick grows with its part count", () => {
    const areas = [0, 30, 80, 150, 300, 600, 1000, 2000, 5000].map((parts) => {
      const { w, h } = brickFor({ parts });
      return w * h;
    });
    expect(areas).toEqual([...areas].sort((a, b) => a - b));
  });

  test("is whole 32-stud plates, with every set on it", () => {
    expect(LAYOUT.baseplate.width % 32).toBe(0);
    expect(LAYOUT.baseplate.height % 32).toBe(0);
    expect(LAYOUT.setBox.size).toBe(CATALOGUE.roots.reduce((sum, theme) => sum + theme.total, 0));
  });

  test("every brick and plate sits on whole studs inside its theme's plate, clear of its neighbours", () => {
    function check(theme: Theme, outer: ExplorerRect) {
      const box = LAYOUT.themeBox.get(theme)!;
      expect(inside(box, outer)).toBe(true);
      const plates = theme.children.map((child) => LAYOUT.themeBox.get(child)!);
      const bricks = theme.sets.map((set) => LAYOUT.setBox.get(set)!);
      for (const child of [...plates, ...bricks]) {
        expect(Object.values(child).every(Number.isInteger)).toBe(true);
        expect(inside(child, inset(box, 1))).toBe(true);
      }
      // A plate keeps a stud clear of everything; bricks may touch. Pairwise only on the smaller
      // themes: the big ones are a million pairs each.
      for (const p of plates) for (const other of [...plates, ...bricks]) if (other !== p) expect(apart(p, other, 1)).toBe(true);
      if (bricks.length < 300) bricks.forEach((a, i) => bricks.slice(i + 1).forEach((b) => expect(apart(a, b, 0)).toBe(true)));
      theme.children.forEach((child) => check(child, inset(box, 1)));
    }
    CATALOGUE.roots.forEach((root) => check(root, LAYOUT.baseplate));
  });
});
