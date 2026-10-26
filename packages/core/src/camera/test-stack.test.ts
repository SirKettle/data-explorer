import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createSceneSource } from "../scene/create-source";
import { deepTree, dag } from "../../test/fixtures";
import { createTestStack } from "./test-stack";

/**
 * US072 review change 4. Run with `requestAnimationFrame` deleted outright: other test files may
 * register a DOM that provides it, and the point is that a test stack never needs one.
 */
const saved = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
beforeEach(() => {
  // @ts-expect-error -- removed on purpose, to prove nothing here animates
  delete globalThis.requestAnimationFrame;
  // @ts-expect-error -- as above
  delete globalThis.cancelAnimationFrame;
});
afterEach(() => {
  if (saved.raf) globalThis.requestAnimationFrame = saved.raf;
  if (saved.caf) globalThis.cancelAnimationFrame = saved.caf;
});

describe("createTestStack (US072 change 4)", () => {
  test("walks in and back out with no requestAnimationFrame at all", async () => {
    expect(typeof globalThis.requestAnimationFrame).toBe("undefined");
    const t = await createTestStack(deepTree());
    expect(t.current.key).toBe("root");
    expect((await t.enter("d1")).key).toBe("/d1");
    expect((await t.enter("d2")).key).toBe("/d1/d2");
    expect(t.depth).toBe(2);
    expect(t.breadcrumb()).toEqual(["/", "/d1", "/d1/d2"]);
    expect((await t.zoomOut()).key).toBe("/d1");
    expect((await t.zoomOut()).key).toBe("root");
    expect(t.depth).toBe(0);
  });

  test("starting from a deep link, zooming out asks the source's parentOf", async () => {
    const t = await createTestStack(deepTree(), { focus: "/d1/d2" });
    expect(t.current.key).toBe("/d1/d2");
    expect((await t.zoomOut()).key).toBe("/d1");
  });

  test("entering something that cannot be entered leaves the stack where it was", async () => {
    const t = await createTestStack(deepTree());
    expect((await t.enter("file-at-0")).key).toBe("root");
    expect((await t.enter("no-such-item")).key).toBe("root");
  });

  test("jumpTo goes straight to a focus; a DAG leaves back the way it came", async () => {
    const t = await createTestStack(dag());
    await t.enter("C");
    await t.enter("D");
    expect((await t.zoomOut()).key).toBe("C"); // not the source's choice of parent (B)
    expect((await t.jumpTo("B")).key).toBe("B");
    expect(t.depth).toBe(0);
  });

  test("works over a createSceneSource source too", async () => {
    const source = createSceneSource<string>({
      load: (focus) => ({
        id: focus ?? "top",
        heading: focus ?? "Top",
        clusters: focus ? [] : [{ id: "a", label: "A", weight: 1, href: "/a", drillsInto: "a", shape: "cloud" }],
        nodes: [],
        edges: [],
      }),
      parentOf: () => ({ kind: "anchored", focus: null, anchorId: "a" }),
    });
    const t = await createTestStack(source);
    expect((await t.enter("a")).heading).toBe("a");
  });

  test("the raw stack's default enter does animate, which is why the helper exists", async () => {
    const t = await createTestStack(deepTree());
    // `t.stack.enter` without `approach: false` tweens the camera on requestAnimationFrame.
    await expect(t.stack.enter("d1")).rejects.toThrow(/requestAnimationFrame/);
  });
});

