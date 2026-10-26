import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DataExplorer, type ExplorerItem } from "@data-xplorer/core";
import { decodeContinent, worldMapSource } from "./source";

const source = worldMapSource();

function readHash(): string {
  return decodeURIComponent(window.location.hash.slice(1));
}

/**
 * The world as an app: the focus (a continent) lives in the URL hash, written on `onSettle` and
 * read back on Back/Forward; a breadcrumb from `onSceneChange`; the selected country from
 * `onNodeSelect`.
 */
function WorldMap() {
  const [focus, setFocus] = useState<string | null>(() => decodeContinent(readHash()));
  const [selected, setSelected] = useState<ExplorerItem<string> | null>(null);

  useEffect(() => {
    const onHashChange = () => setFocus(decodeContinent(readHash()));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function handleSettle(next: string | null) {
    const hash = next ?? "";
    if (hash !== readHash()) window.location.hash = hash; // one history entry per settled scene
    setFocus(next);
  }

  return (
    <main className="example">
      <header className="example__header">
        <h1>A world map</h1>
        <div className="example__intro">
          <p>
            Natural Earth's 110m countries (from <code>world-atlas</code>), projected once with{" "}
            <code>d3-geo</code> and drawn as <code>region</code>s in <strong>fixed</strong> scenes:
            continents at the top, each entered to its countries. Every country keeps its own shape
            and place, so zooming into a continent shows its countries exactly where it was, its
            neighbours round it. Lesotho is a hole in South Africa; point at it to see the difference.
          </p>
        </div>
      </header>

      <nav aria-label="Where you are" className="example__trail">
        <span>The world</span>
        {focus !== null && <span>{focus}</span>}
      </nav>

      <DataExplorer
        source={source}
        focus={focus}
        onSettle={handleSettle}
        onNodeSelect={setSelected}
        background={{ color: "#0b1d2e", grid: false }}
      />

      <aside className="example__selection" aria-live="polite">
        {selected ? (
          <>
            <h2>{selected.label}</h2>
            {selected.sublabel && <p>{selected.sublabel}</p>}
            <p>{selected.drillsInto !== null ? "Double-click or zoom in to enter it." : "A country."}</p>
          </>
        ) : (
          <p className="example__hint">
            Scroll or pinch to zoom, drag to pan, click a country to select it, double-click a
            continent to enter it.
          </p>
        )}
      </aside>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<WorldMap />);
