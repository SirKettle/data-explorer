import {
  createSceneSource,
  windowed,
  type ExplorerCluster,
  type ExplorerNode,
  type ExplorerScene,
  type SceneSource,
} from "@thirkettle/data-explorer";
import { delay } from "../shared/delay";
import {
  byteCount,
  fileCount,
  folderAt,
  parentPath,
  ROOT,
  type FileEntry,
  type FolderEntry,
} from "./data";

/**
 * A tree, the simplest shape: every scene is packed (no `focusId`), the focus is a folder path,
 * and zooming out is always anchored, because every folder appears in its parent as a cluster
 * with the folder's own name as its id.
 */
type Path = string;

/** The most files one scene draws before the rest become one "more files" aggregate. */
const FILE_BUDGET = 120;
const OLDEST_DAYS = 400;

export const folderHref = (path: Path) => `#${encodeURIComponent(path)}`;
// The example has no file pages, so a file links to its folder with the file named: still a
// real, stable URL that `decode` understands.
export const fileHref = (file: FileEntry) =>
  `#${encodeURIComponent(`${parentPath(file.path)}?file=${file.name}`)}`;

function kilobytes(bytes: number) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function folderCluster(folder: FolderEntry): ExplorerCluster<Path> {
  const count = fileCount(folder);
  const bytes = byteCount(folder);
  return {
    id: folder.name,
    label: folder.name,
    sublabel: `${count} files`,
    // Bytes, like a file's weight, so folders and files in one scene compare. Readable in `marks`.
    weight: bytes,
    marks: [`${count} files`, kilobytes(bytes)],
    href: folderHref(folder.path),
    drillsInto: folder.path,
    shape: "cloud",
    truncated: null,
  };
}

/** How files are coloured: by age on the ramp, or (US071) by type with each item's own `color`. */
export type ColourBy = "age" | "type";

/** One CSS colour per file type, in the forms `color` accepts: hex, short hex, `rgb()`, `hsl()`. */
const TYPE_COLOURS: Record<string, string> = {
  ts: "#3178c6",
  tsx: "#61dafb",
  css: "hsl(330, 80%, 60%)",
  json: "rgb(240, 200, 60)",
  md: "#ccc",
  svg: "#f80",
  png: "#f80",
};
const OTHER_TYPE_COLOUR = "#8b95a7";

function typeColour(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return TYPE_COLOURS[extension] ?? OTHER_TYPE_COLOUR;
}

function fileNode(file: FileEntry, colourBy: ColourBy): ExplorerNode<Path> {
  return {
    id: file.name,
    label: file.name,
    sublabel: kilobytes(file.bytes),
    weight: file.bytes,
    marks: [
      kilobytes(file.bytes),
      `changed ${file.age} days ago`,
      ...(file.modified ? ["uncommitted changes"] : []),
    ],
    href: fileHref(file),
    drillsInto: null,
    shape: "disc",
    // Newest files sit at the green end of the ramp, the oldest at the red end.
    ramp: 1 - Math.min(file.age, OLDEST_DAYS) / OLDEST_DAYS,
    // An item's own colour wins over its ramp position, so "type" needs no other change.
    color: colourBy === "type" ? typeColour(file.name) : null,
    emphasis: file.modified ? ["ring"] : [],
  };
}

function buildScene(path: Path | null, colourBy: ColourBy): ExplorerScene<Path> {
  const folder = folderAt(path ?? "") ?? ROOT;
  const folders = folder.children.filter((c): c is FolderEntry => c.kind === "folder");
  const allFiles = folder.children.filter((c): c is FileEntry => c.kind === "file");

  // `windowed` keeps the first N in the order given and says how many were left out.
  const { shown, truncated } = windowed(allFiles, FILE_BUDGET);
  const rest: ExplorerCluster<Path>[] = truncated
    ? [
        {
          id: "more-files",
          label: `${truncated.total - truncated.shown} more files`,
          weight: allFiles.slice(truncated.shown).reduce((sum, file) => sum + file.bytes, 0),
          marks: [`Showing ${truncated.shown} of ${truncated.total}`],
          href: null, // an aggregate has no page of its own...
          drillsInto: null, // ...and cannot be entered; it is drawn hollow
          shape: "disc",
          truncated,
        },
      ]
    : [];

  return {
    id: folder.path || "/",
    heading: folder.name,
    clusters: [...folders.map(folderCluster), ...rest],
    nodes: shown.map((file) => fileNode(file, colourBy)),
    edges: [],
  };
}

/** The colour mode, as a tiny store the source can listen to. */
export function colourSetting(initial: ColourBy) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: ColourBy) {
      if (next === value) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export function fileTreeSource(colourBy = colourSetting("age")): SceneSource<Path> {
  const source = createSceneSource<Path>({
    load: async (path) => {
      await delay(150);
      return buildScene(path, colourBy.get());
    },
    parentOf(path) {
      const parent = parentPath(path);
      // Zooming out of /src/lib lands on the `lib` cluster inside /src.
      return {
        kind: "anchored",
        focus: parent === "" ? null : parent,
        anchorId: folderAt(path)!.name,
      };
    },
  });
  // Switching the colour mode changes every scene: forget them all, and the one on screen redraws.
  colourBy.subscribe(() => source.invalidate());
  return source;
}

/** `#/src/lib` → `/src/lib`; `#/src/lib?file=api.ts` → `/src/lib`; anything unknown → the root. */
export function decodeFolder(hash: string): Path | null {
  const path = hash.split("?")[0]!;
  return path && folderAt(path) ? path : null;
}
