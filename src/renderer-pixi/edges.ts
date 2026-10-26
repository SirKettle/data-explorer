// Drawn edges — US071 Step 4 (ADR-016 A25 clause 5: one of the files allowed to import pixi.js).
//
// One `Graphics` under every node, cleared and rebuilt on each draw while edges are on. Draws only
// happen when the camera, the scene or a transition changes, so this costs nothing at rest. The
// geometry is `scene/edge-geometry.ts`'s; this file only converts screen pixels to world units
// and strokes. Each layer's edges are placed from that layer's own nodes and take the lower alpha
// of their two ends, so an edge fades exactly as the items it joins do.

import { Graphics, type Container } from "pixi.js";
import type { RenderEdge, RenderNode } from "../camera/scene-stack";
import { edgeStyleFor, type ResolvedOptions } from "../options";
import { arrowhead, capEdges, dashes, edgeCurve, meetsBox, polyline, rangeInBox, shorten, type Point } from "../scene/edge-geometry";

/** One layer of edges to draw: a scene's, a preview's or the parent's ghost. */
export interface EdgeLayer {
  nodes: readonly RenderNode[];
  edges: readonly RenderEdge[];
  alpha: (node: RenderNode) => number;
  /** The id the cap keeps edges to first: the scene's focus, if it has one. */
  focusId: string | null;
}

const MIN_ALPHA = 0.01;
const CURVE_SEGMENTS = 16;
/** Alphas are rounded to this many steps so edges batch into a few strokes rather than one each.
 *  (Measured, Step 4: batching alone did not change the cost of 500 edges; dropping round caps and
 *  joins took it from 28.8 ms to 2.3 ms a frame, so strokes use Pixi's default butt caps.) */
const ALPHA_STEPS = 32;

interface Batch {
  width: number;
  colour: number;
  alpha: number;
  runs: Point[][];
  heads: (readonly [Point, Point, Point])[];
}

export function createEdgeDrawer(parent: Container) {
  const graphics = new Graphics();
  parent.addChildAt(graphics, 0);
  let drawn = 0;

  function draw(layers: readonly EdgeLayer[], edges: ResolvedOptions["edges"], defaultColour: number, scale: number, view: { left: number; right: number; top: number; bottom: number }) {
    graphics.clear();
    drawn = 0;
    if (!edges.visible) return;
    const px = 1 / scale; // one screen pixel in world units
    const batches = new Map<string, Batch>();
    const batchFor = (width: number, colour: number, alpha: number): Batch => {
      const key = `${width}|${colour}|${alpha}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { width, colour, alpha, runs: [], heads: [] };
        batches.set(key, batch);
      }
      return batch;
    };

    for (const layer of layers) {
      if (layer.edges.length === 0) continue;
      const byId = new Map(layer.nodes.map((n) => [n.id, n]));
      for (const edge of capEdges(layer.edges, layer.focusId, edges.max).drawn) {
        const source = byId.get(edge.sourceId);
        const target = byId.get(edge.targetId);
        if (!source || !target) continue;
        const style = edgeStyleFor(edges, edge.kind);
        const alpha = Math.round(style.alpha * Math.min(layer.alpha(source), layer.alpha(target)) * ALPHA_STEPS) / ALPHA_STEPS;
        if (alpha < MIN_ALPHA) continue;

        const curve = edgeCurve(circle(source), circle(target), style.curve);
        if (!curve) continue;
        const points = polyline(curve, style.curve === 0 ? 1 : CURVE_SEGMENTS);
        if (!meetsBox(points, view)) continue;

        const width = style.width * px;
        const headLength = (4 + style.width * 3) * px;
        const headWidth = (3 + style.width * 2.5) * px;
        const atStart = style.arrow === "start" || style.arrow === "both";
        const atEnd = style.arrow === "end" || style.arrow === "both";
        const line = shorten(points, atStart ? headLength * 0.8 : 0, atEnd ? headLength * 0.8 : 0);
        const batch = batchFor(width, style.color ?? defaultColour, alpha);

        if (line) {
          // Dash only the stretch on screen: a long edge at overview zoom is thousands of dashes,
          // nearly all off screen (measured, Step 4: 18.6 ms for 2000 dashed edges before this).
          if (!style.dash) batch.runs.push(line);
          else {
            const range = rangeInBox(line, view);
            if (range) batch.runs.push(...dashes(line, style.dash[0] * px, style.dash[1] * px, range));
          }
        }
        if (atEnd) batch.heads.push(arrowhead(points[points.length - 1]!, points[points.length - 2]!, headLength, headWidth));
        if (atStart) batch.heads.push(arrowhead(points[0]!, points[1]!, headLength, headWidth));
        drawn++;
      }
    }

    for (const batch of batches.values()) {
      if (batch.runs.length > 0) {
        for (const run of batch.runs) strokeRun(run);
        graphics.stroke({ width: batch.width, color: batch.colour, alpha: batch.alpha });
      }
      if (batch.heads.length > 0) {
        for (const head of batch.heads) fillHead(head);
        graphics.fill({ color: batch.colour, alpha: batch.alpha });
      }
    }
  }

  function strokeRun(run: readonly Point[]) {
    if (run.length < 2) return;
    graphics.moveTo(run[0]!.x, run[0]!.y);
    for (let i = 1; i < run.length; i++) graphics.lineTo(run[i]!.x, run[i]!.y);
  }

  function fillHead([tip, left, right]: readonly [Point, Point, Point]) {
    graphics.moveTo(tip.x, tip.y).lineTo(left.x, left.y).lineTo(right.x, right.y).closePath();
  }

  return {
    draw,
    /** How many edges the last draw stroked, for the stats overlay. */
    get drawn() {
      return drawn;
    },
  };
}

/** A node's circle: the largest that fits the box it is laid out in, as its shape is drawn. */
function circle(node: RenderNode) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2, r: Math.min(node.width, node.height) / 2 };
}
