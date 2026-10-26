import { useState } from "react";
import { createSceneSource, DataExplorer, type ExplorerEffects, type ExplorerNode } from "@data-xplorer/core";

// Services in a status board. Items ask for effects; the view's `effects` switch them globally.
const services: [string, Partial<ExplorerNode<null>>][] = [
  ["api", { effects: ["pulse"], color: "#f87171" }], // failing: it breathes
  ["auth", { effects: ["glow"], color: "#fbbf24" }], // degraded: a steady glow
  ["search", { emphasis: ["ring"] }], // yours: a ring and halo
  ["billing", {}],
  ["mail", {}],
  ["cdn", { emphasis: ["ring"] }],
];
const source = createSceneSource<null>({
  load: () => ({
    id: "status",
    heading: "Service status",
    clusters: [],
    nodes: services.map(([name, extra], i) => ({
      id: name,
      label: name,
      weight: 4 + (i % 3) * 3,
      href: `#${name}`,
      drillsInto: null,
      shape: "disc" as const,
      ...extra,
    })),
    edges: [],
  }),
});

const switches: (keyof ExplorerEffects)[] = ["glow", "pulse", "halo", "growIn", "hoverRing", "selectionRing"];

export default function Effects() {
  const [effects, setEffects] = useState<ExplorerEffects>({});
  return (
    <>
      <div className="demo-toolbar">
        {switches.map((name) => (
          <label key={name}>
            <input
              type="checkbox"
              checked={effects[name] !== false}
              onChange={(e) => setEffects({ ...effects, [name]: e.target.checked })}
            />{" "}
            {name}
          </label>
        ))}
      </div>
      <DataExplorer source={source} focus={null} effects={effects} />
    </>
  );
}
