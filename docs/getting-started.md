# Getting started

`@thirkettle/data-explorer` draws tree- and graph-shaped data as a space you zoom through: zoom
into a group to enter it, zoom out to leave, pan across to its neighbours. It draws with PixiJS
(WebGL) and keeps an accessible list of real links beside the canvas.

This page goes from install to a working explorer over a small tree. [Concepts](./concepts.md)
explains the ideas behind it.

## Install

```sh
npm install @thirkettle/data-explorer pixi.js react react-dom
```

`pixi.js` (v8) and `react` (19) are peer dependencies: your app provides them. PixiJS is loaded
lazily, the first time an explorer mounts, so it stays out of your page's first load.

## Your first explorer

The explorer never walks your data. You give it a **scene source**: given a **focus** (where the
viewer is), it returns the **scene** to draw there. `createSceneSource` builds one from a `load`
function and caches each scene, which the explorer relies on to preview what is about to be
entered. A focus can be any value you
like; `null` always means the top.

Here the data is a small in-memory tree, and the focus is a folder path.

```tsx
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { createSceneSource, DataExplorer, type ExplorerScene } from "@thirkettle/data-explorer";

// Your data: folders hold folders and files.
interface Folder {
  name: string;
  folders: Folder[];
  files: { name: string; bytes: number }[];
}

const tree: Folder = {
  name: "my-app",
  folders: [
    { name: "src", folders: [], files: [{ name: "main.ts", bytes: 2400 }, { name: "app.ts", bytes: 5100 }] },
    { name: "docs", folders: [], files: [{ name: "README.md", bytes: 900 }] },
  ],
  files: [{ name: "package.json", bytes: 600 }],
};

type Path = string; // the focus: "src", "src/lib", …; null is the top

function folderAt(path: Path | null): Folder {
  let folder = tree;
  for (const name of path ? path.split("/") : []) folder = folder.folders.find((f) => f.name === name)!;
  return folder;
}

// A scene: the folders inside the focus as clusters, its files as nodes.
function sceneFor(path: Path | null): ExplorerScene<Path> {
  const folder = folderAt(path);
  const join = (name: string) => (path ? `${path}/${name}` : name);
  return {
    id: path ?? "root",
    heading: folder.name,
    clusters: folder.folders.map((sub) => ({
      id: sub.name,
      label: sub.name,
      weight: sub.files.length + sub.folders.length, // drives size: use a count you could show
      marks: [],
      href: `#/${join(sub.name)}`, // every item needs a link: see Accessibility in Concepts
      drillsInto: join(sub.name), // zooming into this cluster opens this folder
      shape: "cloud",
      truncated: null,
    })),
    nodes: folder.files.map((file) => ({
      id: file.name,
      label: file.name,
      weight: file.bytes,
      marks: [],
      href: `#/${join(file.name)}`,
      drillsInto: null, // a file has nothing inside it
      shape: "disc",
    })),
    edges: [],
  };
}

// The scene source: how to load a scene, and where zooming out leads. It caches each scene.
const source = createSceneSource<Path>({
  load: sceneFor,
  // Zooming out of "src" lands on the "src" cluster in the top scene.
  parentOf(path) {
    const slash = path.lastIndexOf("/");
    return {
      kind: "anchored",
      focus: slash === -1 ? null : path.slice(0, slash),
      anchorId: path.slice(slash + 1),
    };
  },
});

function App() {
  const [focus, setFocus] = useState<Path | null>(null);
  return (
    <div style={{ height: "80vh" }}>
      <DataExplorer source={source} focus={focus} onSettle={setFocus} />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
```

Scroll or pinch to zoom, drag to pan, double-click a folder to enter it. Zoom out past a folder's
edge to leave it.

The explorer needs no stylesheet. Its canvas fills the width of its container; if nothing gives it
a height, it takes 480 px. Give the container (or `.data-explorer__surface`) a height to change
that.

## What `onSettle` is for

The explorer moves the camera itself as the viewer zooms. `onSettle(focus)` tells you where they
came to rest, once per burst of motion. Store it (in state, or in your URL) and pass it back as
`focus`. Passing a different `focus` (Back, a deep link) makes the explorer jump there.

## Next

- [Concepts](./concepts.md): focus, scenes, packed and radial layouts, drilling and zooming out,
  and the accessible outline.
- The [package README](../README.md): every option, event and prop, with the examples that use
  them.
