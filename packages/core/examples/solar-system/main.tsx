import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ExampleShell } from "../shared/ExampleShell";
import { bodyById } from "./data";
import { decodePlanet, solarSystemSource } from "./source";
import starsUrl from "./stars.svg";

const source = solarSystemSource();

function SolarSystem() {
  const [failed, setFailed] = useState<string[]>([]);

  return (
    <ExampleShell
      title="A solar system"
      intro={
        <p>
          The Sun with its planets round it; enter a planet to see its moons. Every body is drawn
          with a <code>texture</code> from this page's own origin, cropped to its disc once it is
          big enough on screen. Pluto's comes from a second origin that sends no CORS header, so
          the canvas may not use it: Pluto keeps its plain disc, and <code>onTextureError</code>{" "}
          reports it once, below. The Sun pulses; the orbits are edges. The planets are drawn by
          a custom renderer, loaded lazily: a night side, and rings for Saturn that shimmer (held
          still under reduced motion).
        </p>
      }
      source={source}
      encode={(planet) => planet}
      decode={decodePlanet}
      trailOf={(planet) => (planet === null ? ["The Solar System"] : ["The Solar System", bodyById.get(planet)!.name])}
      background={{ color: "#03040a", image: { url: starsUrl, fit: "tile", alpha: 0.8 }, grid: false }}
      edges={{ visible: true, style: { dash: [2, 6], alpha: 0.35, width: 1 } }}
      textures={{ minDiameterPx: 32 }}
      renderers={() => import("./planet-renderers")}
      events={{ onTextureError: ({ url }) => setFailed((urls) => [...urls, url]) }}
      footer={
        failed.length > 0 && (
          <section className="example__events" aria-label="Texture errors">
            <p className="example__camera">
              onTextureError: {failed.join(", ")} could not be drawn on the canvas (no CORS header).
            </p>
          </section>
        )
      }
    />
  );
}

createRoot(document.getElementById("root")!).render(<SolarSystem />);
