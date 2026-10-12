import { createSceneSource, DataExplorer } from "@thirkettle/data-explorer";

// Items with a `kind` are drawn by your renderer for that kind; the rest keep their shape.
const source = createSceneSource<null>({
  load: () => ({
    id: "garden",
    heading: "Garden",
    clusters: [],
    nodes: ["Rose", "Tulip", "Daisy", "Iris", "Poppy", "Lily", "Fern"].map((name, i) => ({
      id: name,
      label: name,
      weight: 3 + (i % 4),
      href: `#${name}`,
      drillsInto: null,
      shape: "disc" as const,
      ramp: i / 6,
      kind: name === "Fern" ? null : "flower", // Fern stays a plain disc
    })),
    edges: [],
  }),
});

export default function CustomRenderers() {
  // The renderers module, and PixiJS with it, load only when the explorer first needs them.
  return <DataExplorer source={source} focus={null} renderers={() => import("./custom-renderers.renderers")} />;
}
