import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ExampleShell } from "../shared/ExampleShell";
import { colourSetting, decodeFolder, fileTreeSource, type ColourBy } from "./source";

// Created once, outside React, so its cache outlives any re-render.
const colourBy = colourSetting("age");
const source = fileTreeSource(colourBy);

function FileTree() {
  const [mode, setMode] = useState<ColourBy>(colourBy.get());

  function switchMode() {
    const next = mode === "age" ? "type" : "age";
    colourBy.set(next); // the source invalidates, and the explorer recolours in place
    setMode(next);
  }

  return (
    <ExampleShell
      title="A file tree"
      intro={
        <p>
          A project folder as a tree. Folders are clouds you can zoom into; files are discs sized
          by bytes, coloured by how recently they changed (green newest, red oldest), and ringed
          when they have uncommitted changes. Switch to colour by type and each file carries its own{" "}
          <code>color</code>, which wins over its place on the ramp. <code>assets/icons</code> holds
          420 files: the scene draws 120 and a hollow aggregate says how many it left out.
        </p>
      }
      source={source}
      encode={(path) => path}
      decode={decodeFolder}
      trailOf={(path) => ["my-app", ...(path ?? "").split("/").filter(Boolean)]}
      toolbar={
        <button type="button" onClick={switchMode}>
          Colour by {mode === "age" ? "type" : "age"}
        </button>
      }
    />
  );
}

createRoot(document.getElementById("root")!).render(<FileTree />);
