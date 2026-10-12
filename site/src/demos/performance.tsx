import { useState } from "react";
import { createSceneSource, DataExplorer, type ExplorerEdge } from "@thirkettle/data-explorer";

// A thousand items and some edges, with the stats overlay on: draw time, frame rate, pool sizes.
const COUNT = 1_000;
let seed = 7;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; // repeatable

const nodes = Array.from({ length: COUNT }, (_, i) => ({
  id: `n${i}`,
  label: `Item ${i}`,
  weight: 1 + Math.floor(random() * 100),
  href: `#n${i}`,
  drillsInto: null,
  shape: (i % 5 === 0 ? "square" : "disc") as "square" | "disc",
  ramp: random(),
}));
const edges: ExplorerEdge[] = Array.from({ length: 800 }, (_, i) => ({
  id: `e${i}`,
  sourceId: `n${Math.floor(random() * COUNT)}`,
  targetId: `n${Math.floor(random() * COUNT)}`,
  kind: "link",
}));
const source = createSceneSource<null>({
  load: () => ({ id: "many", heading: `${COUNT} items`, clusters: [], nodes, edges }),
});

export default function Performance() {
  const [max, setMax] = useState(0);
  return (
    <>
      <div className="demo-toolbar">
        {[0, 200, 500, 800].map((n) => (
          <button key={n} aria-pressed={max === n} onClick={() => setMax(n)}>
            {n === 0 ? "No edges" : `${n} edges`}
          </button>
        ))}
      </div>
      <DataExplorer
        source={source}
        focus={null}
        stats // the overlay, top left; read once at mount
        edges={{ visible: max > 0, max }} // at most `max` edges drawn (the default is 500)
      />
    </>
  );
}
