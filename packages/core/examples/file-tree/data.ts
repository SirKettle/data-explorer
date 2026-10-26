/**
 * A made-up project on disk. Deterministic, so the example looks the same every time.
 * `age` is days since last change; `modified` marks files with uncommitted changes.
 */
export interface FileEntry {
  kind: "file";
  name: string;
  path: string;
  bytes: number;
  age: number;
  modified: boolean;
}

export interface FolderEntry {
  kind: "folder";
  name: string;
  path: string;
  children: Entry[];
}

export type Entry = FileEntry | FolderEntry;

// A tiny seeded generator, so sizes and ages vary but never change between reloads.
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function file(parent: string, name: string, modified = false, maxBytes = 24_000): FileEntry {
  return {
    kind: "file",
    name,
    path: `${parent}/${name}`,
    bytes: Math.round(200 + random() * maxBytes),
    age: Math.round(random() * 400),
    modified,
  };
}

function folder(parent: string, name: string, build: (path: string) => Entry[]): FolderEntry {
  const path = `${parent}/${name}`;
  return { kind: "folder", name, path, children: build(path) };
}

const files = (parent: string, names: string[], modified: string[] = []) =>
  names.map((name) => file(parent, name, modified.includes(name)));

export const ROOT: FolderEntry = {
  kind: "folder",
  name: "my-app",
  path: "",
  children: [
    folder("", "src", (src) => [
      folder(src, "components", (p) =>
        files(
          p,
          [
            "Button.tsx",
            "Card.tsx",
            "Dialog.tsx",
            "Menu.tsx",
            "Table.tsx",
            "Tabs.tsx",
            "Toast.tsx",
            "Tooltip.tsx",
          ],
          ["Dialog.tsx"],
        ),
      ),
      folder(src, "routes", (p) => [
        folder(p, "account", (q) => files(q, ["profile.tsx", "billing.tsx", "security.tsx"])),
        folder(p, "admin", (q) => [
          folder(q, "reports", (r) =>
            files(r, ["daily.tsx", "weekly.tsx", "export.ts"], ["export.ts"]),
          ),
          ...files(q, ["users.tsx", "audit.tsx"]),
        ]),
        ...files(p, ["index.tsx", "search.tsx", "not-found.tsx"]),
      ]),
      folder(src, "lib", (p) =>
        files(
          p,
          ["api.ts", "dates.ts", "format.ts", "storage.ts", "validate.ts"],
          ["api.ts", "format.ts"],
        ),
      ),
      ...files(src, ["main.tsx", "App.tsx", "router.ts"]),
    ]),
    folder("", "assets", (assets) => [
      // Far more than one scene should draw: the scene shows the first 120 and says so.
      folder(assets, "icons", (p) =>
        Array.from({ length: 420 }, (_, i) =>
          file(p, `icon-${String(i + 1).padStart(3, "0")}.svg`, false, 1_200),
        ),
      ),
      folder(assets, "fonts", (p) => files(p, ["inter.woff2", "inter-bold.woff2", "mono.woff2"])),
      ...files(assets, ["logo.svg", "hero.png", "favicon.ico"]),
    ]),
    folder("", "docs", (p) =>
      files(
        p,
        ["getting-started.md", "architecture.md", "deploying.md", "faq.md"],
        ["deploying.md"],
      ),
    ),
    folder("", "test", (p) =>
      files(p, ["api.test.ts", "dates.test.ts", "format.test.ts", "e2e.test.ts"]),
    ),
    ...files("", ["package.json", "README.md", "tsconfig.json", ".gitignore"], ["package.json"]),
  ],
};

const index = new Map<string, Entry>();
(function walk(entry: Entry) {
  index.set(entry.path, entry);
  if (entry.kind === "folder") entry.children.forEach(walk);
})(ROOT);

export function folderAt(path: string): FolderEntry | null {
  const entry = index.get(path);
  return entry?.kind === "folder" ? entry : null;
}

export function fileCount(entry: Entry): number {
  return entry.kind === "file"
    ? 1
    : entry.children.reduce((sum, child) => sum + fileCount(child), 0);
}

export function byteCount(entry: Entry): number {
  return entry.kind === "file"
    ? entry.bytes
    : entry.children.reduce((sum, child) => sum + byteCount(child), 0);
}

export const parentPath = (path: string) => path.slice(0, path.lastIndexOf("/"));
