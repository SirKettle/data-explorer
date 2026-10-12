// Runs in this repository's CI with `bun test`; Vitest and Node's test runner work the same way.
import { expect, test } from "bun:test";
import { createSceneSource } from "@thirkettle/data-explorer";
import { createTestStack } from "@thirkettle/data-explorer/headless";

const folders: Record<string, string[]> = { "/": ["/src", "/docs"], "/src": ["/src/lib"], "/src/lib": [], "/docs": [] };

const source = createSceneSource<string>({
  load: (focus) => ({
    id: focus ?? "/",
    heading: focus ?? "my-app",
    clusters: folders[focus ?? "/"]!.map((path) => ({
      id: path,
      label: path,
      weight: 1,
      href: `#${path}`,
      drillsInto: path,
      shape: "cloud" as const,
    })),
    nodes: [],
    edges: [],
  }),
  parentOf: (path) => {
    const parent = path.slice(0, path.lastIndexOf("/")) || "/";
    return { kind: "anchored", focus: parent === "/" ? null : parent, anchorId: path };
  },
});

test("a folder opens, and zooming out comes back", async () => {
  const explorer = await createTestStack(source); // no canvas, no animation, no DOM
  expect(explorer.current.heading).toBe("my-app");

  await explorer.enter("/src"); // an item's id in the current scene, as a double-click would
  expect(explorer.current.focus).toBe("/src");
  expect(explorer.breadcrumb()).toEqual(["my-app", "/src"]);

  await explorer.zoomOut(); // back the way it came
  expect(explorer.current.focus).toBeNull();
});

test("a deep link starts deep, and zooming out follows parentOf", async () => {
  const explorer = await createTestStack(source, { focus: "/src/lib" });
  await explorer.zoomOut();
  expect(explorer.current.focus).toBe("/src");
});

test("every item is laid out inside the scene", async () => {
  const explorer = await createTestStack(source);
  for (const node of explorer.current.renderNodes) expect(node.size).toBeGreaterThan(0);
});
