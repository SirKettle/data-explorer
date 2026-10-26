import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ExplorerEdges, ExplorerItem, ExplorerSceneEvent } from "@data-xplorer/core";
import { ExampleShell } from "../shared/ExampleShell";
import { MODULES } from "./data";
import { decodeFocus, encodeFocus, moduleGraphSource, type Focus } from "./source";

const source = moduleGraphSource();
const LOG_LINES = 8;

/** US071 — the edges, styled per kind: imports solid with an arrow, imported-by dashed and bowed so
 *  a pair that imports both ways reads as two lines, and package dependencies faint. */
const EDGE_STYLES: ExplorerEdges["styles"] = {
  imports: { arrow: "end", width: 1.5, alpha: 0.6 },
  "imported-by": { dash: [5, 4], arrow: "end", curve: 0.15, alpha: 0.5 },
  "depends-on": { arrow: "end", width: 2, alpha: 0.35, curve: 0.1 },
};

// Where a scene lives, not the path walked to it: a module sits in its package.
function trailOf(focus: Focus | null): string[] {
  if (focus === null) return ["All packages"];
  if (focus.kind === "package") return ["All packages", focus.pkg];
  const module = MODULES.get(focus.id)!;
  return ["All packages", module.pkg, module.name];
}

function ModuleGraph() {
  // US071 — `onNodeActivate` is cancellable: with this on, a double-click (or Enter in the
  // outline) opens the details panel instead of entering the module.
  const [detailsOnActivate, setDetailsOnActivate] = useState(false);
  const [showEdges, setShowEdges] = useState(true);
  const [details, setDetails] = useState<ExplorerItem<Focus> | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [camera, setCamera] = useState("");
  const counter = useRef(0);

  function note(line: string) {
    counter.current += 1;
    const numbered = `${counter.current}. ${line}`;
    setLog((lines) => [numbered, ...lines].slice(0, LOG_LINES));
  }
  const scene = (event: ExplorerSceneEvent<Focus>) => `${event.heading} (${event.direction})`;

  return (
    <ExampleShell
      title="A module dependency graph"
      intro={
        <p>
          An app's imports. Packages hold modules; enter a module to see its neighbourhood, with
          what it imports as discs and what imports it as squares. Every neighbour can be entered
          in turn, so you can walk the graph sideways. Ringed modules sit on an import cycle: try{" "}
          <a href="#module:core/store">core/store</a> and follow its imports round. Edges are drawn
          in every scene, styled by kind, and listed for screen readers as links. The log below
          shows the explorer's events as they fire.
        </p>
      }
      source={source}
      encode={encodeFocus}
      decode={decodeFocus}
      trailOf={trailOf}
      edges={{ visible: showEdges, styles: EDGE_STYLES }}
      toolbar={
        <>
          <button type="button" aria-pressed={showEdges} onClick={() => setShowEdges(!showEdges)}>
            Edges {showEdges ? "on" : "off"}
          </button>
          <button type="button" aria-pressed={detailsOnActivate} onClick={() => setDetailsOnActivate(!detailsOnActivate)}>
            Double-click: {detailsOnActivate ? "open details" : "enter"}
          </button>
        </>
      }
      events={{
        onNodeHover: (item) => note(item ? `hover ${item.label}` : "hover nothing"),
        onNodeActivate: (event) => {
          note(`activate ${event.item.label} (${event.source})${detailsOnActivate ? ", cancelled" : ""}`);
          if (!detailsOnActivate) return;
          event.preventDefault();
          setDetails(event.item);
        },
        onLeave: (event) => note(`leave ${scene(event)}`),
        onEnter: (event) => note(`enter ${scene(event)}`),
        onBackgroundClick: ({ world }) => note(`background at ${Math.round(world.x)}, ${Math.round(world.y)}`),
        onCameraChange: ({ x, y, scale }) => setCamera(`${Math.round(x)}, ${Math.round(y)} at ×${scale.toFixed(2)}`),
      }}
      footer={
        <section className="example__events" aria-label="Events">
          {details && (
            <div className="example__details">
              <h2>{details.label}</h2>
              {details.sublabel && <p>{details.sublabel}</p>}
              <p>
                Opened by a cancelled activate. <a href={details.href ?? "#"}>Its own page</a>{" "}
                <button type="button" onClick={() => setDetails(null)}>
                  Close
                </button>
              </p>
            </div>
          )}
          <p className="example__camera">Camera {camera || "not moved yet"}</p>
          <ol className="example__log">
            {log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </section>
      }
    />
  );
}

createRoot(document.getElementById("root")!).render(<ModuleGraph />);
