import { useState } from "react";
import { createSceneSource, DataExplorer, type ExplorerBackground } from "@thirkettle/data-explorer";

// An item's own `color` wins over the ramp. Any CSS colour string (or a 0xRRGGBB number) works.
const languages: [string, number, string][] = [
  ["TypeScript", 48, "#3178c6"],
  ["Rust", 21, "rgb(222 165 132)"],
  ["Python", 30, "hsl(50 90% 55%)"],
  ["Go", 12, "#00add8"],
  ["Kotlin", 9, "#a97bff"],
  ["Elixir", 5, "#6e4a7e"],
];
const source = createSceneSource<null>({
  load: () => ({
    id: "languages",
    heading: "Languages by repositories",
    clusters: [],
    nodes: languages.map(([name, repos, color]) => ({
      id: name,
      label: name,
      sublabel: `${repos} repositories`,
      weight: repos,
      href: `#${name}`,
      drillsInto: null,
      shape: "disc" as const,
      color,
    })),
    edges: [],
  }),
});

// Backgrounds are live: change one and the canvas redraws, with no new scene and no camera reset.
const backgrounds: Record<string, ExplorerBackground> = {
  Plain: {},
  Gradient: { gradient: { from: "#0f172a", to: "#3b0764", angle: 135 } },
  "No grid": { color: "#111827", grid: false },
  "Bright grid": { grid: { alpha: 0.6, color: "#38bdf8" } },
};

export default function ColoursAndBackgrounds() {
  const [name, setName] = useState("Gradient");
  return (
    <>
      <div className="demo-toolbar">
        {Object.keys(backgrounds).map((key) => (
          <button key={key} aria-pressed={name === key} onClick={() => setName(key)}>
            {key}
          </button>
        ))}
      </div>
      <DataExplorer source={source} focus={null} background={backgrounds[name]} />
    </>
  );
}
