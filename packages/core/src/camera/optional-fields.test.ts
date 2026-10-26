import { describe, expect, test } from "bun:test";
import type { SceneSource } from "../scene/source";
import type { ExplorerScene } from "../scene/types";
import { CameraRig } from "./camera";
import { createSceneStack } from "./scene-stack";

/** US072 review change 6: `marks` and `truncated` may be left out, and mean "none" and "complete". */
describe("optional item fields (US072 change 6)", () => {
  test("an item without marks has none; a cluster without truncated is complete, not an aggregate", () => {
    const scene: ExplorerScene<string> = {
      id: "root",
      heading: "Root",
      clusters: [
        { id: "plain", label: "Plain", weight: 10, href: "/plain", drillsInto: "plain", shape: "cloud" },
        { id: "rest", label: "3 more", weight: 3, href: null, drillsInto: null, shape: "disc", truncated: { shown: 5, total: 8 } },
      ],
      nodes: [{ id: "n", label: "N", weight: 1, href: "/n", drillsInto: null, shape: "disc" }],
      edges: [],
    };
    const source: SceneSource<string> = { keyOf: (f) => f ?? "root", loadScene: async () => scene, isCached: () => true, parentOf: async () => ({ kind: "none" }) };
    const rig = new CameraRig(() => ({ width: 800, height: 600 }), { x: 0, y: 0, scale: 1 });
    const stack = createSceneStack({ rig, source, initialFocus: null, initialScene: scene, applyScene: () => {} });
    const byId = Object.fromEntries(stack.current.renderNodes.map((n) => [n.id, n]));
    expect(byId.plain!.rawMarks).toEqual([]);
    expect(byId.plain!.aggregate).toBe(false);
    expect(byId.n!.rawMarks).toEqual([]);
    expect(byId.rest!.aggregate).toBe(true);
  });
});
