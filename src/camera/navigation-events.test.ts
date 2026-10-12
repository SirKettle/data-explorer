import { describe, expect, test } from "bun:test";
import type { SceneSource } from "../scene/source";
import { deepTree } from "../../test/fixtures";
import { CameraRig } from "./camera";
import { createSceneStack, type NavigationDirection } from "./scene-stack";

/**
 * US071 Step 2 / AC6 — the scene stack reports every navigation, and only navigations, with the
 * scene left, the scene arrived at and the direction, after `applyScene`.
 */

const viewport = { width: 800, height: 600 };

async function stackAt<F>(source: SceneSource<F>, focus: F | null) {
  const rig = new CameraRig(() => viewport, { x: 0, y: 0, scale: 1 });
  const log: string[] = [];
  const stack = createSceneStack({
    rig,
    source,
    initialFocus: focus,
    initialScene: await source.loadScene(focus),
    applyScene: (s) => log.push(`apply ${s.key}`),
    onNavigate: ({ from, to, direction }: { from: { key: string }; to: { key: string }; direction: NavigationDirection }) =>
      log.push(`${direction} ${from.key} -> ${to.key}`),
  });
  return { stack, log };
}

describe("onNavigate (US071 AC6)", () => {
  test("enter and leave report in and out, each after the scene is applied", async () => {
    const { stack, log } = await stackAt(deepTree(), null);
    await stack.enter("d1", { approach: false });
    await stack.enter("d2", { approach: false });
    await stack.leave(false);
    await stack.leave(false);
    expect(log).toEqual([
      "apply /d1",
      "in root -> /d1",
      "apply /d1/d2",
      "in /d1 -> /d1/d2",
      "apply /d1",
      "out /d1/d2 -> /d1",
      "apply root",
      "out /d1 -> root",
    ]);
  });

  test("an anchored climb fires nothing until the leave that swaps to the parent, which reports out", async () => {
    const { stack, log } = await stackAt(deepTree(), "/d1/d2");
    await stack.climbToParent();
    expect(log).toEqual([]);
    await stack.leave(false);
    expect(log).toEqual(["apply /d1", "out /d1/d2 -> /d1"]);
  });

  test("an unanchored climb swaps at once and reports out", async () => {
    const tree = deepTree();
    const source: SceneSource<string> = { ...tree, parentOf: async () => ({ kind: "unanchored", focus: null }) };
    const { stack, log } = await stackAt(source, "/d1/d2");
    await stack.climbToParent();
    expect(log).toEqual(["apply root", "out /d1/d2 -> root"]);
  });

  test("jumpTo and reset report jump; a jump to the current focus reports nothing", async () => {
    const { stack, log } = await stackAt(deepTree(), null);
    await stack.jumpTo(null);
    expect(log).toEqual([]);
    await stack.jumpTo("/d1/d2");
    await stack.reset();
    expect(log).toEqual(["apply /d1/d2", "jump root -> /d1/d2", "apply root", "jump /d1/d2 -> root"]);
  });

  test("a refresh of the same scene is not a navigation", async () => {
    const { stack, log } = await stackAt(deepTree(), "/d1");
    expect(await stack.refreshCurrent()).toBe(true);
    expect(log).toEqual(["apply /d1"]);
  });

  test("a failed enter reports nothing", async () => {
    const tree = deepTree();
    const source: SceneSource<string> = {
      ...tree,
      loadScene: (focus) => (focus === "/d1" ? Promise.reject(new Error("offline")) : tree.loadScene(focus)),
    };
    const { stack, log } = await stackAt(source, null);
    await stack.enter("d1", { approach: false });
    expect(log).toEqual([]);
    expect(stack.current.key).toBe("root");
  });
});
