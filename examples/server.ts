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
import worldMap from "./world-map/index.html";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3070),
  routes: {
    "/": gallery,
    "/file-tree": fileTree,
    "/file-tree/": fileTree,
    "/module-graph": moduleGraph,
    "/module-graph/": moduleGraph,
    "/atlas": atlas,
    "/atlas/": atlas,
    "/stress": stress,
    "/stress/": stress,
    "/solar-system": solarSystem,
    "/solar-system/": solarSystem,
    "/org-chart": orgChart,
    "/org-chart/": orgChart,
    "/world-map": worldMap,
    "/world-map/": worldMap,
  },
  development: true,
});

console.log(`data-explorer examples at ${server.url}`);
