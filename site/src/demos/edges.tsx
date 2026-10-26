import { useState } from "react";
import { createSceneSource, DataExplorer, type ExplorerEdges } from "@data-xplorer/core";

// A module and its neighbours: what it imports, and what imports it.
const imports: Record<string, string[]> = {
  app: ["router", "store", "ui"],
  router: ["history"],
  store: ["immer", "history"],
  ui: ["theme", "icons"],
  theme: [],
  icons: [],
  history: [],
  immer: [],
};
const importers = (m: string) => Object.keys(imports).filter((other) => imports[other]!.includes(m));

const source = createSceneSource<string>({
  // A radial scene per module: it sits in the middle, its neighbours round it.
  load(focus) {
    const me = focus ?? "app";
    const out = imports[me]!;
    const ins = importers(me);
    return {
      id: me,
      heading: me,
      focusId: me,
      clusters: [],
      nodes: [me, ...out, ...ins].map((m) => ({
        id: m,
        label: m,
        weight: 1 + imports[m]!.length,
        href: `#${m}`,
        drillsInto: m, // double-click a neighbour to walk the graph
        shape: "square" as const,
      })),
      edges: [
        ...out.map((m) => ({ id: `${me}>${m}`, sourceId: me, targetId: m, kind: "imports" })),
        ...ins.map((m) => ({ id: `${m}>${me}`, sourceId: m, targetId: me, kind: "imported-by" })),
      ],
    };
  },
});

// Edges are drawn only when `visible`; each style is merged over `style`, by the edge's `kind`.
const edges: ExplorerEdges = {
  visible: true,
  style: { width: 1.5, alpha: 0.7 },
  styles: {
    imports: { arrow: "end", color: "#93c5fd" },
    "imported-by": { arrow: "end", dash: [5, 4], curve: 0.2, color: "#fca5a5" },
  },
};

export default function Edges() {
  const [focus, setFocus] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  return (
    <>
      <div className="demo-toolbar">
        <button onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"} edges</button>
        <button onClick={() => setFocus(null)}>Back to app</button>
      </div>
      <DataExplorer source={source} focus={focus} onSettle={setFocus} edges={{ ...edges, visible }} />
    </>
  );
}
