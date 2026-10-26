import { createRoot } from "react-dom/client";
import { ExampleShell } from "../shared/ExampleShell";
import { decodeContinent, worldMapSource } from "./source";

const source = worldMapSource();

function WorldMap() {
  return (
    <ExampleShell
      title="A world map"
      intro={
        <p>
          Natural Earth's 110m countries (from <code>world-atlas</code>), projected once with{" "}
          <code>d3-geo</code> and drawn as <code>region</code>s in <strong>fixed</strong> scenes:
          continents at the top, each entered to its countries. Every country keeps its own shape and
          place, so zooming into a continent shows its countries exactly where it was, its neighbours
          round it. Lesotho is a hole in South Africa; point at it to see the difference.
        </p>
      }
      source={source}
      encode={(continent) => continent}
      decode={decodeContinent}
      trailOf={(continent) => (continent === null ? ["The world"] : ["The world", continent])}
      background={{ color: "#0b1d2e", grid: false }}
    />
  );
}

createRoot(document.getElementById("root")!).render(<WorldMap />);
