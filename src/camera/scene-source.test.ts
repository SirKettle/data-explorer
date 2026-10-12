import { describe, expect, test } from "bun:test";
import type { ParentLink, SceneSource } from "../scene/source";
import type { ExplorerScene } from "../scene/types";
import { CameraRig } from "./camera";
import { createSceneStack } from "./scene-stack";

/**
 * US070 plan Step 2 — the scene stack against a hand-written, non-LEGO `SceneSource`: a tiny folder
 * tree whose focus is a path string. Nothing here touches the LEGO adapter or loader, which is the
 * point: the stack must work from the contract alone. Each `ParentLink` case is exercised.
 */

const viewport = { width: 800, height: 600 };

/** `/` holds `docs` and `src`; `docs` holds `a.md`; `src` holds `lib`; `lib` holds `x.ts`. A file's
 *  own scene is a radial neighbourhood with no single folder to anchor in, so it climbs unanchored. */
const tree: Record<string, string[]> = { "/": ["docs", "src"], "/docs": ["a.md"], "/src": ["lib"], "/src/lib": ["x.ts"] };
const isFolder = (path: string) => path in tree;
const join = (dir: string, name: string) => (dir === "/" ? `/${name}` : `${dir}/${name}`);
const parentPath = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

function folderScene(path: string): ExplorerScene<string> {
  const children = tree[path]!.map((name) => join(path, name));
  return {
    id: path,
    heading: path,
    clusters: children.filter(isFolder).map((child) => ({
      id: nameOf(child),
      label: nameOf(child),
      weight: 10,
      marks: [],
      href: `#${child}`,
      drillsInto: child,
      shape: "cloud",
      truncated: null,
    })),
    nodes: children
      .filter((child) => !isFolder(child))
      .map((child) => ({ id: nameOf(child), label: nameOf(child), weight: 1, marks: [], href: `#${child}`, drillsInto: child, shape: "disc" })),
    edges: [],
  };
}

function fileScene(path: string): ExplorerScene<string> {
  const id = nameOf(path);
  return { id: path, heading: id, clusters: [], nodes: [{ id, label: id, weight: 1, marks: [], href: `#${path}`, drillsInto: path, shape: "disc" }], edges: [], focusId: id };
}

function folderSource(overrides: Partial<SceneSource<string>> = {}): SceneSource<string> & { loads: string[] } {
  const loads: string[] = [];
  const cache = new Map<string, Promise<ExplorerScene<string>>>();
  const keyOf = (focus: string | null) => focus ?? "root";
  return {
    loads,
    keyOf,
    loadScene(focus) {
      const key = keyOf(focus);
      const hit = cache.get(key);
      if (hit) return hit;
      loads.push(key);
      const path = focus ?? "/";
      const scene = Promise.resolve(isFolder(path) ? folderScene(path) : fileScene(path));
      cache.set(key, scene);
      return scene;
    },
    isCached: (focus) => cache.has(keyOf(focus)),
    async parentOf(focus): Promise<ParentLink<string>> {
      if (!isFolder(focus)) return { kind: "unanchored", focus: parentPath(focus) === "/" ? null : parentPath(focus) };
      const parent = parentPath(focus);
      return { kind: "anchored", focus: parent === "/" ? null : parent, anchorId: nameOf(focus) };
    },
    ...overrides,
  };
}

async function stackAt(focus: string | null, source = folderSource()) {
  const rig = new CameraRig(() => viewport, { x: 0, y: 0, scale: 1 });
  const applied: string[] = [];
  const stack = createSceneStack({ rig, source, initialFocus: focus, initialScene: await source.loadScene(focus), applyScene: (s) => applied.push(s.key) });
  return { stack, source, applied };
}

describe("scene stack over a hand-written folder-tree SceneSource (US070 Step 2)", () => {
  test("drilling follows each item's declared drillsInto, keyed by the source's keyOf", async () => {
    const { stack } = await stackAt(null);
    expect(stack.current.key).toBe("root");
    expect(stack.current.renderNodes.filter((n) => n.drillable).map((n) => n.id).sort()).toEqual(["docs", "src"]);

    await stack.enter("src", { approach: false });
    expect(stack.current.key).toBe("/src");
    expect(stack.current.focus).toBe("/src");
    await stack.enter("lib", { approach: false });
    expect(stack.current.key).toBe("/src/lib");
    expect(stack.depth).toBe(2);
  });

  test("anchored: a deep-linked folder pushes a frame anchored on its own box, which leave() consumes", async () => {
    const { stack, applied } = await stackAt("/src/lib");
    await stack.climbToParent();
    expect(stack.depth).toBe(1);
    expect(stack.current.key).toBe("/src/lib"); // a frame was pushed; nothing swapped yet
    await stack.leave(false);
    expect(stack.current.key).toBe("/src");
    expect(applied.at(-1)).toBe("/src");
  });

  test("anchored to the root: a top-level folder climbs to the root scene", async () => {
    const { stack } = await stackAt("/docs");
    await stack.climbToParent();
    await stack.leave(false);
    expect(stack.current.key).toBe("root");
  });

  test("unanchored: a file swaps straight to its folder, with no frame to leave", async () => {
    const { stack, applied } = await stackAt("/src/lib/x.ts");
    await stack.climbToParent();
    expect(stack.depth).toBe(0);
    expect(stack.current.key).toBe("/src/lib");
    expect(applied).toEqual(["/src/lib"]);
  });

  test("none: a source that reports no parent leaves the stack and camera untouched", async () => {
    const source = folderSource({ parentOf: async () => ({ kind: "none" }) });
    const { stack, applied } = await stackAt("/src", source);
    await stack.climbToParent();
    expect(stack.depth).toBe(0);
    expect(stack.current.key).toBe("/src");
    expect(applied).toEqual([]);
  });

  test("an anchored parent whose scene lacks the anchor leaves the camera untouched", async () => {
    const source = folderSource({ parentOf: async () => ({ kind: "anchored", focus: "/src", anchorId: "missing" }) });
    const { stack, applied } = await stackAt("/src/lib", source);
    await stack.climbToParent();
    expect(stack.depth).toBe(0);
    expect(stack.current.key).toBe("/src/lib");
    expect(applied).toEqual([]);
  });

  test("a parentOf rejection leaves the camera untouched", async () => {
    const source = folderSource({ parentOf: () => Promise.reject(new Error("offline")) });
    const { stack, applied } = await stackAt("/src", source);
    await stack.climbToParent();
    expect(stack.current.key).toBe("/src");
    expect(applied).toEqual([]);
  });

  test("without loadSceneStreaming or refreshScene the stack falls back to loadScene", async () => {
    const source = folderSource();
    const { stack } = await stackAt(null, source);
    await stack.enter("docs", { approach: false });
    expect(stack.current.key).toBe("/docs");
    expect(source.loads).toEqual(["root", "/docs"]);
  });
});
