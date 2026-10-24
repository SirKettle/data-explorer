import { useState } from "react";
import {
  createSceneSource,
  DataExplorer,
  FALLBACK_PALETTE,
  type ExplorerPalette,
  type RampColours,
} from "@thirkettle/data-explorer";

// Twelve months of releases; each sits on the colour ramp by how long ago it shipped.
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const source = createSceneSource<null>({
  load: () => ({
    id: "releases",
    heading: "Releases this year",
    clusters: [],
    nodes: months.map((month, i) => ({
      id: month,
      label: month,
      weight: 3 + ((i * 7) % 10),
      href: `#${month}`,
      drillsInto: null,
      shape: "disc" as const,
      ramp: i / 11, // 0 is the start of the ramp, 1 the end
    })),
    edges: [],
  }),
});

// A palette is the canvas's own colours. Pass a new object and the canvas re-tints in place.
const paper: ExplorerPalette = {
  ...FALLBACK_PALETTE,
  background: "#f7f5ef",
  grid: "#c9c3b4",
  label: "#1f2430",
  labelStroke: "#f7f5ef",
  selection: "#1d4ed8",
  hover: "#475569",
};
// A ramp is colour stops, blended in OKLab unless you say otherwise. Switching re-tints in place.
const ramps: Record<string, RampColours> = {
  "Teal to violet": { stops: ["#14b8a6", "#8b5cf6"] },
  "Gold to red": { stops: ["#facc15", "#dc2626"] },
  "Cool, neutral, warm": { stops: ["#3b82f6", "#e5e7eb", "#f97316"] },
};

export default function Theming() {
  const [light, setLight] = useState(false);
  const [ramp, setRamp] = useState("Teal to violet");
  return (
    <>
      <div className="demo-toolbar">
        <button onClick={() => setLight(!light)}>{light ? "Dark" : "Light"} palette</button>
        {Object.keys(ramps).map((name) => (
          <button key={name} aria-pressed={ramp === name} onClick={() => setRamp(name)}>
            {name}
          </button>
        ))}
      </div>
      <DataExplorer
        source={source}
        focus={null}
        palette={light ? paper : FALLBACK_PALETTE}
        ramp={ramps[ramp]}
      />
    </>
  );
}
