import { createRoot } from "react-dom/client";
import { createSceneSource, type ExplorerEdge, type ExplorerNode, type ExplorerScene } from "@thirkettle/data-explorer";
import { ExampleShell } from "../shared/ExampleShell";

/**
 * US071 — a measuring page, not a showcase: one packed scene of `nodes` items joined by `edges`
 * random edges, for reading draw cost off the stats overlay (`?stats=1`). Every parameter is in the
 * query string, so a measurement can be repeated exactly:
 *
 *   /stress?stats=1&nodes=1000&edges=2000&curve=0.2&dash=1&arrow=1&max=5000
 */
const params = new URLSearchParams(window.location.search);
const count = (name: string, fallback: number) => Math.max(0, Math.floor(Number(params.get(name) ?? fallback)) || 0);
const NODES = Math.max(2, count("nodes", 500));
const EDGES = count("edges", 500);
const CURVE = Number(params.get("curve") ?? 0) || 0;
const DASH = params.get("dash") === "1";
const ARROW = params.get("arrow") === "1";
// Without `max`, the package's own default cap applies.
const MAX = params.has("max") ? count("max", 0) : undefined;
// `textures=1` gives every item its own image URL (one of the solar system's faces, made unique by
// a query string), so the texture budget is what bounds memory, not sharing.
const TEXTURES = params.get("textures") === "1";
const BUDGET = params.has("budget") ? count("budget", 0) : undefined;
// `custom=1` draws every item with a custom renderer (stress/renderers.ts); `customMax` caps it.
const CUSTOM = params.get("custom") === "1";
const CUSTOM_MAX = params.has("customMax") ? count("customMax", 0) : undefined;
const FACES = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "moon", "io", "europa", "titan"];

/** Deterministic, so two runs with the same parameters draw the same scene. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function buildScene(): ExplorerScene<null> {
  const next = random(71);
  const nodes: ExplorerNode<null>[] = Array.from({ length: NODES }, (_, i) => ({
    id: `n${i}`,
    label: `Item ${i}`,
    weight: 1 + Math.floor(next() * 100),
    marks: [],
    href: `#n${i}`,
    drillsInto: null,
    shape: "disc",
    kind: CUSTOM ? "dot" : null,
    texture: TEXTURES ? { url: `/solar-system/textures/${FACES[i % FACES.length]}.svg?item=${i}` } : null,
  }));
  const edges: ExplorerEdge[] = Array.from({ length: EDGES }, (_, i) => {
    const a = Math.floor(next() * NODES);
    const b = (a + 1 + Math.floor(next() * (NODES - 1))) % NODES;
    return { id: `e${i}`, sourceId: `n${a}`, targetId: `n${b}`, kind: "link" };
  });
  return { id: "stress", heading: `${NODES} items, ${EDGES} edges`, clusters: [], nodes, edges };
}

const scene = buildScene();
const source = createSceneSource<null>({ load: () => scene });

createRoot(document.getElementById("root")!).render(
  <ExampleShell
    title="Stress test"
    intro={
      <p>
        One scene of {NODES} items and {EDGES} random edges, for measuring draw cost. Add{" "}
        <code>?stats=1</code> and pan: <code>avg</code> is the rolling draw time. Change{" "}
        <code>nodes</code>, <code>edges</code>, <code>curve</code>, <code>dash=1</code>,{" "}
        <code>arrow=1</code>, <code>max</code>, <code>textures=1</code>, <code>budget</code>,{" "}
        <code>custom=1</code> and <code>customMax</code> in the query string.
      </p>
    }
    source={source}
    encode={() => ""}
    decode={() => null}
    trailOf={() => [scene.heading]}
    textures={{ budget: BUDGET, minDiameterPx: 24 }}
    renderers={CUSTOM ? () => import("./renderers") : undefined}
    customViews={{ max: CUSTOM_MAX }}
    edges={{ visible: true, max: MAX, style: { curve: CURVE, dash: DASH ? [4, 4] : null, arrow: ARROW ? "end" : "none", alpha: 0.35 } }}
  />,
);
