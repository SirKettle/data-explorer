import type { ParentLink, SceneSource } from "../src/scene/source";
import { windowed, type ExplorerCluster, type ExplorerNode, type ExplorerScene } from "../src/scene/types";

/**
 * US070 plan Step 5 / AC4 — data structures with nothing in common with any one consumer's domain, each exposed
 * as a `SceneSource`, so the core's tests prove the contract rather than one consumer of it. Test
 * support only: nothing outside a test imports this file.
 *
 * - `deepTree`: 7 levels of folders, plus one folder with 600 files, windowed with an honest
 *   aggregate for the rest.
 * - `dag`: one node with two parents; `parentOf` picks the first, as a consumer must.
 * - `cycle`: A → B → C → A as radial neighbourhoods joined by typed edges.
 * - `numbered`: a chain whose focus is a number and starts at `0`, a falsy value that must still
 *   count as a real focus.
 */

export interface FixtureSource<F> extends SceneSource<F> {
  /** Every load that missed the cache, by key, in order. */
  loads: string[];
}

function cachedSource<F>(
  keyOf: (focus: F | null) => string,
  build: (focus: F | null) => ExplorerScene<F>,
  parentOf: (focus: F, current: ExplorerScene<F>) => ParentLink<F>,
): FixtureSource<F> {
  const loads: string[] = [];
  const cache = new Map<string, Promise<ExplorerScene<F>>>();
  return {
    loads,
    keyOf,
    loadScene(focus) {
      const key = keyOf(focus);
      const hit = cache.get(key);
      if (hit) return hit;
      loads.push(key);
      const scene = Promise.resolve().then(() => build(focus));
      cache.set(key, scene);
      return scene;
    },
    isCached: (focus) => cache.has(keyOf(focus)),
    parentOf: async (focus, current) => parentOf(focus, current),
  };
}

const cluster = <F>(id: string, drillsInto: F | null, weight = 10): ExplorerCluster<F> => ({
  id,
  label: id,
  weight,
  marks: [],
  href: `#${id}`,
  drillsInto,
  shape: "cloud",
  truncated: null,
});

const node = <F>(id: string, drillsInto: F | null, weight = 1): ExplorerNode<F> => ({
  id,
  label: id,
  weight,
  marks: [],
  href: `#${id}`,
  drillsInto,
  shape: "disc",
});

const scene = <F>(id: string, clusters: ExplorerCluster<F>[], nodes: ExplorerNode<F>[], extra: Partial<ExplorerScene<F>> = {}): ExplorerScene<F> => ({
  id,
  heading: id,
  clusters,
  nodes,
  edges: [],
  ...extra,
});

/** The most items a fixture folder shows before the rest become one aggregate. */
export const WIDE_BUDGET = 160;
export const DEEP_LEVELS = 7;
export const WIDE_FILES = 600;

/**
 * Folders `/d1`, `/d1/d2`, … `/d1/…/d7`, each also holding a file; the root also holds `/wide`
 * with `WIDE_FILES` files. Focus is the folder's path.
 */
export function deepTree(): FixtureSource<string> {
  const isWide = (path: string) => path === "/wide";
  const depthOf = (path: string) => (path === "/" ? 0 : path.split("/").length - 1);
  const parentPath = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
  const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
  return cachedSource<string>(
    (focus) => focus ?? "root",
    (focus) => {
      const path = focus ?? "/";
      if (isWide(path)) {
        const files = Array.from({ length: WIDE_FILES }, (_, i) => node<string>(`file-${i}`, null));
        const { shown, truncated } = windowed(files, WIDE_BUDGET);
        const rest: ExplorerCluster<string>[] = truncated
          ? [{ ...cluster<string>("rest", null, truncated.total - truncated.shown), href: null, shape: "disc", truncated }]
          : [];
        return scene(path, rest, shown);
      }
      const depth = depthOf(path);
      const children: ExplorerCluster<string>[] = [];
      if (depth < DEEP_LEVELS) children.push(cluster(`d${depth + 1}`, `${path === "/" ? "" : path}/d${depth + 1}`));
      if (depth === 0) children.push(cluster("wide", "/wide", 50));
      return scene<string>(path, children, [node<string>(`file-at-${depth}`, null)]);
    },
    (focus) => ({ kind: "anchored", focus: parentPath(focus) === "/" ? null : parentPath(focus), anchorId: nameOf(focus) }),
  );
}

/** Root holds B and C; both hold D; D holds E. D's parent, for zooming out, is B — the first. */
export function dag(): FixtureSource<string> {
  const children: Record<string, string[]> = { root: ["B", "C"], B: ["D"], C: ["D"], D: ["E"], E: [] };
  const parents: Record<string, string[]> = { B: [], C: [], D: ["B", "C"], E: ["D"] };
  return cachedSource<string>(
    (focus) => focus ?? "root",
    (focus) => scene<string>(focus ?? "root", children[focus ?? "root"]!.map((child) => cluster<string>(child, child)), []),
    (focus) => ({ kind: "anchored", focus: parents[focus]![0] ?? null, anchorId: focus }),
  );
}

/**
 * A → B → C → A. The root shows A; each node's scene is its neighbourhood: itself (the focus) and
 * the next node, joined by a `next` edge. There is no single parent in a cycle, so zooming out is
 * an unanchored swap to the root.
 */
export function cycle(): FixtureSource<string> {
  const next: Record<string, string> = { A: "B", B: "C", C: "A" };
  return cachedSource<string>(
    (focus) => focus ?? "root",
    (focus) => {
      if (focus === null) return scene<string>("root", [cluster<string>("A", "A")], []);
      const after = next[focus]!;
      return scene<string>(focus, [], [node<string>(focus, focus, 5), node<string>(after, after, 5)], {
        focusId: focus,
        edges: [{ id: `${focus}->${after}`, sourceId: focus, targetId: after, kind: "next" }],
      });
    },
    () => ({ kind: "unanchored", focus: null }),
  );
}

/** root → 0 → 1 → 2 → 3, focus being the number. `0` is a real focus, distinct from the root. */
export function numbered(): FixtureSource<number> {
  const last = 3;
  return cachedSource<number>(
    (focus) => (focus === null ? "root" : `n${focus}`),
    (focus) => {
      const child = focus === null ? 0 : focus + 1;
      return scene<number>(focus === null ? "root" : `n${focus}`, child <= last ? [cluster<number>(`n${child}`, child)] : [], [node<number>("leaf", null)]);
    },
    (focus) => ({ kind: "anchored", focus: focus === 0 ? null : focus - 1, anchorId: `n${focus}` }),
  );
}
