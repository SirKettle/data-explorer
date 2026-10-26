import { describe, expect, test } from "bun:test";
import type { SceneSource } from "../scene/source";
import type { ExplorerNode, ExplorerScene } from "../scene/types";
import { CameraRig } from "./camera";
import { createSceneStack } from "./scene-stack";

/** US071 Step 4 / AC2 — which edges a scene draws, and that every transition layer carries its own. */

const node = (id: string, drillsInto: string | null = null): ExplorerNode<string> => ({ id, label: id, weight: 1, marks: [], href: `/${id}`, drillsInto, shape: "disc" });

const scenes: Record<string, ExplorerScene<string>> = {
  root: {
    id: "root",
    heading: "Root",
    clusters: [],
    nodes: [node("a", "A"), node("b"), node("c")],
    edges: [
      { id: "ab", sourceId: "a", targetId: "b", kind: "k" },
      { id: "ab", sourceId: "a", targetId: "b", kind: "k" }, // a duplicate id
      { id: "ax", sourceId: "a", targetId: "missing", kind: "k" }, // names an item not in the scene
      { id: "aa", sourceId: "a", targetId: "a", kind: "k" }, // a self-loop has nothing to draw
      { id: "bc", sourceId: "b", targetId: "c", kind: "other" },
    ],
  },
  A: { id: "A", heading: "A", clusters: [], nodes: [node("x"), node("y")], edges: [{ id: "xy", sourceId: "x", targetId: "y", kind: "k" }] },
};

const source: SceneSource<string> = {
  keyOf: (focus) => focus ?? "root",
  loadScene: async (focus) => scenes[focus ?? "root"]!,
  isCached: () => true,
  parentOf: async () => ({ kind: "anchored", focus: null, anchorId: "a" }),
};

async function stack() {
  const rig = new CameraRig(() => ({ width: 800, height: 600 }), { x: 0, y: 0, scale: 1 });
  return createSceneStack({ rig, source, initialFocus: null, initialScene: scenes.root!, applyScene: () => {} });
}

describe("render edges (US071 AC2)", () => {
  test("a scene draws each edge once, only when both ends are drawn, skipping rather than throwing", async () => {
    const s = await stack();
    expect(s.current.renderEdges).toEqual([
      { id: "ab", kind: "k", sourceId: "a", targetId: "b" },
      { id: "bc", kind: "other", sourceId: "b", targetId: "c" },
    ]);
  });

  test("after entering, the parent's ghost layer carries the parent's edges with its own nodes", async () => {
    const s = await stack();
    await s.enter("a", { approach: false });
    expect(s.current.renderEdges.map((e) => e.id)).toEqual(["xy"]);
    const over = s.transitionView().over!;
    expect(over.edges!.map((e) => e.id)).toEqual(["ab", "bc"]);
    // The ghost's nodes are the parent's, moved into the child's world, under the same ids.
    expect(over.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
  });
});
