import { useState } from "react";
import { createSceneSource, DataExplorer, type ExplorerItem } from "@data-xplorer/core";

// Your own data rides along on each item as `data`, and comes back with it in the events.
type Planet = { moons: number };
const planets: [string, number][] = [["Mercury", 0], ["Venus", 0], ["Earth", 1], ["Mars", 2], ["Jupiter", 95]];

const source = createSceneSource<string, Planet>({
  load(focus) {
    if (focus !== null) {
      const moons = planets.find(([name]) => name === focus)![1];
      return {
        id: focus,
        heading: focus,
        clusters: [],
        nodes: Array.from({ length: Math.min(moons, 12) }, (_, i) => ({
          id: `${focus}-${i}`,
          label: `Moon ${i + 1}`,
          weight: 1,
          href: `#${focus}-${i}`,
          drillsInto: null,
          shape: "disc" as const,
        })),
        edges: [],
      };
    }
    return {
      id: "sun",
      heading: "Planets",
      nodes: [],
      edges: [],
      clusters: planets.map(([name, moons]) => ({
        id: name,
        label: name,
        weight: 1 + moons,
        href: `#${name}`,
        drillsInto: moons > 0 ? name : null,
        shape: "cloud" as const,
        data: { moons },
      })),
    };
  },
  parentOf: (planet) => ({ kind: "anchored", focus: null, anchorId: planet }),
});

export default function Events() {
  const [focus, setFocus] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [openInstead, setOpenInstead] = useState(false);
  const say = (line: string) => setLog((lines) => [line, ...lines].slice(0, 30));
  const name = (item: ExplorerItem<string, Planet> | null) => (item ? item.label : "nothing");

  return (
    <>
      <div className="demo-toolbar">
        <label>
          <input type="checkbox" checked={openInstead} onChange={(e) => setOpenInstead(e.target.checked)} /> Double-click
          opens details instead of entering
        </label>
      </div>
      <DataExplorer
        source={source}
        focus={focus}
        onSettle={(next) => {
          setFocus(next);
          say(`onSettle: ${next ?? "top"}`);
        }}
        onNodeSelect={(item) => say(`onNodeSelect: ${name(item)}${item?.data ? `, ${item.data.moons} moons` : ""}`)}
        onNodeHover={(item) => item && say(`onNodeHover: ${name(item)}`)}
        onEnter={({ heading, direction }) => say(`onEnter: ${heading} (${direction})`)}
        onLeave={({ heading, direction }) => say(`onLeave: ${heading} (${direction})`)}
        onBackgroundClick={({ world }) => say(`onBackgroundClick at ${world.x.toFixed(0)}, ${world.y.toFixed(0)}`)}
        onNodeActivate={(event) => {
          say(`onNodeActivate: ${event.item.label} by ${event.source}`);
          if (openInstead) {
            event.preventDefault(); // the explorer will not enter it
            say(`  ...details for ${event.item.label} would open here`);
          }
        }}
      />
      <pre className="demo-log" aria-live="polite">
        {log.join("\n") || "Click, hover or double-click an item."}
      </pre>
    </>
  );
}
