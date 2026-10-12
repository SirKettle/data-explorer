/**
 * Serves the examples with Bun's HTML bundler: `bun run examples` from this package, then open
 * the printed URL. Each page bundles its own `main.tsx`; edits reload in the browser.
 */
import gallery from "./index.html";
import atlas from "./atlas/index.html";
import fileTree from "./file-tree/index.html";
import moduleGraph from "./module-graph/index.html";
import stress from "./stress/index.html";
import solarSystem from "./solar-system/index.html";
import orgChart from "./org-chart/index.html";

/** `folder/<name>.svg`, where only a bare name is accepted (no dots or slashes), so a request
 *  can never reach outside `folder`. No CORS header is ever sent. */
function svg(folder: string, requested: string): Response {
  const name = requested.replace(/\.svg$/, "");
  if (!/^[a-z-]+$/.test(name)) return new Response("Not found", { status: 404 });
  return new Response(Bun.file(`${import.meta.dir}/${folder}/${name}.svg`), { headers: { "Content-Type": "image/svg+xml" } });
}

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3070),
  routes: {
    "/": gallery,
    "/file-tree": fileTree,
    "/module-graph": moduleGraph,
    "/atlas": atlas,
    "/stress": stress,
    "/solar-system": solarSystem,
    "/org-chart": orgChart,
    // Same-origin images: a canvas can only draw pixels its page may read.
    "/atlas/contours.svg": () => svg("atlas", "contours"),
    "/solar-system/stars.svg": () => svg("solar-system", "stars"),
    "/solar-system/textures/:face": (request) => svg("solar-system/textures", request.params.face),
  },
  development: true,
});

console.log(`data-explorer examples at ${server.url}`);

// A second origin (the next port) that serves images with no CORS header, so the solar-system
// example can show what happens when the canvas is not allowed to use one.
const noCors = Bun.serve({
  port: (server.port ?? 3070) + 1,
  fetch: (request) => svg("no-cors", new URL(request.url).pathname.slice(1)),
});
console.log(`no-CORS image origin at ${noCors.url}`);
