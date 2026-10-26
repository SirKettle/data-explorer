import { useState } from "react";
import { createSceneSource, DataExplorer } from "@data-xplorer/core";

// The canvas is hidden from assistive technology; the outline beside it is not. It lists the
// scene as real links (each item's `href`) and is read aloud. Show it to see what is announced.
const shelves: Record<string, string[]> = {
  Fiction: ["Dune", "Emma", "Ulysses", "Beloved"],
  Science: ["Cosmos", "The Gene"],
  Poetry: ["Ariel", "Odes", "Leaves of Grass"],
};
const source = createSceneSource<string>({
  load(shelf) {
    if (shelf === null) {
      return {
        id: "library",
        heading: "Library",
        nodes: [],
        edges: [],
        clusters: Object.keys(shelves).map((name) => ({
          id: name,
          label: name,
          weight: shelves[name]!.length,
          href: `#shelf-${name}`,
          drillsInto: name,
          shape: "cloud" as const,
          marks: [`${shelves[name]!.length} books`], // badges, read with the item
        })),
      };
    }
    return {
      id: shelf,
      heading: shelf,
      clusters: [],
      edges: [],
      nodes: shelves[shelf]!.map((title) => ({
        id: title,
        label: title,
        weight: 1,
        href: `#book-${title}`,
        drillsInto: null,
        shape: "square" as const,
      })),
    };
  },
  parentOf: (shelf) => ({ kind: "anchored", focus: null, anchorId: shelf }),
});

export default function Accessibility() {
  const [focus, setFocus] = useState<string | null>(null);
  const [showOutline, setShowOutline] = useState(true);
  return (
    <div className={showOutline ? "show-outline" : undefined}>
      <div className="demo-toolbar">
        <button onClick={() => setShowOutline(!showOutline)}>{showOutline ? "Hide" : "Show"} the outline</button>
      </div>
      <DataExplorer source={source} focus={focus} onSettle={setFocus} />
    </div>
  );
}
