import { describe, expect, test } from "bun:test";
import { TextureBudget, textureDecision } from "./texture-cache";

describe("textureDecision (US071 AC4)", () => {
  test("small on screen: always the shape, and nothing loads", () => {
    for (const status of [undefined, "loading", "ready", "failed"] as const) expect(textureDecision(20, 48, status)).toBe("shape");
  });

  test("big enough: load the unknown, draw the ready, and the shape while loading or after a failure", () => {
    expect(textureDecision(48, 48, undefined)).toBe("load");
    expect(textureDecision(100, 48, "loading")).toBe("shape");
    expect(textureDecision(100, 48, "ready")).toBe("texture");
    expect(textureDecision(100, 48, "failed")).toBe("shape");
  });
});

describe("TextureBudget (US071 AC4)", () => {
  function budget(size: number) {
    const disposed: string[] = [];
    return { cache: new TextureBudget<string>(size, (value) => disposed.push(value)), disposed };
  }

  test("a ready entry is returned and marked in use; unknown and loading entries give nothing", () => {
    const { cache } = budget(2);
    expect(cache.use("a")).toBeNull();
    expect(cache.reserve("a")).toBe(true);
    expect(cache.use("a")).toBeNull();
    cache.resolve("a", "A");
    expect(cache.use("a")).toBe("A");
    expect(cache.reserve("a")).toBe(false); // already known
  });

  test("over budget, the least recently drawn ready entry is evicted and disposed", () => {
    const { cache, disposed } = budget(2);
    cache.beginFrame();
    cache.reserve("a");
    cache.resolve("a", "A");
    cache.reserve("b");
    cache.resolve("b", "B");
    cache.beginFrame();
    cache.use("b"); // b drawn in frame 2; a last drawn in frame 1
    cache.beginFrame();
    expect(cache.reserve("c")).toBe(true);
    expect(disposed).toEqual(["A"]);
    expect(cache.status("a")).toBeUndefined();
    expect(cache.held()).toBe(2);
  });

  test("entries drawn this frame are never evicted: a frame needing more than the budget falls back to shapes", () => {
    const { cache, disposed } = budget(2);
    cache.beginFrame();
    cache.reserve("a");
    cache.resolve("a", "A");
    cache.reserve("b");
    cache.resolve("b", "B");
    cache.beginFrame();
    cache.use("a");
    cache.use("b");
    expect(cache.reserve("c")).toBe(false);
    expect(disposed).toEqual([]);
  });

  test("a load in flight is never evicted, and a load that finishes after being dropped is disposed", () => {
    const { cache, disposed } = budget(1);
    cache.beginFrame();
    cache.reserve("a");
    cache.beginFrame();
    expect(cache.reserve("b")).toBe(false); // a is loading and holds the only slot
    cache.clear();
    expect(cache.resolve("a", "A")).toBe(false);
    expect(disposed).toEqual(["A"]);
  });

  test("a failure is reported once, costs no budget, and is not retried", () => {
    const { cache } = budget(1);
    cache.reserve("bad");
    expect(cache.fail("bad")).toBe(true);
    expect(cache.fail("bad")).toBe(false);
    expect(cache.status("bad")).toBe("failed");
    expect(cache.reserve("bad")).toBe(false);
    expect(cache.held()).toBe(0);
    expect(cache.reserve("good")).toBe(true);
  });

  test("lowering the budget evicts down to it", () => {
    const { cache, disposed } = budget(3);
    cache.beginFrame();
    for (const key of ["a", "b", "c"]) {
      cache.reserve(key);
      cache.resolve(key, key.toUpperCase());
    }
    cache.beginFrame();
    cache.use("c");
    cache.setBudget(1);
    expect(disposed.sort()).toEqual(["A", "B"]);
    expect(cache.held()).toBe(1);
  });
});
