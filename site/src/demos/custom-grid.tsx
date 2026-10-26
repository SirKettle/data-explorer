import { createSceneSource, DataExplorer } from "@data-xplorer/core";

const source = createSceneSource<null>({
  load: () => ({
    id: "plate",
    heading: "Plate",
    clusters: [],
    nodes: ["Red", "Blue", "Green", "Yellow"].map((name, i) => ({
      id: name,
      label: name,
      weight: 3 + i,
      href: `#${name}`,
      drillsInto: null,
      shape: "square" as const,
      ramp: i / 3,
    })),
    edges: [],
  }),
});

// A module-level constant: a new function on each render would reload the tile.
const studs = () => import("./custom-grid.tile");

export default function CustomGrid() {
  // `step` is the world distance one tile covers; `continuous` scales it smoothly as you zoom.
  return <DataExplorer source={source} focus={null} background={{ grid: { tile: studs, step: 80, zoom: "continuous", alpha: 0.5 } }} />;
}
