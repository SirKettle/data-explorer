import { useState } from "react";
import { createRoot } from "react-dom/client";
import { FALLBACK_PALETTE, type ExplorerPalette } from "@data-xplorer/core";
import { ExampleShell } from "../shared/ExampleShell";
import { LAYOUT } from "./baseplate";
import { ancestry, CATALOGUE, themeById } from "./data";
import { decodeTheme, ERA_RAMP, legoSource, sceneFor, stepFor, type BrickColouring } from "./source";

/** LEGO's green baseplate, and a lighter green for its studs' highlights (the grid tile is drawn
 *  in greys, so this is the colour its white parts take). */
const BASEPLATE_GREEN = "#237841";
const STUD_GREEN = "#3fae63";

const PALETTE: ExplorerPalette = {
  ...FALLBACK_PALETTE,
  background: BASEPLATE_GREEN,
  label: 0xffffff,
  labelStroke: 0x05131d,
  hover: 0xffffff,
  selection: 0xf2cd37,
};

const COLOURINGS: BrickColouring[] = ["mixed", "theme", "era"];

let colouring: BrickColouring = "mixed";
const source = legoSource(() => colouring);
const BASEPLATE_TILE = () => import("./baseplate-tile");

function Lego() {
  const [colourIndex, setColourIndex] = useState(0);
  // One stud of the scene on screen: a fixed scene's world is scaled to its own bounds, so the
  // grid's step follows the scene, and the baseplate's studs line up with the bricks' studs.
  const [step, setStep] = useState(() => stepFor(sceneFor(decodeTheme(decodeURIComponent(location.hash.slice(1))), colouring)));

  function nextColouring() {
    const next = (colourIndex + 1) % COLOURINGS.length;
    colouring = COLOURINGS[next]!;
    setColourIndex(next);
    source.invalidate();
  }

  return (
    <ExampleShell
      title="A LEGO baseplate"
      intro={
        <p>
          The LEGO catalogue ({CATALOGUE.roots.length} themes, {LAYOUT.setBox.size.toLocaleString()} building sets) as one
          baseplate of {LAYOUT.plates.across} × {LAYOUT.plates.down} plates. Each theme is a plate, as big as the bricks on it
          need. Zoom in and the plate fades as what is on it comes in: its sub-themes' plates and its sets, each a brick sized by
          its part count, laid like masonry, on the same studs. Every scene is{" "}
          <code>layout: "fixed"</code>, with its theme's plate as its <code>bounds</code>.
        </p>
      }
      source={source}
      encode={(id) => id}
      decode={decodeTheme}
      trailOf={(id) => ["Catalogue", ...ancestry(id === null ? null : themeById(id)).map((theme) => theme.name)]}
      palette={PALETTE}
      ramp={ERA_RAMP}
      background={{
        color: BASEPLATE_GREEN,
        grid: { tile: BASEPLATE_TILE, step, zoom: "continuous", alpha: 1, color: STUD_GREEN, minScreenStep: 6 },
      }}
      renderers={() => import("./lego-renderers")}
      customViews={{ max: 2500 }}
      events={{ onEnter: ({ scene }) => setStep(stepFor(scene)) }}
      toolbar={
        <button type="button" onClick={nextColouring}>
          Bricks: {COLOURINGS[colourIndex]}
        </button>
      }
    />
  );
}

createRoot(document.getElementById("root")!).render(<Lego />);
