import { describe, expect, test } from "bun:test";
import { radialFocusLayout, sunflowerLayout, sunflowerLayoutAppend, type ExplorerBox } from "./layout";
import type { ExplorerScene } from "./types";

/** Plain `bun test`, no DOM, no network (Step 3's exit criteria). */

function cluster(id: string, weight: number) {
  return { id, label: id, weight, marks: [], href: null, drillsInto: null, shape: "disc" as const, truncated: null };
}

function node(id: string, weight = 1) {
  return { id, label: id, weight, marks: [], href: `/things/${id}`, drillsInto: null, shape: "disc" as const };
}

function neighbourhoodScene(): ExplorerScene {
  return {
    id: "scene-2",
    heading: "Focused set",
    clusters: [],
    nodes: [node("focus"), node("leaf-a"), node("leaf-b"), node("group-1")],
    edges: [
      { id: "e1", sourceId: "focus", targetId: "leaf-a", kind: "member" },
      { id: "e2", sourceId: "focus", targetId: "leaf-b", kind: "member" },
      { id: "e3", sourceId: "focus", targetId: "group-1", kind: "group" },
    ],
    focusId: "focus",
  };
}

function overlaps(a: ExplorerBox, b: ExplorerBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** A scene sized closer to a real busy tier than a handful of items — large enough that a
 *  regression to a grid-like or otherwise-collision-prone arrangement would show up in the
 *  no-overlap check, small enough that the O(n²) overlap check stays fast. */
function manyItemsScene(count: number): ExplorerScene {
  const clusters = Array.from({ length: count }, (_, i) => cluster(`c${i}`, 5 + ((i * 37) % 500)));
  return { id: "scene-scatter", heading: "Scattered", clusters, nodes: [], edges: [] };
}

describe("sunflowerLayout (US036 plan Step 3.1 / ADR-016 amendment A5)", () => {
  test("is deterministic: identical scene produces identical positions", () => {
    const scene = manyItemsScene(40);
    expect(sunflowerLayout(scene)).toEqual(sunflowerLayout(scene));
  });

  test("no two boxes overlap, at a scale closer to a real busy tier", () => {
    const layout = sunflowerLayout(manyItemsScene(60));
    for (let i = 0; i < layout.boxes.length; i++) {
      for (let j = i + 1; j < layout.boxes.length; j++) {
        expect(overlaps(layout.boxes[i] as ExplorerBox, layout.boxes[j] as ExplorerBox)).toBe(false);
      }
    }
  });

  test("position says nothing about weight: the heaviest items are not gathered in the middle", () => {
    // Placing heaviest-first read as a lit globe (big in the middle, small at the rim). With hash
    // order the heaviest third should sit about as far out as the lightest third, not far inside.
    const scene = manyItemsScene(30);
    const byWeight = [...scene.clusters].sort((a, b) => b.weight - a.weight);
    const layout = sunflowerLayout(scene);
    const centreX = layout.width / 2;
    const centreY = layout.height / 2;
    const meanDistance = (ids: string[]) =>
      ids.reduce((sum, id) => {
        const box = layout.boxes.find((b) => b.id === id)!;
        return sum + Math.hypot(box.x + box.width / 2 - centreX, box.y + box.height / 2 - centreY);
      }, 0) / ids.length;
    const heaviest = meanDistance(byWeight.slice(0, 10).map((c) => c.id));
    const lightest = meanDistance(byWeight.slice(-10).map((c) => c.id));
    expect(heaviest / lightest).toBeGreaterThan(0.75);
  });

  test("arrival order, not input weight, decides placement — and the same order always lays out the same", () => {
    const scene = manyItemsScene(20);
    expect(sunflowerLayout({ ...scene })).toEqual(sunflowerLayout(scene));
    const reversed: ExplorerScene = { ...scene, clusters: [...scene.clusters].reverse() };
    expect(sunflowerLayout(reversed)).not.toEqual(sunflowerLayout(scene));
  });

  test("every box fits within the reported (square) bounding size", () => {
    const layout = sunflowerLayout(manyItemsScene(50));
    expect(layout.width).toBe(layout.height); // a circular cluster has no reason to be non-square
    for (const box of layout.boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(layout.width);
      expect(box.y + box.height).toBeLessThanOrEqual(layout.height);
    }
  });

  test("weight still scales box size the same sqrt-scaled way every layout in this file uses", () => {
    const scene = manyItemsScene(10);
    const layout = sunflowerLayout(scene);
    const byId = new Map(layout.boxes.map((box) => [box.id, box]));
    const heaviest = [...scene.clusters].sort((a, b) => b.weight - a.weight)[0]!;
    const lightest = [...scene.clusters].sort((a, b) => a.weight - b.weight)[0]!;
    expect(byId.get(heaviest.id)!.width).toBeGreaterThan(byId.get(lightest.id)!.width);
  });

  test("a cluster is at least twice the size of the biggest node in the same scene, even when its own weight is smaller", () => {
    const scene: ExplorerScene = {
      id: "group-mix",
      heading: "Mixed",
      clusters: [cluster("small-subgroup", 1)],
      nodes: [node("big-set", 10_000), node("small-set", 1)],
      edges: [],
    };
    const layout = sunflowerLayout(scene);
    const byId = new Map(layout.boxes.map((box) => [box.id, box]));
    const biggestNodeSize = Math.max(byId.get("big-set")!.width, byId.get("small-set")!.width);
    expect(byId.get("small-subgroup")!.width).toBeGreaterThanOrEqual(biggestNodeSize * 2);
  });

  test("clusters still vary in size against each other, above the node floor", () => {
    const scene: ExplorerScene = {
      id: "group-mix-2",
      heading: "Mixed",
      clusters: [cluster("small-subgroup", 1), cluster("big-subgroup", 1000)],
      nodes: [node("only-set", 50)],
      edges: [],
    };
    const layout = sunflowerLayout(scene);
    const byId = new Map(layout.boxes.map((box) => [box.id, box]));
    expect(byId.get("big-subgroup")!.width).toBeGreaterThan(byId.get("small-subgroup")!.width);
    expect(byId.get("small-subgroup")!.width).toBeGreaterThanOrEqual(byId.get("only-set")!.width * 2);
  });

  test("with no nodes at all (the L0 catalogue overview), clusters fall back to the ordinary MIN_BOX/MAX_BOX range", () => {
    const layout = sunflowerLayout(manyItemsScene(5));
    for (const box of layout.boxes) {
      expect(box.width).toBeGreaterThanOrEqual(32);
      expect(box.width).toBeLessThanOrEqual(220);
    }
  });
});

describe("radialFocusLayout (US036 plan Step 3R.1 / D2 — viewport-free focus/neighbourhood ring)", () => {
  test("is deterministic and viewport-free: identical scene produces identical positions with no viewport argument", () => {
    const scene = neighbourhoodScene();
    expect(radialFocusLayout(scene)).toEqual(radialFocusLayout(scene));
  });

  test("the focus node is centred in local layout space and every neighbour is positioned exactly once", () => {
    const layout = radialFocusLayout(neighbourhoodScene());
    const focusBox = layout.boxes.find((box) => box.id === "focus");
    expect(focusBox).toBeDefined();
    expect(focusBox!.x + focusBox!.width / 2).toBeCloseTo(layout.width / 2, 0);
    expect(focusBox!.y + focusBox!.height / 2).toBeCloseTo(layout.height / 2, 0);

    const ids = layout.boxes.map((box) => box.id).sort();
    expect(ids).toEqual(["leaf-a", "leaf-b", "focus", "group-1"].sort());
  });

  test("neighbour grouping/ordering: (kind, id) determines angle, not edge array order", () => {
    const scene = neighbourhoodScene();
    const reordered: ExplorerScene = { ...scene, edges: [...scene.edges].reverse() };
    expect(radialFocusLayout(scene)).toEqual(radialFocusLayout(reordered));
  });

  test("a node with no edge to the focus is not placed as a neighbour", () => {
    const scene = neighbourhoodScene();
    const withUnrelated: ExplorerScene = { ...scene, nodes: [...scene.nodes, node("unrelated")] };
    const layout = radialFocusLayout(withUnrelated);
    expect(layout.boxes.some((box) => box.id === "unrelated")).toBe(false);
  });

  test("every neighbour gets a distinct position at ring density (55 neighbours — the real density that found the spike's label-collision bug)", () => {
    // Unlike `sunflowerLayout`, the ring carries no per-item positional jitter — at high enough
    // density adjacent boxes can legitimately touch; what must still hold is that every neighbour
    // is actually placed, once, at its own angle.
    const neighbours = Array.from({ length: 55 }, (_, i) => node(`n${i}`, 1 + ((i * 13) % 40)));
    const edges = neighbours.map((n) => ({ id: `e-${n.id}`, sourceId: "focus", targetId: n.id, kind: "member" }));
    const scene: ExplorerScene = { id: "ring", heading: "Ring", clusters: [], nodes: [node("focus"), ...neighbours], edges, focusId: "focus" };
    const layout = radialFocusLayout(scene);
    expect(layout.boxes.length).toBe(neighbours.length + 1);
    const positions = new Set(layout.boxes.map((box) => `${box.x.toFixed(2)},${box.y.toFixed(2)}`));
    expect(positions.size).toBe(layout.boxes.length);
  });

  test("heavier neighbour weight produces a strictly larger box, the same sqrt-scaled rule every other layout in this file uses", () => {
    const scene: ExplorerScene = {
      id: "weighted",
      heading: "Weighted",
      clusters: [],
      nodes: [node("focus"), node("heavy", 900), node("light", 1)],
      edges: [
        { id: "e1", sourceId: "focus", targetId: "heavy", kind: "member" },
        { id: "e2", sourceId: "focus", targetId: "light", kind: "member" },
      ],
      focusId: "focus",
    };
    const layout = radialFocusLayout(scene);
    const byId = new Map(layout.boxes.map((box) => [box.id, box]));
    expect(byId.get("heavy")!.width).toBeGreaterThan(byId.get("light")!.width);
  });

  test("every box fits within the reported bounding size", () => {
    const layout = radialFocusLayout(neighbourhoodScene());
    for (const box of layout.boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(layout.width);
      expect(box.y + box.height).toBeLessThanOrEqual(layout.height);
    }
  });
});

describe("sunflowerLayoutAppend (US036 progressive group loading)", () => {
  test("every already-placed box is copied through with bit-for-bit identical x/y — this is the whole point", () => {
    const first = manyItemsScene(10);
    const firstLayout = sunflowerLayout(first);

    const grown: ExplorerScene = { ...first, clusters: [...first.clusters, cluster("c-new-1", 200), cluster("c-new-2", 5)] };
    const appended = sunflowerLayoutAppend(grown, firstLayout);

    for (const box of firstLayout.boxes) {
      const same = appended.boxes.find((b) => b.id === box.id);
      expect(same).toEqual(box);
    }
  });

  test("new items are placed, and width/height are frozen at whatever `previous` already reported", () => {
    const first = manyItemsScene(5);
    const firstLayout = sunflowerLayout(first);
    const grown: ExplorerScene = { ...first, clusters: [...first.clusters, cluster("c-new", 50)] };

    const appended = sunflowerLayoutAppend(grown, firstLayout);

    expect(appended.boxes.some((b) => b.id === "c-new")).toBe(true);
    expect(appended.boxes.length).toBe(firstLayout.boxes.length + 1);
    expect(appended.width).toBe(firstLayout.width);
    expect(appended.height).toBe(firstLayout.height);
  });

  test("calling it again with nothing new is a true no-op: the identical layout object is returned", () => {
    const scene = manyItemsScene(5);
    const layout = sunflowerLayout(scene);
    expect(sunflowerLayoutAppend(scene, layout)).toBe(layout);
  });

  test("is deterministic: the same (scene, previous) pair produces identical new positions", () => {
    const first = manyItemsScene(6);
    const firstLayout = sunflowerLayout(first);
    const grown: ExplorerScene = { ...first, clusters: [...first.clusters, cluster("c-new", 30)] };

    expect(sunflowerLayoutAppend(grown, firstLayout)).toEqual(sunflowerLayoutAppend(grown, firstLayout));
  });

  test("chained appends (simulating several streamed pages) still never move an earlier page's boxes", () => {
    const page1 = manyItemsScene(4);
    let layout = sunflowerLayout(page1);
    const page1Boxes = [...layout.boxes];

    const page2: ExplorerScene = { ...page1, clusters: [...page1.clusters, cluster("p2-a", 40), cluster("p2-b", 10)] };
    layout = sunflowerLayoutAppend(page2, layout);

    const page3: ExplorerScene = { ...page2, clusters: [...page2.clusters, cluster("p3-a", 900)] }; // heavier than everything already placed
    layout = sunflowerLayoutAppend(page3, layout);

    for (const box of page1Boxes) {
      expect(layout.boxes.find((b) => b.id === box.id)).toEqual(box);
    }
    expect(layout.boxes.map((b) => b.id).sort()).toEqual(
      [...page1.clusters.map((c) => c.id), "p2-a", "p2-b", "p3-a"].sort(),
    );
  });
});

/** A theme-like scene: `total` same-weight nodes (so streamed and fresh sizes agree), of which only
 *  the first `loaded` have arrived, with the theme's full count declared up front. */
function streamingScene(loaded: number, total: number, weight: (i: number) => number = () => 10): ExplorerScene {
  return {
    id: "group:streaming",
    heading: "Streaming",
    clusters: [],
    nodes: Array.from({ length: loaded }, (_, i) => node(`s${i}`, weight(i))),
    edges: [],
    expectedItemCount: total,
  };
}

function centreDistance(layout: { width: number; height: number }, box: ExplorerBox): number {
  return Math.hypot(box.x + box.width / 2 - layout.width / 2, box.y + box.height / 2 - layout.height / 2);
}

describe("scattered spiral: sized up front, denser in the middle, soft at the edge", () => {
  test("a group streamed page by page lands every item exactly where a whole layout of it would", () => {
    let layout = sunflowerLayout(streamingScene(50, 200));
    for (const loaded of [100, 150, 200]) layout = sunflowerLayoutAppend(streamingScene(loaded, 200), layout);
    expect(layout).toEqual(sunflowerLayout(streamingScene(200, 200)));
  });

  test("page 1 already reserves the whole group's extent: later pages stay inside it, and it never grows", () => {
    const weight = (i: number) => 1 + ((i * 7919) % 900);
    let layout = sunflowerLayout(streamingScene(50, 400, weight));
    const { width, height } = layout;
    for (const loaded of [100, 200, 300, 400]) layout = sunflowerLayoutAppend(streamingScene(loaded, 400, weight), layout);
    expect(layout.width).toBe(width);
    expect(layout.height).toBe(height);
    for (const box of layout.boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
  });

  test("the first page is scattered across the reserved disc, not packed into its middle", () => {
    const layout = sunflowerLayout(streamingScene(50, 1000));
    const farthest = Math.max(...layout.boxes.map((box) => centreDistance(layout, box)));
    expect(farthest).toBeGreaterThan(layout.width / 2 / 2);
  });

  test("no two boxes overlap, even with mixed sizes streaming in", () => {
    const weight = (i: number) => 1 + ((i * 7919) % 900);
    let layout = sunflowerLayout(streamingScene(60, 300, weight));
    for (const loaded of [150, 300]) layout = sunflowerLayoutAppend(streamingScene(loaded, 300, weight), layout);
    for (let i = 0; i < layout.boxes.length; i++) {
      for (let j = i + 1; j < layout.boxes.length; j++) {
        expect(overlaps(layout.boxes[i]!, layout.boxes[j]!)).toBe(false);
      }
    }
  });

  test("items sit progressively further apart towards the rim", () => {
    const layout = sunflowerLayout(streamingScene(600, 600));
    const sorted = [...layout.boxes].sort((a, b) => centreDistance(layout, a) - centreDistance(layout, b));
    const nearestGap = (box: ExplorerBox) =>
      Math.min(...layout.boxes.filter((other) => other !== box).map((other) => Math.hypot(other.x - box.x, other.y - box.y)));
    const mean = (boxes: ExplorerBox[]) => boxes.reduce((sum, box) => sum + nearestGap(box), 0) / boxes.length;
    const inner = mean(sorted.slice(0, 100));
    const outer = mean(sorted.slice(-100));
    expect(outer).toBeGreaterThan(inner * 1.3);
  });

  test("the edge frays rather than ending in a clean circle", () => {
    const layout = sunflowerLayout(streamingScene(600, 600));
    const radii = layout.boxes.map((box) => centreDistance(layout, box)).sort((a, b) => b - a);
    const rim = radii.slice(0, 60);
    const mean = rim.reduce((sum, r) => sum + r, 0) / rim.length;
    const spread = Math.sqrt(rim.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rim.length);
    expect(spread / mean).toBeGreaterThan(0.04);
  });
});

