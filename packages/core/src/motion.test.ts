import { describe, expect, test } from "bun:test";
import { pulseLevel, wantsNextFrame } from "./motion";

describe("animated effects ask for frames only while they move (US071 AC5)", () => {
  test("an idle canvas wants no frames; a growing one or a pulse on screen does", () => {
    expect(wantsNextFrame({ growing: false, pulsingOnScreen: false, reducedMotion: false })).toBe(false);
    expect(wantsNextFrame({ growing: true, pulsingOnScreen: false, reducedMotion: false })).toBe(true);
    expect(wantsNextFrame({ growing: false, pulsingOnScreen: true, reducedMotion: false })).toBe(true);
  });

  test("under reduced motion nothing asks for another frame", () => {
    expect(wantsNextFrame({ growing: true, pulsingOnScreen: true, reducedMotion: true })).toBe(false);
  });

  test("a pulse breathes from 0 to 1 and back once per period", () => {
    expect(pulseLevel(0, 1000)).toBeCloseTo(0);
    expect(pulseLevel(250, 1000)).toBeCloseTo(0.5);
    expect(pulseLevel(500, 1000)).toBeCloseTo(1);
    expect(pulseLevel(1000, 1000)).toBeCloseTo(0);
    for (let t = 0; t < 2000; t += 37) {
      const level = pulseLevel(t, 1000);
      expect(level >= 0 && level <= 1).toBe(true);
    }
  });
});
