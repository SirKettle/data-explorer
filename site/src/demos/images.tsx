import { useState } from "react";
import { createSceneSource, DataExplorer } from "@data-xplorer/core";

// An image the canvas may draw: same origin, a data: URL, or a host that sends CORS headers.
const face = (hue: number) =>
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 70% 55%)"/><circle cx="22" cy="26" r="5"/><circle cx="42" cy="26" r="5"/><path d="M18 42q14 12 28 0" stroke="#000" stroke-width="4" fill="none"/></svg>`,
  );
// An image it may not: GitHub's avatar redirect sends no CORS header. An <img> shows it; a canvas
// cannot, so that item keeps its plain disc and `onTextureError` reports the URL, once.
const NO_CORS = "https://github.com/SirKettle.png";

const people = ["Ada", "Ben", "Cleo", "Dev", "Eli"];
const source = createSceneSource<null>({
  load: () => ({
    id: "people",
    heading: "People",
    clusters: [],
    nodes: [
      ...people.map((name, i) => ({
        id: name,
        label: name,
        weight: 5,
        href: `#${name}`,
        drillsInto: null,
        shape: "disc" as const,
        texture: { url: face(i * 70) },
      })),
      {
        id: "no-cors",
        label: "No CORS",
        weight: 5,
        href: "#no-cors",
        drillsInto: null,
        shape: "square" as const,
        texture: { url: NO_CORS },
      },
    ],
    edges: [],
  }),
});

export default function Images() {
  const [failed, setFailed] = useState<string[]>([]);
  return (
    <>
      <DataExplorer
        source={source}
        focus={null}
        textures={{ minDiameterPx: 24 }} // draw images from 24 px across (the default is 48)
        onTextureError={({ url }) => setFailed((list) => [...list, url])}
      />
      <pre className="demo-log">
        {failed.length === 0 ? "No texture errors yet." : failed.map((url) => `onTextureError: ${url}`).join("\n")}
        {"\nThe same URL in an <img>, which needs no CORS: "}<img src={NO_CORS} alt="" width={20} height={20} />
      </pre>
    </>
  );
}
