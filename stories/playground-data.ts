import type { ExplorerEdge, ExplorerEffect, ExplorerNode, ExplorerScene, ExplorerShape, ParentLink } from "../src/index";

/** A focus is a path of group indices: `null` is the top, `"2"` its third group, `"2/0"` deeper. */
export type Focus = string;

export interface DataArgs {
  /** Drillable groups per scene, at every level above the last. */
  groups: number;
  /** Plain items per scene. */
  items: number;
  /** How many levels of groups sit above the leaves. */
  depth: number;
  shapes: "mixed" | ExplorerShape;
  /** Random edges between a scene's items. */
  edges: number;
  /** Share of items with a `ramp` position (the rest get the per-id colour). */
  rampShare: number;
  /** Share of items with their own `color`, which wins over the ramp. */
  colourShare: number;
  ringShare: number;
  glowShare: number;
  pulseShare: number;
  seed: number;
}

/** Deterministic, so the same arguments always draw the same scene. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const SHAPES: ExplorerShape[] = ["disc", "square", "cloud"];
const OWN_COLOURS = ["#f43f5e", "#f59e0b", "#10b981", "#0ea5e9", "#a855f7"];

const hashString = (text: string) => [...text].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

/** Every scene of the playground, built on demand from `args`, plus each item's ramp position so
 *  presence can follow it. */
export function playgroundData(args: DataArgs) {
  const rampOf = new Map<string, number>();

  function scene(focus: Focus | null): ExplorerScene<Focus> {
    const level = focus === null ? 0 : focus.split("/").length;
    const next = random(args.seed + hashString(focus ?? "root"));
    const prefix = focus === null ? "" : `${focus}/`;
    const shapeFor = (i: number): ExplorerShape => (args.shapes === "mixed" ? SHAPES[i % 2]! : args.shapes);
    const decorate = (id: string) => {
      const ramp = next() < args.rampShare ? next() : null;
      if (ramp !== null) rampOf.set(id, ramp);
      const effects: ExplorerEffect[] = [];
      if (next() < args.glowShare) effects.push("glow");
      if (next() < args.pulseShare) effects.push("pulse");
      return {
        ramp,
        color: next() < args.colourShare ? OWN_COLOURS[Math.floor(next() * OWN_COLOURS.length)]! : null,
        emphasis: next() < args.ringShare ? ["ring" as const] : [],
        effects,
      };
    };

    const clusters =
      level < args.depth
        ? Array.from({ length: args.groups }, (_, i) => {
            const id = `${prefix}${i}`;
            return {
              id,
              label: `Group ${id}`,
              sublabel: `Level ${level + 1}`,
              weight: 4 + Math.floor(next() * 20),
              href: `#${id}`,
              drillsInto: id,
              shape: args.shapes === "mixed" ? ("cloud" as const) : args.shapes,
              ...decorate(id),
            };
          })
        : [];
    const nodes: ExplorerNode<Focus>[] = Array.from({ length: args.items }, (_, i) => {
      const id = `${prefix}item-${i}`;
      return {
        id,
        label: `Item ${i}`,
        weight: 1 + Math.floor(next() * 40),
        href: `#${id}`,
        drillsInto: null,
        shape: shapeFor(i),
        ...decorate(id),
      };
    });
    const ids = [...clusters, ...nodes].map((item) => item.id);
    const edges: ExplorerEdge[] =
      ids.length < 2
        ? []
        : Array.from({ length: args.edges }, (_, i) => {
            const a = Math.floor(next() * ids.length);
            const b = (a + 1 + Math.floor(next() * (ids.length - 1))) % ids.length;
            return { id: `${prefix}e${i}`, sourceId: ids[a]!, targetId: ids[b]!, kind: i % 3 === 0 ? "strong" : "link" };
          });
    return { id: focus ?? "root", heading: focus === null ? "Playground" : `Group ${focus}`, clusters, nodes, edges };
  }

  function parentOf(focus: Focus): ParentLink<Focus> {
    const parts = focus.split("/");
    const parent = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
    return { kind: "anchored", focus: parent, anchorId: focus };
  }

  return { scene, parentOf, rampOf };
}
