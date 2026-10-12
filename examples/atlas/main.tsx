import { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { FALLBACK_PALETTE, type ExplorerBackground, type ExplorerEffects, type ExplorerPalette } from "@thirkettle/data-explorer";
import { ExampleShell } from "../shared/ExampleShell";
import { visitedStore, type VisitedStore } from "./data";
import { atlasSource, decodeContinent, DENSITY_RAMP } from "./source";
import contoursUrl from "./contours.svg";

const LIGHT_PALETTE: ExplorerPalette = {
  background: 0xf7f8fb,
  grid: 0x526079,
  label: 0x0f172a,
  labelStroke: 0xffffff,
  selection: 0x0f172a,
  ownership: 0x1d4ed8,
  aggregate: 0x526079,
  hover: 0x0f172a,
};

/** US071 — three backdrops, in the forms `background` accepts. The image is a same-origin SVG:
 *  a canvas can only draw pixels its page is allowed to read. */
const BACKDROPS: { name: string; dark: ExplorerBackground; light: ExplorerBackground }[] = [
  { name: "plain", dark: {}, light: {} },
  {
    name: "gradient",
    dark: { gradient: { from: "#0b1a33", to: "#020409", angle: 160 } },
    light: { gradient: { from: "#eef4ff", to: "#fdf6ec", angle: 160 } },
  },
  {
    name: "image",
    dark: { color: "#06070c", image: { url: contoursUrl, alpha: 0.5 } },
    light: { color: "#fbfaf6", image: { url: contoursUrl, alpha: 0.25 } },
  },
];

/** US071 — the same `pulse` request, three ways: breathing, held still, or switched off. */
const GLOWS: { name: string; effects: ExplorerEffects }[] = [
  { name: "pulse", effects: {} },
  { name: "still glow", effects: { pulse: false } },
  { name: "ring only", effects: { glow: false } },
];

const visited = visitedStore(["France", "Japan", "Peru"]);
const source = atlasSource(visited);

function VisitedToggle({ store, name }: { store: VisitedStore; name: string }) {
  useSyncExternalStore(store.subscribe, store.version);
  return (
    <button type="button" onClick={() => store.toggle(name)}>
      {store.has(name) ? "Unmark visited" : "Mark visited"}
    </button>
  );
}

function Atlas() {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  // US071 — declarative options, applied live: no new scene, no camera reset.
  const [grid, setGrid] = useState(true);
  const [backdrop, setBackdrop] = useState(0);
  const [glow, setGlow] = useState(0);
  const [halo, setHalo] = useState(true);

  function switchMode() {
    const next = mode === "dark" ? "light" : "dark";
    document.documentElement.dataset.mode = next; // the page's own colours
    setMode(next); // and the canvas's: a new palette object re-tints it live
  }

  return (
    <ExampleShell
      title="A streaming atlas"
      intro={
        <p>
          Continents and a few of their countries, sized by population and coloured by density on a
          custom ramp (blue sparse, orange crowded). A continent's countries stream in a few at a
          time, the way a paged API delivers them. Select a country and mark it visited: its ring and
          pulse appear in place, with no reload and no camera jump. With reduced motion turned on
          in your system settings, the pulse holds still. The theme button re-tints the live
          canvas, and the backdrop, grid and halo buttons switch the{" "}
          <code>background</code> and <code>effects</code> options live.
        </p>
      }
      source={source}
      encode={(name) => name}
      decode={decodeContinent}
      trailOf={(name) => (name === null ? ["World"] : ["World", name])}
      palette={mode === "dark" ? FALLBACK_PALETTE : LIGHT_PALETTE}
      ramp={DENSITY_RAMP}
      background={{ ...BACKDROPS[backdrop]![mode], grid }}
      effects={{ halo, ...GLOWS[glow]!.effects }}
      toolbar={
        <>
          <button type="button" onClick={switchMode}>
            Switch to {mode === "dark" ? "light" : "dark"}
          </button>
          <button type="button" onClick={() => setBackdrop((backdrop + 1) % BACKDROPS.length)}>
            Backdrop: {BACKDROPS[backdrop]!.name}
          </button>
          <button type="button" aria-pressed={grid} onClick={() => setGrid(!grid)}>
            Grid {grid ? "on" : "off"}
          </button>
          <button type="button" onClick={() => setGlow((glow + 1) % GLOWS.length)}>
            Visited: {GLOWS[glow]!.name}
          </button>
          <button type="button" aria-pressed={halo} onClick={() => setHalo(!halo)}>
            Visited halo {halo ? "on" : "off"}
          </button>
        </>
      }
      renderSelection={(item) =>
        item.drillsInto !== null ? null : <VisitedToggle store={visited} name={item.id} />
      }
    />
  );
}

createRoot(document.getElementById("root")!).render(<Atlas />);
