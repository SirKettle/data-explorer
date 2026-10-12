import { describe, expect, test } from "bun:test";
import { CameraRig } from "../camera/camera";
import { createSceneStack, type RenderNode } from "../camera/scene-stack";
import type { SceneSource } from "../scene/source";
import type { ExplorerScene } from "../scene/types";
import { appearanceFor, DEFAULT_RAMP, glowFor, nodeTint, rampColor } from "./tint";

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
