import { describe, expect, test } from "bun:test";
import { createSceneSource } from "./create-source";
import type { ExplorerScene } from "./types";

/** US072 review change 3: a whole `SceneSource` from one `load` function. */

const scene = (id: string): ExplorerScene<string> => ({ id, heading: id, clusters: [], nodes: [], edges: [] });

describe("createSceneSource (US072 change 3)", () => {
  test("loads each focus once, and answers isCached without loading", async () => {
    const loads: (string | null)[] = [];
    const source = createSceneSource<string>({
      load: (focus) => {
        loads.push(focus);
        return scene(focus ?? "top");
      },
    });
    expect(source.isCached(null)).toBe(false);
    expect(loads).toEqual([]);
    await source.loadScene(null);
    await source.loadScene(null);
    await source.loadScene("a");
    expect(loads).toEqual([null, "a"]);
    expect(source.isCached(null)).toBe(true);
    expect(source.isCached("b")).toBe(false);
  });

  test("a failed load is not cached, so the next call retries", async () => {
    let fail = true;
    const source = createSceneSource<string>({
      load: async (focus) => {
        if (fail) throw new Error("offline");
        return scene(focus ?? "top");
      },
    });
    await expect(source.loadScene("a")).rejects.toThrow("offline");
    expect(source.isCached("a")).toBe(false);
    fail = false;
    expect((await source.loadScene("a")).id).toBe("a");
  });

  test("invalidate forgets one focus or all, and tells subscribed explorers", async () => {
    let version = 1;
    const source = createSceneSource<string>({ load: (focus) => scene(`${focus ?? "top"}@${version}`) });
    let told = 0;
    const unsubscribe = source.subscribeToInvalidation!(() => told++);
    await source.loadScene("a");
    await source.loadScene("b");
    version = 2;
    source.invalidate("a");
    expect(told).toBe(1);
    expect(source.isCached("a")).toBe(false);
    expect(source.isCached("b")).toBe(true);
    expect((await source.loadScene("a")).id).toBe("a@2");
    source.invalidate();
    expect(source.isCached("b")).toBe(false);
    unsubscribe();
    source.invalidate();
    expect(told).toBe(2);
  });

  test("refreshScene reloads one scene", async () => {
    let version = 1;
    const source = createSceneSource<string>({ load: (focus) => scene(`${focus}@${version}`) });
    await source.loadScene("a");
    version = 2;
    expect((await source.refreshScene!("a")).id).toBe("a@2");
  });

  test("parentOf defaults to nothing above; keyOf defaults sensibly", async () => {
    const source = createSceneSource<string | number | { kind: string; id: number }>({ load: () => scene("x") });
    expect(await source.parentOf("a", scene("a"))).toEqual({ kind: "none" });
    expect(source.keyOf(null)).toBe("root");
    expect(source.keyOf("folder/a")).toBe("folder/a");
    expect(source.keyOf(7)).toBe("7");
    expect(source.keyOf({ kind: "module", id: 3 })).toBe('{"kind":"module","id":3}');
  });

  test("streaming resolves with the first part, and the cache keeps the fullest scene seen", async () => {
    let finish: (s: ExplorerScene<string>) => void = () => {};
    const source = createSceneSource<string>({
      load: () => scene("full"),
      loadStreaming: async (_focus, onUpdate) => {
        finish = onUpdate;
        return scene("page1");
      },
    });
    const updates: string[] = [];
    expect((await source.loadSceneStreaming!("a", (s) => updates.push(s.id))).id).toBe("page1");
    expect(source.isCached("a")).toBe(true);
    finish(scene("page2"));
    expect(updates).toEqual(["page2"]);
    expect((await source.loadScene("a")).id).toBe("page2");
  });

  test("without loadStreaming there is no loadSceneStreaming, so the explorer waits for load", () => {
    expect(createSceneSource<string>({ load: () => scene("x") }).loadSceneStreaming).toBeUndefined();
  });
});
