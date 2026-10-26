import { useState } from "react";
import { createSceneSource, DataExplorer } from "@data-xplorer/core";

// Your data: here, a small folder tree. Folders hold folders and files (with sizes in bytes).
const tree: Record<string, { folders: string[]; files: [string, number][] }> = {
  "/": { folders: ["/src", "/docs", "/assets"], files: [["README.md", 4_200], ["package.json", 900]] },
  "/src": { folders: ["/src/views"], files: [["index.ts", 1_500], ["camera.ts", 9_800], ["layout.ts", 12_400]] },
  "/src/views": { folders: [], files: [["Outline.tsx", 6_100], ["Explorer.tsx", 21_000]] },
  "/docs": { folders: [], files: [["concepts.md", 7_700], ["guide.md", 5_300]] },
  "/assets": { folders: [], files: [["logo.svg", 2_100], ["hero.png", 48_000], ["icon.png", 3_000]] },
};
const name = (path: string) => path.split("/").pop() || "/";
const size = (path: string): number =>
  tree[path]!.files.reduce((sum, [, bytes]) => sum + bytes, 0) + tree[path]!.folders.reduce((sum, f) => sum + size(f), 0);

// A scene source: the scene at each focus (a folder path; `null` is the top), cached for you.
const source = createSceneSource<string>({
  load(focus) {
    const path = focus ?? "/";
    return {
      id: path,
      heading: name(path),
      clusters: tree[path]!.folders.map((folder) => ({
        id: folder,
        label: name(folder),
        weight: size(folder), // sizes are relative to the scene's other folders
        href: `#${folder}`, // every item is also a link in the accessible outline
        drillsInto: folder, // zooming into it opens this focus
        shape: "cloud" as const,
      })),
      nodes: tree[path]!.files.map(([file, bytes]) => ({
        id: file,
        label: file,
        sublabel: `${bytes.toLocaleString()} bytes`,
        weight: bytes,
        href: `#${path}/${file}`,
        drillsInto: null, // a file has nothing inside
        shape: "disc" as const,
      })),
      edges: [],
    };
  },
  // Zooming out of a folder lands on its cloud in the parent folder.
  parentOf(path) {
    const parent = path.slice(0, path.lastIndexOf("/")) || "/";
    return { kind: "anchored", focus: parent === "/" ? null : parent, anchorId: path };
  },
});

export default function FirstRender() {
  const [focus, setFocus] = useState<string | null>(null);
  return <DataExplorer source={source} focus={focus} onSettle={setFocus} />;
}
