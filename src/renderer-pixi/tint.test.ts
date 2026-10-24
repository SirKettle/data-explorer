import { describe, expect, test } from "bun:test";
import { CameraRig } from "../camera/camera";
import { createSceneStack, type RenderNode } from "../camera/scene-stack";
import type { SceneSource } from "../scene/source";
import type { ExplorerScene } from "../scene/types";
import { parseColour } from "../colour";
import { appearanceFor, DEFAULT_RAMP, glowFor, nodeTint, rampColor, sameRamp } from "./tint";

/** US071 Step 3 / AC3 — an item's own `color` wins over its ramp position and the per-id tint. */

function renderNode(overrides: Partial<RenderNode>): RenderNode {
  return {
    id: "a",
    x: 0,
    y: 0,
    size: 10,
    shape: "disc",
    drillable: false,
    focus: null,
    label: "A",
    sublabel: null,
    href: "/a",
    item: { id: "a", label: "A", weight: 1, href: "/a", drillsInto: null, shape: "disc" },
    emphasis: [],
    rawMarks: [],
    aggregate: false,
    ramp: null,
    color: null,
    effects: [],
    texture: null,
    kind: null,
    ...overrides,
  };
}

describe("appearanceFor colour precedence (US071 AC3)", () => {
  test("color beats ramp, which beats the per-id tint", () => {
    expect(appearanceFor(renderNode({}))).toMatchObject({ tint: nodeTint(renderNode({})) });
    expect(appearanceFor(renderNode({ ramp: 0.5 }))).toMatchObject({ tint: rampColor(0.5, DEFAULT_RAMP) });
    expect(appearanceFor(renderNode({ ramp: 0.5, color: 0x123456 }))).toMatchObject({ tint: 0x123456 });
    expect(appearanceFor(renderNode({ color: 0 }))).toMatchObject({ tint: 0 }); // black is a colour, not "unset"
  });

  test("a cloud keeps its nebula shape in its own colour; an aggregate keeps the aggregate token", () => {
    expect(appearanceFor(renderNode({ shape: "cloud", color: 0xff0000 }))).toEqual({ shape: "nebula", tint: 0xff0000, ring: null, glow: "none" });
    expect(appearanceFor(renderNode({ aggregate: true, color: 0xff0000 }))).toEqual({ shape: "aggregate", tint: null, ring: null, glow: "none" });
  });
});

describe("render nodes carry an item's colour, parsed once (US071 AC3)", () => {
  test("numbers and CSS strings both arrive as 0xRRGGBB; unset or invalid is null", async () => {
    const scene: ExplorerScene<null> = {
      id: "root",
      heading: "Root",
      clusters: [],
      nodes: [
        { id: "n", label: "n", weight: 1, marks: [], href: "/n", drillsInto: null, shape: "disc", color: 0x00ff00 },
        { id: "s", label: "s", weight: 1, marks: [], href: "/s", drillsInto: null, shape: "disc", color: "#f00" },
        { id: "u", label: "u", weight: 1, marks: [], href: "/u", drillsInto: null, shape: "disc" },
        { id: "x", label: "x", weight: 1, marks: [], href: "/x", drillsInto: null, shape: "disc", color: "not a colour" },
      ],
      edges: [],
    };
    const source: SceneSource<null> = { keyOf: () => "root", loadScene: async () => scene, isCached: () => true, parentOf: async () => ({ kind: "none" }) };
    const rig = new CameraRig(() => ({ width: 800, height: 600 }), { x: 0, y: 0, scale: 1 });
    const stack = createSceneStack({ rig, source, initialFocus: null, initialScene: scene, applyScene: () => {} });
    const colours = Object.fromEntries(stack.current.renderNodes.map((n) => [n.id, n.color]));
    expect(colours).toEqual({ n: 0x00ff00, s: 0xff0000, u: null, x: null });
  });
});

describe("glowFor (US071 AC5)", () => {
  const on = { glow: true, pulse: true, reducedMotion: false };

  test("an item without effects never glows, so the default draws exactly what it did before", () => {
    expect(glowFor(renderNode({}), on)).toBe("none");
    expect(appearanceFor(renderNode({})).glow).toBe("none");
  });

  test("glow holds still; pulse breathes only with pulses on and motion allowed", () => {
    expect(glowFor(renderNode({ effects: ["glow"] }), on)).toBe("static");
    expect(glowFor(renderNode({ effects: ["pulse"] }), on)).toBe("pulse");
    expect(glowFor(renderNode({ effects: ["pulse"] }), { ...on, pulse: false })).toBe("static");
    expect(glowFor(renderNode({ effects: ["pulse"] }), { ...on, reducedMotion: true })).toBe("static");
  });

  test("glow off removes every glow, and an aggregate never glows", () => {
    expect(glowFor(renderNode({ effects: ["glow", "pulse"] }), { ...on, glow: false })).toBe("none");
    expect(glowFor(renderNode({ effects: ["pulse"], aggregate: true }), on)).toBe("none");
  });
});

describe("ramps are colour stops", () => {
  const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

  test("the ends are exactly the first and last stops, in every interpolation", () => {
    for (const interpolation of ["oklab", "srgb", "hsl"] as const) {
      const ramp = { stops: ["#14b8a6", 0x8b5cf6], interpolation };
      expect(hex(rampColor(0, ramp))).toBe("#14b8a6");
      expect(hex(rampColor(1, ramp))).toBe("#8b5cf6");
    }
  });

  test("srgb mixes channels; oklab keeps the middle brighter than srgb's", () => {
    expect(hex(rampColor(0.5, { stops: ["#000000", "#ffffff"], interpolation: "srgb" }))).toMatch(/^#(7f7f7f|808080)$/);
    const srgb = rampColor(0.5, { stops: ["#ff0000", "#00ff00"], interpolation: "srgb" });
    const oklab = rampColor(0.5, { stops: ["#ff0000", "#00ff00"] });
    const sum = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
    expect(sum(oklab)).toBeGreaterThan(sum(srgb));
  });

  test("hsl turns the shorter way: red to blue goes through magenta, not green", () => {
    const mid = rampColor(0.5, { stops: ["hsl(0 100% 50%)", "hsl(240 100% 50%)"], interpolation: "hsl" });
    expect(hex(mid)).toBe("#ff00ff");
  });

  test("bare stops are spread evenly; a placed stop sits where it says", () => {
    const three = { stops: ["#ff0000", "#00ff00", "#0000ff"], interpolation: "srgb" as const };
    expect(hex(rampColor(0.5, three))).toBe("#00ff00");
    const placed = { stops: ["#ff0000", { color: "#00ff00", at: 0.25 }, "#0000ff"], interpolation: "srgb" as const };
    expect(hex(rampColor(0.25, placed))).toBe("#00ff00");
  });

  test("two stops at the same position make a hard edge", () => {
    const banded = { stops: ["#000000", { color: "#000000", at: 0.5 }, { color: "#ffffff", at: 0.5 }, "#ffffff"] };
    expect(hex(rampColor(0.49, banded))).toBe("#000000");
    expect(hex(rampColor(0.51, banded))).toBe("#ffffff");
  });

  test("one stop is a solid colour; unparseable stops are skipped; none left falls back to the default", () => {
    expect(hex(rampColor(0.7, { stops: ["#123456"] }))).toBe("#123456");
    expect(hex(rampColor(0.5, { stops: ["nope", "#123456", "also nope"] }))).toBe("#123456");
    expect(rampColor(0.3, { stops: ["nope"] })).toBe(rampColor(0.3, DEFAULT_RAMP));
  });

  test("positions outside 0 to 1, and non-numbers, clamp to the ends", () => {
    const ramp = { stops: ["#ff0000", "#0000ff"] };
    expect(rampColor(-2, ramp)).toBe(rampColor(0, ramp));
    expect(rampColor(9, ramp)).toBe(rampColor(1, ramp));
    expect(rampColor(Number.NaN, ramp)).toBe(rampColor(0, ramp));
  });

  test("the default still runs red to green by way of blue", () => {
    expect(hex(rampColor(0, DEFAULT_RAMP))).toBe(hex(parseColour("hsl(0 74% 58%)")!));
    expect(hex(rampColor(0.5, DEFAULT_RAMP))).toBe(hex(parseColour("hsl(235 74% 64%)")!));
    expect(hex(rampColor(1, DEFAULT_RAMP))).toBe(hex(parseColour("hsl(130 74% 58%)")!));
  });

  test("sameRamp compares by value", () => {
    expect(sameRamp({ stops: ["#fff", "#000"] }, { stops: ["#fff", "#000"] })).toBe(true);
    expect(sameRamp({ stops: ["#fff", "#000"] }, { stops: ["#fff", "#111"] })).toBe(false);
  });
});
