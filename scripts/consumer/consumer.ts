// US072 Step 4: what a consumer writes, compiled against the *installed* package and run under
// plain Node. No JSX, so it runs without a bundler; every entry is imported.
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { Container } from "pixi.js";
import { createSceneSource, DataExplorer, windowed, type ExplorerItem, type ExplorerScene } from "@thirkettle/data-explorer";
import { createTestStack } from "@thirkettle/data-explorer/headless";
import { defineRenderers, type ItemRenderer } from "@thirkettle/data-explorer/pixi";

type Folder = string;
type Data = { bytes: number };

const tree: Record<string, string[]> = { "/": ["/a", "/b"], "/a": ["/a/x"], "/b": [], "/a/x": [] };

const source = createSceneSource<Folder, Data>({
  load(focus) {
    const path = focus ?? "/";
    const { shown, truncated } = windowed(tree[path] ?? [], 10);
    const scene: ExplorerScene<Folder, Data> = {
      id: path,
      heading: path,
      clusters: shown.map((child) => ({
        id: child,
        label: child,
        weight: 1 + (tree[child]?.length ?? 0),
        href: `/files${child}`,
        drillsInto: child,
        shape: "cloud",
        data: { bytes: 1 },
      })),
      nodes: [],
      edges: [],
    };
    if (truncated) throw new Error("unexpected truncation");
    return scene;
  },
});

// Types only: a renderer written against PixiJS, as a consumer's renderers module would be.
const planet: ItemRenderer = {
  create: () => ({}) as Container,
  update(view, node, frame) {
    const container: Container = view;
    const item: ExplorerItem = node.item; // the item as your source wrote it
    void container;
    void item.label;
    void frame.size;
  },
};
export const renderers = defineRenderers({ planet });

let selected: Data | undefined;
const html = renderToString(
  createElement(DataExplorer<Folder, Data>, {
    source,
    focus: null,
    onSettle: () => {},
    onNodeSelect: (item: ExplorerItem<Folder, Data> | null) => {
      selected = item?.data;
    },
  }),
);
if (!html.includes("data-explorer")) throw new Error(`server render has no .data-explorer root: ${html.slice(0, 200)}`);
void selected;

const stack = await createTestStack(source);
await stack.enter("/a");
const trail = stack.breadcrumb().join(" > ");
if (trail !== "/ > /a") throw new Error(`breadcrumb was "${trail}"`);
console.log(`consumer: ok (server render ${html.length} chars; breadcrumb ${trail})`);
