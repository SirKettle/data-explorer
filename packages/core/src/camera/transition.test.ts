import { describe, expect, test } from "bun:test";
import { childAlpha, childBoxInParent, childToParentFactor, cloudAlpha, parentBoxInChild, smoothstep } from "./transition";

describe("transition curves", () => {
  test("children are invisible when the anchor is small and fully revealed before the 85% auto-enter", () => {
    expect(childAlpha(0.1)).toBe(0);
    expect(childAlpha(0.85)).toBe(1);
    expect(childAlpha(0.5)).toBeGreaterThan(0);
    expect(childAlpha(0.5)).toBeLessThan(1);
  });

  test("a preview mid arrival fade is scaled by it, never popping straight to its fill-driven alpha", () => {
    expect(childAlpha(0.85, 0)).toBe(0);
    expect(childAlpha(0.85, 0.5)).toBeCloseTo(0.5);
  });

  test("the cloud thins as the children appear, but never while there are none to reveal", () => {
    expect(cloudAlpha(0.5, 0)).toBe(1);
    expect(cloudAlpha(0.5, 1)).toBeLessThan(0.25);
    expect(cloudAlpha(0.5, 0.5)).toBeLessThan(cloudAlpha(0.5, 0));
  });

  test("the last of the haze dissolves after the swap", () => {
    expect(cloudAlpha(0.85, 1)).toBeGreaterThan(0);
    expect(cloudAlpha(1.6, 1)).toBe(0);
    expect(cloudAlpha(1.6, 0)).toBe(0);
  });

  test("every curve is monotonic in fill", () => {
    let previous = { child: -1, cloud: 2 };
    for (let fill = 0; fill <= 2; fill += 0.01) {
      const child = childAlpha(fill);
      const cloud = cloudAlpha(fill, child);
      expect(child).toBeGreaterThanOrEqual(previous.child);
      expect(cloud).toBeLessThanOrEqual(previous.cloud + 1e-12);
      previous = { child, cloud };
    }
  });

  test("smoothstep clamps both ends", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
  });
});

describe("child <-> parent placement", () => {
  const anchor = { x: 100, y: 40, width: 50, height: 50 };

  test("the child layout is centred in the anchor, fitted to 80% of it", () => {
    const whole = childBoxInParent({ x: 0, y: 0, width: 400, height: 400 }, anchor, 400, 400);
    expect(whole.width).toBeCloseTo(40);
    expect(whole.height).toBeCloseTo(40);
    expect(whole.x + whole.width / 2).toBeCloseTo(125);
    expect(whole.y + whole.height / 2).toBeCloseTo(65);
    expect(childToParentFactor(anchor, 400, 200)).toBeCloseTo(40 / 400);
  });

  test("parentBoxInChild inverts childBoxInParent", () => {
    const box = { x: 37, y: 212, width: 18, height: 18 };
    const there = childBoxInParent(box, anchor, 640, 480);
    const back = parentBoxInChild(there, anchor, 640, 480);
    expect(back.x).toBeCloseTo(box.x);
    expect(back.y).toBeCloseTo(box.y);
    expect(back.width).toBeCloseTo(box.width);
    expect(back.height).toBeCloseTo(box.height);
  });

  test("a rectangular anchor fits the child by its tighter axis, keeping the child's proportions", () => {
    const wide = { x: 0, y: 0, width: 200, height: 50 };
    // A square child is limited by the anchor's height: 80% of 50 over 100.
    expect(childToParentFactor(wide, 100, 100)).toBeCloseTo(0.4);
    // A child of the anchor's own proportions fills 80% of it on both axes, centred.
    const whole = childBoxInParent({ x: 0, y: 0, width: 400, height: 100 }, wide, 400, 100);
    expect(whole.width).toBeCloseTo(160);
    expect(whole.height).toBeCloseTo(40);
    expect(whole.x + whole.width / 2).toBeCloseTo(100);
    expect(whole.y + whole.height / 2).toBeCloseTo(25);
    const box = { x: 12, y: 30, width: 40, height: 7 };
    const back = parentBoxInChild(childBoxInParent(box, wide, 400, 100), wide, 400, 100);
    expect(back).toEqual({ x: expect.closeTo(12), y: expect.closeTo(30), width: expect.closeTo(40), height: expect.closeTo(7) });
  });
});

describe("a solid (non-cloud) anchor", () => {
  test("is washed out completely once its contents are fully shown, leaving no flat disc behind", () => {
    expect(cloudAlpha(0.86, 1, true)).toBe(0);
    expect(cloudAlpha(0.86, 1, false)).toBeGreaterThan(0.1);
  });

  test("still never fades while there's nothing to reveal yet", () => {
    expect(cloudAlpha(0.5, 0, true)).toBe(1);
  });
});
