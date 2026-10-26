import { describe, expect, test } from "bun:test";
import type { ParentLink, SceneSource } from "../scene/source";
import type { ExplorerScene } from "../scene/types";
import { CameraRig } from "./camera";
import { createSceneStack, PREVIEW_RETRY_MS } from "./scene-stack";

/**
 * US072 Step 1 / AC1 — the scene stack's transitions, owned by the package at last: previews (a
 * child drawn inside its anchor before it is entered), prefetch bounds and retry back-off, sideways
 * moves into a sibling, and the parent drawn as a ghost around the scene you are in.
 *
 * Until now only PicaBase covered these, through `./headless`, in a test written against its own
 * data (status §6 item 29). These are the same cases with generic groups and items, so the
 * package can leave the monorepo without losing them. A group is a cloud you enter; an item is a
 * disc inside it.
 */

type Focus = string; // a group's id; `null` is the overview
type Scene = ExplorerScene<Focus>;

const viewport = { width: 800, height: 600 };
const square = { width: 1000, height: 1000 };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function overview(weights: Record<string, number>): Scene {
  return {
    id: "overview",
    heading: "Overview",
    clusters: Object.entries(weights).map(([id, weight]) => ({
      id,
      label: id,
      weight,
      marks: [],
      href: `/groups/${id}`,
      drillsInto: id,
      shape: "cloud" as const,
      truncated: null,
    })),
    nodes: [],
    edges: [],
  };
}

function groupScene(id: string, itemIds: string[]): Scene {
  return {
    id: `group:${id}`,
    heading: `Group ${id}`,
    clusters: [],
    nodes: itemIds.map((itemId) => ({
      id: itemId,
      label: itemId,
      weight: 500,
      marks: [],
      href: `/items/${itemId}`,
      drillsInto: `item:${itemId}`, // drillable, with no scene behind it: a preview of it just fails
      shape: "disc" as const,
    })),
    edges: [],
  };
}

/** An in-memory source that counts loads, so tests can assert on fetch volume. */
function fakeSource(scenes: Record<string, Scene | undefined>, parents: Record<string, ParentLink<Focus>> = {}): SceneSource<Focus> & { calls: string[] } {
  const cache = new Map<string, Promise<Scene>>();
  const calls: string[] = [];
  const keyOf = (focus: Focus | null) => focus ?? "root";
  function loadScene(focus: Focus | null): Promise<Scene> {
    const key = keyOf(focus);
    calls.push(key);
    const cached = cache.get(key);
    if (cached) return cached;
    const scene = scenes[key];
    const promise = scene ? Promise.resolve(scene) : Promise.reject(new Error(`no scene for ${key}`));
    promise.catch(() => {}); // a rejection is the caller's to observe, not an unhandled one
    cache.set(key, promise);
    return promise;
  }
  return {
    calls,
    keyOf,
    loadScene,
    loadSceneStreaming: (focus) => loadScene(focus),
    isCached: (focus) => cache.has(keyOf(focus)),
    parentOf: async (focus) => parents[focus] ?? { kind: "none" },
  };
}

/** A source whose streamed loads are controlled by the test. */
function manualSource(onLoad: (key: string) => Promise<Scene>): SceneSource<Focus> {
  return {
    keyOf: (focus) => focus ?? "root",
    loadScene: () => new Promise(() => {}),
    loadSceneStreaming: (focus) => onLoad(focus),
    isCached: () => false,
    parentOf: () => Promise.reject(new Error("unused")),
  };
}

function stackOver(source: SceneSource<Focus>, root: Scene, view = square) {
  const rig = new CameraRig(() => view, { x: 0, y: 0, scale: 1 });
  const stack = createSceneStack({ rig, source, initialFocus: null, initialScene: root, applyScene: () => {} });
  return { rig, stack };
}

function onScreen(rig: CameraRig, node: { x: number; y: number; size: number }) {
  const centre = rig.worldToScreen(node.x + node.size / 2, node.y + node.size / 2);
  return { x: centre.x, y: centre.y, size: node.size * rig.camera.scale };
}

describe("the cloud cross-fade (transitionView)", () => {
  function twoGroups() {
    const root = overview({ groupA: 1000, groupB: 1000 });
    return stackOver(fakeSource({ root, groupA: groupScene("groupA", ["itemX", "itemY"]) }), root, viewport);
  }

  function zoomOnto(rig: CameraRig, box: { x: number; y: number; width: number }, fill: number) {
    rig.set({ x: box.x + box.width / 2, y: box.y + box.width / 2, scale: (fill * Math.min(viewport.width, viewport.height)) / box.width });
  }

  test("a prefetched child is drawn inside its anchor, beneath it, fading in as the anchor grows", async () => {
    const { rig, stack } = twoGroups();
    const box = stack.current.layout.boxes.find((b) => b.id === "groupA")!;
    zoomOnto(rig, box, 0.3);
    expect(stack.transitionView(Infinity).under).toEqual([]); // nothing loaded yet

    stack.schedulePreviews();
    await flush();
    const early = stack.transitionView(Infinity);
    expect(early.under[0]?.nodes.map((n) => n.id).sort()).toEqual(["itemX", "itemY"]);
    for (const node of early.under[0]!.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(box.x);
      expect(node.x + node.size).toBeLessThanOrEqual(box.x + box.width);
      // Placed into the anchor, a node's box stays square and its deprecated `size` in step.
      expect(node.width).toBeCloseTo(node.height, 9);
      expect(node.size).toBe(Math.max(node.width, node.height));
    }
    for (const node of stack.current.renderNodes) {
      const laid = stack.current.layout.boxes.find((b) => b.id === node.id)!;
      expect([node.width, node.height, node.size]).toEqual([laid.width, laid.height, laid.width]);
    }
    const anchor = stack.current.renderNodes.find((n) => n.id === "groupA")!;
    const earlyChild = early.under[0]!.alpha(early.under[0]!.nodes[0]!);
    const earlyCloud = early.currentAlpha!(anchor);

    zoomOnto(rig, box, 0.7);
    const late = stack.transitionView(Infinity);
    expect(late.under[0]!.alpha(late.under[0]!.nodes[0]!)).toBeGreaterThan(earlyChild);
    expect(late.currentAlpha!(anchor)).toBeLessThan(earlyCloud);
  });

  test("a preview that has only just arrived fades in rather than popping, and asks to keep drawing", async () => {
    const { rig, stack } = twoGroups();
    zoomOnto(rig, stack.current.layout.boxes.find((b) => b.id === "groupA")!, 0.7);
    stack.schedulePreviews();
    await flush();
    const now = stack.transitionView(performance.now());
    expect(now.animating).toBe(true);
    expect(now.under[0]?.alpha(now.under[0].nodes[0]!) ?? 0).toBeLessThan(stack.transitionView(Infinity).under[0]!.alpha(now.under[0]!.nodes[0]!));
  });

  test("entering a previewed child swaps synchronously with every node exactly where, and as opaque as, it was drawn", async () => {
    const { rig, stack } = twoGroups();
    const box = stack.current.layout.boxes.find((b) => b.id === "groupA")!;
    zoomOnto(rig, box, 0.3);
    stack.schedulePreviews();
    await flush();
    zoomOnto(rig, box, 0.86);

    const before = stack.transitionView(Infinity);
    const anchor = stack.current.renderNodes.find((n) => n.id === "groupA")!;
    const cloudBefore = before.currentAlpha!(anchor);
    const anchorBefore = onScreen(rig, anchor);
    const drawn = new Map(before.under[0]!.nodes.map((n) => [n.id, { ...onScreen(rig, n), alpha: before.under[0]!.alpha(n) }]));

    void stack.enter("groupA", { approach: false }); // not awaited: a preview needs no fetch
    expect(stack.current.key).toBe("groupA");

    const after = stack.transitionView(Infinity);
    for (const node of stack.current.renderNodes) {
      const was = drawn.get(node.id)!;
      const is = onScreen(rig, node);
      expect(is.x).toBeCloseTo(was.x, 6);
      expect(is.y).toBeCloseTo(was.y, 6);
      expect(is.size).toBeCloseTo(was.size, 6);
      expect(after.currentAlpha!(node)).toBeCloseTo(was.alpha, 6);
    }
    // The parent's cloud carries on dissolving over the child, from where it was.
    const ghostAnchor = after.over!.nodes.find((n) => n.id === "groupA")!;
    expect(after.over!.alpha(ghostAnchor)).toBeCloseTo(cloudBefore, 6);
    expect(onScreen(rig, ghostAnchor).x).toBeCloseTo(anchorBefore.x, 6);
    expect(onScreen(rig, ghostAnchor).size).toBeCloseTo(anchorBefore.size, 6);
  });

  test("leaving by zoom keeps the child where it was and hands it back to the parent as the anchor's preview", async () => {
    const { rig, stack } = twoGroups();
    zoomOnto(rig, stack.current.layout.boxes.find((b) => b.id === "groupA")!, 0.86);
    await stack.enter("groupA", { approach: false });
    rig.set({ ...rig.camera, scale: rig.camera.scale * 0.65 });

    const before = stack.transitionView(Infinity);
    const drawn = new Map(stack.current.renderNodes.map((n) => [n.id, { ...onScreen(rig, n), alpha: before.currentAlpha!(n) }]));
    const ghostAnchor = before.over!.nodes.find((n) => n.id === "groupA")!;
    const ghostBefore = { ...onScreen(rig, ghostAnchor), alpha: before.over!.alpha(ghostAnchor) };

    await stack.leave(false);
    expect(stack.current.key).toBe("root");

    const after = stack.transitionView(Infinity);
    const anchor = stack.current.renderNodes.find((n) => n.id === "groupA")!;
    const anchorNow = onScreen(rig, anchor);
    expect(anchorNow.x).toBeCloseTo(ghostBefore.x, 6);
    expect(anchorNow.size).toBeCloseTo(ghostBefore.size, 6);
    expect(after.currentAlpha!(anchor)).toBeCloseTo(ghostBefore.alpha, 6);
    for (const node of after.under[0]!.nodes) {
      const was = drawn.get(node.id)!;
      expect(onScreen(rig, node).x).toBeCloseTo(was.x, 6);
      expect(after.under[0]!.alpha(node)).toBeCloseTo(was.alpha, 6);
    }
  });

  test("a climb's synthetic parent fades in over the child rather than appearing all at once", async () => {
    const source = fakeSource(
      { root: overview({ parentG: 1000 }), parentG: overview({ childG: 1000, other: 1000 }) },
      { childG: { kind: "anchored", focus: "parentG", anchorId: "childG" } },
    );
    const rig = new CameraRig(() => viewport, { x: 0, y: 0, scale: 1 });
    const stack = createSceneStack({ rig, source, initialFocus: "childG", initialScene: groupScene("childG", ["itemX", "itemY"]), applyScene: () => {} });
    rig.set({ x: stack.current.layout.width / 2, y: stack.current.layout.height / 2, scale: 0.0001 + 300 / stack.current.layout.width });
    await stack.climbToParent();
    expect(stack.depth).toBe(1);
    const fresh = stack.transitionView(performance.now());
    expect(fresh.animating).toBe(true);
    const ghost = fresh.over!.nodes.find((n) => n.id === "childG")!;
    expect(fresh.over!.alpha(ghost)).toBeLessThan(0.05);
    expect(stack.transitionView(Infinity).over!.alpha(ghost)).toBeGreaterThan(fresh.over!.alpha(ghost));
  });
});

describe("every visible node previews its own children (not just the one nearest the centre)", () => {
  /** Centres the camera between `ids` at a scale where the smallest of them fills `fill`. */
  function frameBetween(rig: CameraRig, boxes: { id: string; x: number; y: number; width: number }[], ids: string[], fill: number) {
    const chosen = boxes.filter((b) => ids.includes(b.id));
    const cx = chosen.reduce((sum, b) => sum + b.x + b.width / 2, 0) / chosen.length;
    const cy = chosen.reduce((sum, b) => sum + b.y + b.width / 2, 0) / chosen.length;
    const smallest = Math.min(...chosen.map((b) => b.width));
    rig.set({ x: cx, y: cy, scale: (fill * square.width) / smallest });
  }

  function twoGroups() {
    const root = overview({ groupA: 500, groupB: 500 });
    const source = fakeSource({ root, groupA: groupScene("groupA", ["itemA"]), groupB: groupScene("groupB", ["itemB"]) });
    return { ...stackOver(source, root), source };
  }

  test("two nodes on screen, neither at the centre, both reveal their children — and neither fades the other", async () => {
    const { rig, stack } = twoGroups();
    frameBetween(rig, stack.current.layout.boxes, ["groupA", "groupB"], 0.3);
    stack.schedulePreviews();
    await flush();
    const view = stack.transitionView(Infinity);
    expect(view.under.map((layer) => layer.nodes[0]!.id).sort()).toEqual(["itemA", "itemB"]);
    // Each cloud thins only by its own reveal; nothing is faded on another node's account.
    const a = stack.current.renderNodes.find((n) => n.id === "groupA")!;
    const b = stack.current.renderNodes.find((n) => n.id === "groupB")!;
    expect(view.currentAlpha!(a)).toBeCloseTo(view.currentAlpha!(b), 6);
  });

  test("zooming in right next to a node leaves its siblings exactly as they were", async () => {
    const { rig, stack } = twoGroups();
    const boxA = stack.current.layout.boxes.find((b) => b.id === "groupA")!;
    // groupA almost at the auto-enter size, and groupB too small to be revealing anything.
    rig.set({ x: boxA.x + boxA.width / 2, y: boxA.y + boxA.width / 2, scale: (0.8 * square.width) / boxA.width });
    stack.schedulePreviews();
    await flush();
    const b = stack.current.renderNodes.find((n) => n.id === "groupB")!;
    expect(stack.transitionView(Infinity).currentAlpha!(b)).toBe(1);
  });

  test("uncached loads are bounded and biggest-on-screen first; a freed slot takes the next", async () => {
    // The lowest weight always maps to the minimum size; `tiny` takes that, and stays too small to load.
    const root = overview({ big: 1000, mid: 900, small: 800, tiny: 1 });
    const resolvers = new Map<string, (scene: Scene) => void>();
    const calls: string[] = [];
    const { rig, stack } = stackOver(
      manualSource((key) => {
        calls.push(key);
        return new Promise((resolve) => resolvers.set(key, resolve));
      }),
      root,
    );
    frameBetween(rig, stack.current.layout.boxes, ["big", "mid", "small"], 0.2);

    stack.schedulePreviews();
    expect(calls).toEqual(["big", "mid"]);
    stack.schedulePreviews(); // nothing new while both slots are taken
    expect(calls.length).toBe(2);

    resolvers.get("big")!(groupScene("big", ["i1"]));
    await flush();
    stack.schedulePreviews();
    expect(calls).toEqual(["big", "mid", "small"]);
  });

  test("a failed preview is not retried on the next frame, only once its back-off has passed", async () => {
    // Previews are scheduled after every draw. Before the back-off, a failure freed its slot with a
    // redraw, so a rate-limited load was retried every frame for as long as the node was on screen.
    const root = overview({ big: 1000, tiny: 1 });
    const calls: string[] = [];
    const { rig, stack } = stackOver(
      manualSource((key) => {
        calls.push(key);
        return Promise.reject(new Error("429"));
      }),
      root,
    );
    frameBetween(rig, stack.current.layout.boxes, ["big"], 0.2);

    const realNow = performance.now.bind(performance);
    let now = realNow();
    performance.now = () => now;
    try {
      stack.schedulePreviews();
      await flush();
      expect(calls).toEqual(["big"]);

      stack.schedulePreviews();
      await flush();
      expect(calls).toEqual(["big"]);

      now += PREVIEW_RETRY_MS;
      stack.schedulePreviews();
      await flush();
      expect(calls).toEqual(["big", "big"]);
    } finally {
      performance.now = realNow;
    }
  });

  test("auto-enter takes the node under the middle of the screen, and only once it's big enough", async () => {
    const root = overview({ groupA: 500 });
    const { rig, stack } = stackOver(fakeSource({ root, groupA: groupScene("groupA", ["itemA"]) }), root);
    const box = stack.current.layout.boxes.find((b) => b.id === "groupA")!;
    const scale = (0.9 * square.width) / box.width;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.width / 2;

    rig.set({ x: cx + box.width * 0.6, y: cy, scale }); // big enough, but the middle of the screen is beside it
    stack.maybeAutoEnterOnZoom();
    await flush();
    expect(stack.current.key).toBe("root");

    rig.set({ x: cx + box.width * 0.3, y: cy, scale }); // off its centre, but the screen's middle is on it
    stack.maybeAutoEnterOnZoom();
    await flush();
    expect(stack.current.key).toBe("groupA");
  });

  test("entering keeps the siblings — and the children they were revealing — exactly where and as opaque as they were", async () => {
    const { rig, stack } = twoGroups();
    frameBetween(rig, stack.current.layout.boxes, ["groupA", "groupB"], 0.3);
    stack.schedulePreviews();
    await flush();
    const boxA = stack.current.layout.boxes.find((b) => b.id === "groupA")!;
    rig.set({ x: boxA.x + boxA.width / 2, y: boxA.y + boxA.width / 2, scale: (0.86 * square.width) / boxA.width });

    const before = stack.transitionView(Infinity);
    const b = stack.current.renderNodes.find((n) => n.id === "groupB")!;
    const bBefore = { ...onScreen(rig, b), alpha: before.currentAlpha!(b) };
    const itemBLayer = before.under.find((layer) => layer.nodes[0]!.id === "itemB");
    const itemBBefore = itemBLayer ? { ...onScreen(rig, itemBLayer.nodes[0]!), alpha: itemBLayer.alpha(itemBLayer.nodes[0]!) } : null;

    void stack.enter("groupA", { approach: false });
    expect(stack.current.key).toBe("groupA");

    const after = stack.transitionView(Infinity);
    const ghostB = after.over!.nodes.find((n) => n.id === "groupB")!;
    expect(onScreen(rig, ghostB).x).toBeCloseTo(bBefore.x, 6);
    expect(onScreen(rig, ghostB).size).toBeCloseTo(bBefore.size, 6);
    expect(after.over!.alpha(ghostB)).toBeCloseTo(bBefore.alpha, 6);
    if (itemBBefore) {
      const layer = after.under.find((l) => l.nodes[0]!.id === "itemB")!;
      expect(onScreen(rig, layer.nodes[0]!).x).toBeCloseTo(itemBBefore.x, 6);
      expect(layer.alpha(layer.nodes[0]!)).toBeCloseTo(itemBBefore.alpha, 6);
    }
  });
});

describe("siblings live on around the current scene, and you can move across into them", () => {
  /** Enters groupA at the auto-enter size; `ghostB` is groupB as drawn around it. */
  async function insideA() {
    const root = overview({ groupA: 500, groupB: 500 });
    const source = fakeSource({ root, groupA: groupScene("groupA", ["itemA"]), groupB: groupScene("groupB", ["itemB"]) });
    const { rig, stack } = stackOver(source, root);
    const boxA = stack.current.layout.boxes.find((b) => b.id === "groupA")!;
    rig.set({ x: boxA.x + boxA.width / 2, y: boxA.y + boxA.width / 2, scale: (0.86 * square.width) / boxA.width });
    await stack.enter("groupA", { approach: false });
    const ghostB = () => stack.transitionView(Infinity).over!.nodes.find((n) => n.id === "groupB")!;
    return { rig, stack, source, ghostB };
  }

  /** Puts the middle of the screen on `node` (current-scene world) at `fill`. */
  function lookAt(rig: CameraRig, node: { x: number; y: number; size: number }, fill: number) {
    rig.set({ x: node.x + node.size / 2, y: node.y + node.size / 2, scale: (fill * square.width) / node.size });
  }

  test("a sibling on screen loads its children while you're inside, and reveals them around you", async () => {
    const { rig, stack, source, ghostB } = await insideA();
    lookAt(rig, ghostB(), 0.5);
    stack.schedulePreviews();
    await flush();
    expect(source.calls).toContain("groupB");
    expect(stack.transitionView(Infinity).under.some((layer) => layer.nodes[0]!.id === "itemB")).toBe(true);
    expect(stack.current.key).toBe("groupA"); // loading alone never moves you
  });

  test("panning across onto a big-enough sibling makes it the current scene, with nothing moving on screen", async () => {
    const { rig, stack, ghostB } = await insideA();
    lookAt(rig, ghostB(), 0.9);
    stack.schedulePreviews();
    await flush();
    const before = stack.transitionView(Infinity).under.find((layer) => layer.nodes[0]!.id === "itemB")!;
    const itemBBefore = onScreen(rig, before.nodes[0]!);

    stack.maybeMoveAcross();
    await flush();
    expect(stack.current.key).toBe("groupB");
    expect(stack.depth).toBe(1);
    const itemB = stack.current.renderNodes.find((n) => n.id === "itemB")!;
    expect(onScreen(rig, itemB).x).toBeCloseTo(itemBBefore.x, 6);
    expect(onScreen(rig, itemB).y).toBeCloseTo(itemBBefore.y, 6);
    expect(onScreen(rig, itemB).size).toBeCloseTo(itemBBefore.size, 6);
    // And the group just left is drawn around the new one, ready to move back into.
    expect(stack.ghostSibling("groupA")).not.toBeNull();
  });

  test("no move while the middle of the screen is still inside the current group, or the sibling is too small to be inside", async () => {
    const { rig, stack, ghostB } = await insideA();
    const { width, height } = stack.current.layout;
    rig.set({ ...rig.camera, x: width / 2, y: height / 2 });
    stack.maybeMoveAcross();
    expect(stack.current.key).toBe("groupA");

    lookAt(rig, ghostB(), 0.3); // on it, but at a size you would zoom out of straight away
    stack.maybeMoveAcross();
    expect(stack.current.key).toBe("groupA");
  });

  test("siblings can be pointed at however far they've thinned — the group you're in never can", async () => {
    const { rig, stack, ghostB } = await insideA();
    lookAt(rig, ghostB(), 0.7);
    stack.schedulePreviews();
    await flush();
    const over = stack.transitionView(Infinity).over!;
    const b = over.nodes.find((n) => n.id === "groupB")!;
    const a = over.nodes.find((n) => n.id === "groupA")!;
    expect(over.alpha(b)).toBeLessThan(0.5); // thinned, revealing its items
    expect(over.pointable!(b)).toBe(true);
    expect(over.pointable!(a)).toBe(false);
  });

  test("a sibling can be entered directly (double-click), and only a sibling", async () => {
    const { stack } = await insideA();
    expect(stack.ghostSibling("groupA")).toBeNull(); // the group you're in is not its own sibling
    await stack.enterSibling("groupB", { approach: false });
    expect(stack.current.key).toBe("groupB");
    expect(stack.depth).toBe(1);
  });

  test("leaving hands the parent back its siblings' children, without loading them again", async () => {
    const { rig, stack, source, ghostB } = await insideA();
    lookAt(rig, ghostB(), 0.5);
    stack.schedulePreviews();
    await flush();
    const callsBefore = source.calls.length;
    await stack.leave(false);
    stack.schedulePreviews();
    await flush();
    expect(source.calls.length).toBe(callsBefore);
    expect(stack.transitionView(Infinity).under.some((layer) => layer.nodes[0]!.id === "itemB")).toBe(true);
  });
});

describe("fixed scenes", () => {
  /** A world of two side-by-side regions, the first holding two places, in one set of units. */
  function world(): Record<string, Scene> {
    const region = (id: string, x: number) => ({
      id,
      label: id,
      weight: 1,
      href: `/regions/${id}`,
      drillsInto: id,
      shape: "square" as const,
      box: { x, y: 0, width: 400, height: 200 },
    });
    const place = (id: string, x: number, y: number) => ({
      id,
      label: id,
      weight: 1,
      href: `/places/${id}`,
      drillsInto: null,
      shape: "square" as const,
      box: { x, y, width: 100, height: 50 },
    });
    return {
      root: { id: "world", heading: "World", layout: "fixed", clusters: [region("east", 0), region("west", 400)], nodes: [], edges: [] },
      east: { id: "east", heading: "East", layout: "fixed", bounds: { x: 0, y: 0, width: 400, height: 200 }, clusters: [], nodes: [place("p", 0, 0), place("q", 300, 150)], edges: [] },
    };
  }

  test("a fixed child whose bounds is its parent item's box is previewed exactly where it will be", async () => {
    const scenes = world();
    const { rig, stack } = stackOver(fakeSource(scenes), scenes.root!, viewport);
    // The world's units, scaled so its longer side is 1,000: `s` world units to one of the data's.
    const s = stack.current.layout.width / 800;
    expect(stack.current.layout.height).toBeCloseTo(200 * s);
    const east = stack.current.layout.boxes.find((b) => b.id === "east")!;
    expect(east).toMatchObject({ x: 0, y: 0, width: 400 * s, height: 200 * s });

    rig.set({ x: 200 * s, y: 100 * s, scale: 1.2 });
    stack.schedulePreviews();
    await flush();
    const preview = stack.transitionView(Infinity).under[0]!.nodes;
    // No margin: the places sit at their own coordinates, in the world's units.
    expect(preview.find((n) => n.id === "p")).toMatchObject({ x: expect.closeTo(0), y: expect.closeTo(0), width: expect.closeTo(100 * s), height: expect.closeTo(50 * s) });
    expect(preview.find((n) => n.id === "q")).toMatchObject({ x: expect.closeTo(300 * s), y: expect.closeTo(150 * s) });
  });

  test("a region's outline and label point travel relative to its box, so a preview keeps them", async () => {
    const scenes = world();
    const east = scenes.east!;
    scenes.east = {
      ...east,
      nodes: [{ ...east.nodes[0]!, shape: "region", outline: [[[[0, 0], [100, 0], [0, 50]]]], labelAt: { x: 25, y: 10 } }, east.nodes[1]!],
    };
    const { rig, stack } = stackOver(fakeSource(scenes), scenes.root!, viewport);
    rig.set({ x: 250, y: 125, scale: 1.2 });
    stack.schedulePreviews();
    await flush();
    const p = stack.transitionView(Infinity).under[0]!.nodes.find((n) => n.id === "p")!;
    expect(p.outline).toEqual([[[[0, 0], [1, 0], [0, 1]]]]);
    expect(p.labelAt).toEqual({ x: 0.25, y: 0.2 });
    // A square ignores both.
    expect(stack.transitionView(Infinity).under[0]!.nodes.find((n) => n.id === "q")).toMatchObject({ outline: null, labelAt: null });
  });

  test("entering and leaving keep a place where it was on screen", async () => {
    const scenes = world();
    const { rig, stack } = stackOver(fakeSource(scenes), scenes.root!, viewport);
    const s = stack.current.layout.width / 800;
    rig.set({ x: 200 * s, y: 100 * s, scale: 1.2 });
    const before = rig.worldToScreen(300 * s, 150 * s); // q's corner
    await stack.enter("east", { approach: false });
    expect(stack.current.key).toBe("east");
    const q = stack.current.renderNodes.find((n) => n.id === "q")!;
    const after = rig.worldToScreen(q.x, q.y);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(q.width * rig.camera.scale).toBeCloseTo(100 * s * 1.2, 6);

    // The sibling, drawn round the region you are in, is where it was too.
    const west = stack.transitionView(Infinity).over!.nodes.find((n) => n.id === "west")!;
    expect(rig.worldToScreen(west.x, west.y).x).toBeCloseTo(before.x + 100 * s * 1.2, 6);

    await stack.leave(false);
    expect(stack.current.key).toBe("root");
    expect(rig.worldToScreen(300 * s, 150 * s).x).toBeCloseTo(before.x, 6);
  });
});
