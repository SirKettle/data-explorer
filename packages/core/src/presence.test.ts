import { describe, expect, test } from "bun:test";
import { clampPresence, easePresence, PRESENCE_GHOST, presenceLook } from "./presence";

describe("presenceLook", () => {
  test("a fully present item is drawn as it always was", () => {
    expect(presenceLook(1)).toEqual({ scale: 1, alpha: 1 });
  });

  test("an absent item is a ghost: small, faint, but drawn", () => {
    expect(presenceLook(0)).toEqual({ ...PRESENCE_GHOST });
    expect(presenceLook(0).alpha).toBeGreaterThan(0);
  });

  test("area follows presence: a quarter present is half as wide", () => {
    expect(presenceLook(0.25).scale).toBeCloseTo(0.5);
  });

  test("never smaller than the ghost, and opacity rises with presence", () => {
    expect(presenceLook(0.01).scale).toBe(PRESENCE_GHOST.scale);
    expect(presenceLook(0.2).alpha).toBeLessThan(presenceLook(0.8).alpha);
  });

  test("out-of-range and missing values are clamped, and missing means present", () => {
    expect(clampPresence(undefined)).toBe(1);
    expect(clampPresence(Number.NaN)).toBe(1);
    expect(clampPresence(-3)).toBe(0);
    expect(clampPresence(7)).toBe(1);
    expect(presenceLook(7)).toEqual({ scale: 1, alpha: 1 });
  });
});

describe("easePresence", () => {
  test("moves part of the way each frame, and arrives", () => {
    let shown = 0;
    const first = easePresence(shown, 1, 16, false);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    for (let frame = 0; frame < 120; frame++) shown = easePresence(shown, 1, 16, false);
    expect(shown).toBe(1);
  });

  test("snaps at once under reduced motion", () => {
    expect(easePresence(0, 1, 16, true)).toBe(1);
  });

  test("a stale frame time cannot overshoot", () => {
    expect(easePresence(0, 1, 10_000, false)).toBeLessThanOrEqual(1);
    expect(easePresence(0.5, 0.2, -50, false)).toBe(0.5);
  });
});
