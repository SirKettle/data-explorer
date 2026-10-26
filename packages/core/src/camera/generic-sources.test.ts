import { describe, expect, test } from "bun:test";
import type { SceneSource } from "../scene/source";
import { cycle, dag, DEEP_LEVELS, deepTree, numbered, WIDE_BUDGET, WIDE_FILES } from "../../test/fixtures";
import type { ExplorerScene } from "../scene/types";
import { CameraRig } from "./camera";
import { createSceneStack } from "./scene-stack";

/**
 * US070 plan Step 5 / AC4 — the scene stack over data structures that have nothing to do with a
 * catalogue: a deep tree with a very wide folder, a DAG, a cycle, and a numeric focus that starts
 * at `0`. No LEGO fixture is imported anywhere in this file.
 */

const viewport = { width: 800, height: 600 };

async function stackAt<F>(source: SceneSource<F>, focus: F | null) {
  const rig = new CameraRig(() => viewport, { x: 0, y: 0, scale: 1 });
  const applied: string[] = [];
  const stack = createSceneStack({ rig, source, initialFocus: focus, initialScene: await source.loadScene(focus), applyScene: (s) => applied.push(s.key) });
  return { stack, applied, rig };
}

describe("a deep tree (US070 AC4)", () => {
  test(`enters ${DEEP_LEVELS} levels down and leaves all the way back out`, async () => {
    const source = deepTree();
    const { stack } = await stackAt(source, null);
    for (let level = 1; level <= DEEP_LEVELS; level++) await stack.enter(`d${level}`, { approach: false });
    expect(stack.depth).toBe(DEEP_LEVELS);
    expect(stack.current.key).toBe("/d1/d2/d3/d4/d5/d6/d7");
    expect(stack.breadcrumb()).toHaveLength(DEEP_LEVELS + 1);
    for (let level = DEEP_LEVELS; level >= 1; level--) await stack.leave(false);
    expect(stack.depth).toBe(0);
    expect(stack.current.key).toBe("root");
  });

  test("a deep link climbs out one anchored level at a time, all the way to the root", async () => {
    const { stack } = await stackAt(deepTree(), "/d1/d2/d3/d4/d5/d6/d7");
    const visited: string[] = [];
    for (let i = 0; i < DEEP_LEVELS; i++) {
      await stack.climbToParent();
      expect(stack.depth).toBe(1);
      await stack.leave(false);
      visited.push(stack.current.key);
    }
    expect(visited).toEqual(["/d1/d2/d3/d4/d5/d6", "/d1/d2/d3/d4/d5", "/d1/d2/d3/d4", "/d1/d2/d3", "/d1/d2", "/d1", "root"]);
    await stack.climbToParent(); // nothing above the root
    expect(stack.depth).toBe(0);
  });

  test(`a folder of ${WIDE_FILES} files shows ${WIDE_BUDGET} and one honest, non-drillable aggregate for the rest`, async () => {
    const { stack } = await stackAt(deepTree(), null);
    await stack.enter("wide", { approach: false });
    const nodes = stack.current.renderNodes;
    const aggregates = nodes.filter((n) => n.aggregate);
    expect(nodes).toHaveLength(WIDE_BUDGET + 1);
    expect(aggregates.map((n) => n.id)).toEqual(["rest"]);
    expect(aggregates[0]!.drillable).toBe(false);
    expect(stack.current.scene.clusters[0]!.truncated).toEqual({ shown: WIDE_BUDGET, total: WIDE_FILES });
    for (const n of nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y) && n.size > 0).toBe(true);
  });
});

describe("a DAG (US070 AC4)", () => {
  test("a deep-linked node with two parents climbs to the one the source chooses", async () => {
    const { stack } = await stackAt(dag(), "D");
    await stack.climbToParent();
    await stack.leave(false);
    expect(stack.current.key).toBe("B");
  });

  test("reached through its other parent, leaving goes back the way the viewer came, not to the source's choice", async () => {
    const { stack } = await stackAt(dag(), null);
    await stack.enter("C", { approach: false });
    await stack.enter("D", { approach: false });
    await stack.leave(false);
    expect(stack.current.key).toBe("C");
  });
});

describe("a cycle (US070 AC4)", () => {
  test("50 laps of A → B → C neither loop nor refetch: depth tracks enters minus leaves, and each scene loads once", async () => {
    const source = cycle();
    const { stack } = await stackAt(source, null);
    await stack.enter("A", { approach: false });
    let enters = 1;
    const order = ["B", "C", "A"];
    for (let lap = 0; lap < 50; lap++) {
      for (const id of order) {
        await stack.enter(id, { approach: false });
        enters++;
      }
    }
    expect(stack.depth).toBe(enters);
    expect(stack.current.key).toBe("A");
    expect(source.loads).toEqual(["root", "A", "B", "C"]);

    for (let i = 0; i < enters; i++) await stack.leave(false);
    expect(stack.depth).toBe(0);
    expect(stack.current.key).toBe("root");
    expect(source.loads).toEqual(["root", "A", "B", "C"]);
  });

  test("the focus of a neighbourhood is never drillable, even though its own item points back at it", async () => {
    const { stack } = await stackAt(cycle(), "B");
    const byId = new Map(stack.current.renderNodes.map((n) => [n.id, n]));
    expect(byId.get("B")!.drillable).toBe(false);
    expect(byId.get("C")!.drillable).toBe(true);
  });

  test("zooming out of a cycle is an unanchored swap to the root, and jumpTo discards the stack", async () => {
    const { stack } = await stackAt(cycle(), "C");
    await stack.climbToParent();
    expect(stack.depth).toBe(0);
    expect(stack.current.key).toBe("root");

    await stack.enter("A", { approach: false });
    await stack.enter("B", { approach: false });
    await stack.jumpTo("C");
    expect(stack.depth).toBe(0);
    expect(stack.current.key).toBe("C");
  });
});

describe("a numeric focus that starts at 0 (US070 Step 5)", () => {
  test("0 is a real, drillable focus, distinct from the root", async () => {
    const { stack } = await stackAt(numbered(), null);
    const zero = stack.current.renderNodes.find((n) => n.id === "n0")!;
    expect(zero.drillable).toBe(true);
    expect(zero.focus).toBe(0);
    await stack.enter("n0", { approach: false });
    expect(stack.current.key).toBe("n0");
    expect(stack.current.focus).toBe(0);
    await stack.enter("n1", { approach: false });
    expect(stack.current.key).toBe("n1");
  });

  test("a deep link at 0 climbs to the root, and one at 1 climbs to 0", async () => {
    const one = await stackAt(numbered(), 1);
    await one.stack.climbToParent();
    await one.stack.leave(false);
    expect(one.stack.current.key).toBe("n0");

    const zero = await stackAt(numbered(), 0);
    await zero.stack.climbToParent();
    expect(zero.stack.depth).toBe(1);
    await zero.stack.leave(false);
    expect(zero.stack.current.key).toBe("root");
  });
});

describe("streaming and invalidation over a generic source (US070 Step 5)", () => {
  function streamed(): SceneSource<string> & { deliver: () => void; refreshed: number } {
    const page = (ids: string[]): ExplorerScene<string> => ({
      id: "/s",
      heading: "/s",
      clusters: [],
      nodes: ids.map((id) => ({ id, label: id, weight: 1, marks: [], href: `#${id}`, drillsInto: null, shape: "disc" as const })),
      edges: [],
      expectedItemCount: 3,
    });
    const root: ExplorerScene<string> = {
      id: "root",
      heading: "root",
      clusters: [{ id: "s", label: "s", weight: 1, marks: [], href: "#s", drillsInto: "/s", shape: "cloud", truncated: null }],
      nodes: [],
      edges: [],
    };
    let deliver = () => {};
    const source = {
      refreshed: 0,
      deliver: () => deliver(),
      keyOf: (focus: string | null) => focus ?? "root",
      loadScene: async (focus: string | null) => (focus === null ? root : page(["a", "b", "c"])),
      loadSceneStreaming: (_focus: string, onUpdate: (scene: ExplorerScene<string>) => void) => {
        deliver = () => onUpdate(page(["a", "b", "c"]));
        return Promise.resolve(page(["a"]));
      },
      isCached: () => false,
      refreshScene: async (focus: string | null) => {
        source.refreshed++;
        return focus === null ? root : page(["a", "c"]);
      },
      parentOf: async () => ({ kind: "none" as const }),
    };
    return source;
  }

  test("a later page refines the entered scene in place: the first item keeps its position", async () => {
    const source = streamed();
    const { stack } = await stackAt(source, null);
    await stack.enter("s", { approach: false });
    const first = stack.current.renderNodes.find((n) => n.id === "a")!;
    expect(stack.current.renderNodes.map((n) => n.id)).toEqual(["a"]);
    source.deliver();
    expect(stack.current.renderNodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    const after = stack.current.renderNodes.find((n) => n.id === "a")!;
    expect([after.x, after.y, after.size]).toEqual([first.x, first.y, first.size]);
  });

  test("refreshCurrent reloads through refreshScene and applies what changed", async () => {
    const source = streamed();
    const { stack, applied } = await stackAt(source, "/s");
    expect(await stack.refreshCurrent()).toBe(true);
    expect(source.refreshed).toBe(1);
    expect(stack.current.renderNodes.map((n) => n.id).sort()).toEqual(["a", "c"]);
    expect(applied.at(-1)).toBe("/s");
  });
});
