import type { ExplorerOutline, ExplorerRect, ExplorerScene, ExplorerShape, ParentLink } from "../src/index";

/** A focus is a path: `"Europe"`, then `"Europe/2"`, `"Europe/2/0"` deeper. `null` is the world. */
export type Focus = string;

export interface FixedArgs {
  /** Places each continent, and each place, is split into. */
  splits: number;
  /** Levels of places below the continents. */
  depth: number;
  /** The share of each box left empty round its children, so neighbours read apart. */
  gap: number;
  /** How each item is drawn: as a built-in shape (`region` fills its box, or its outline), or by
   *  the story's `tile` renderer, a custom renderer that fills its box. */
  drawWith: "tile" | ExplorerShape;
  /** Gives the deepest places, drawn as regions, ragged outlines, and every third one a lake: a
   *  hole that is neither drawn nor hit. */
  outlines: boolean;
  /** `fixed` keeps every level where it is; `packed` lays the places out as an ordinary scene, to
   *  compare. */
  childLayout: "fixed" | "packed";
  seed: number;
}

/**
 * A schematic world in longitude and latitude (x = longitude + 180, y = 90 − latitude): rough,
 * non-overlapping continent boxes, not borders. Every level below is made up by splitting its
 * parent's box, so each scene's `bounds` is exactly its parent item's box, in the same units.
 */
const CONTINENTS: { name: string; box: ExplorerRect }[] = [
  { name: "North America", box: { x: 12, y: 18, width: 116, height: 57 } },
  { name: "South America", box: { x: 98, y: 80, width: 48, height: 66 } },
  { name: "Europe", box: { x: 170, y: 19, width: 50, height: 34 } },
  { name: "Africa", box: { x: 162, y: 56, width: 70, height: 70 } },
  { name: "Asia", box: { x: 236, y: 13, width: 114, height: 84 } },
  { name: "Oceania", box: { x: 292, y: 101, width: 58, height: 38 } },
];
const WORLD: ExplorerRect = { x: 0, y: 0, width: 360, height: 180 };

/** Deterministic, so the same arguments always draw the same world. */
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const hashString = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** `rect` cut into `n` boxes: across its longer side, at an uneven point, again and again. */
function split(rect: ExplorerRect, n: number, next: () => number): ExplorerRect[] {
  if (n <= 1) return [rect];
  const first = Math.floor(n / 2);
  const t = Math.min(0.8, Math.max(0.2, (first / n) * (0.7 + 0.6 * next())));
  if (rect.width >= rect.height) {
    const w = rect.width * t;
    return [...split({ ...rect, width: w }, first, next), ...split({ ...rect, x: rect.x + w, width: rect.width - w }, n - first, next)];
  }
  const h = rect.height * t;
  return [...split({ ...rect, height: h }, first, next), ...split({ ...rect, y: rect.y + h, height: rect.height - h }, n - first, next)];
}

/** A ragged outline inside `rect`: its edge walked round with each point pulled in a little, and,
 *  with `lake`, a hole in the middle. */
function ragged(rect: ExplorerRect, next: () => number, lake: boolean): ExplorerOutline {
  const steps = 6;
  const pull = Math.min(rect.width, rect.height) * 0.12;
  const edge: number[][] = [];
  const corners = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height],
  ];
  corners.forEach(([x0, y0], side) => {
    const [x1, y1] = corners[(side + 1) % 4]!;
    // Inward, for this side: down, left, up, right.
    const [nx, ny] = [
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ][side]!;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const inward = i === 0 ? 0 : next() * pull;
      edge.push([x0! + (x1! - x0!) * t + nx! * inward, y0! + (y1! - y0!) * t + ny! * inward]);
    }
  });
  if (!lake) return [[edge]];
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const r = Math.min(rect.width, rect.height) * 0.18;
  const hole = Array.from({ length: 10 }, (_, i) => [cx + Math.cos((i / 10) * Math.PI * 2) * r, cy + Math.sin((i / 10) * Math.PI * 2) * r]);
  return [[edge, hole]];
}

/** `rect` with `share` of its smaller side taken off, half from each edge. */
function inset(rect: ExplorerRect, share: number): ExplorerRect {
  const d = (Math.min(rect.width, rect.height) * share) / 2;
  return { x: rect.x + d, y: rect.y + d, width: rect.width - 2 * d, height: rect.height - 2 * d };
}

export function fixedData(args: FixedArgs) {
  const kind = args.drawWith === "tile" ? "tile" : null;
  const shape: ExplorerShape = args.drawWith === "tile" ? "square" : args.drawWith;

  /** The box an item is drawn in, by its focus path, rebuilt from the world down. */
  function boxOf(focus: Focus): ExplorerRect {
    const [continent, ...path] = focus.split("/");
    let box = inset(CONTINENTS.find((c) => c.name === continent)!.box, args.gap);
    let prefix = continent!;
    for (const index of path) {
      box = inset(split(box, args.splits, random(args.seed + hashString(prefix)))[Number(index)]!, args.gap);
      prefix = `${prefix}/${index}`;
    }
    return box;
  }

  function labelOf(focus: Focus): string {
    const [continent, ...path] = focus.split("/");
    return path.length === 0 ? continent! : `${continent} ${path.map((i) => String.fromCharCode(65 + Number(i))).join("")}`;
  }

  function scene(focus: Focus | null): ExplorerScene<Focus> {
    const level = focus === null ? 0 : focus.split("/").length;
    const children: { id: Focus; box: ExplorerRect }[] =
      focus === null
        ? CONTINENTS.map((c) => ({ id: c.name, box: inset(c.box, args.gap) }))
        : split(boxOf(focus), args.splits, random(args.seed + hashString(focus))).map((box, i) => ({ id: `${focus}/${i}`, box: inset(box, args.gap) }));
    const hasChildren = level < args.depth;
    const fixed = focus === null || args.childLayout === "fixed";
    const shapes = random(args.seed + hashString(`${focus ?? "world"}:outline`));
    const raggedHere = args.outlines && shape === "region" && !hasChildren;
    const items = children.map(({ id, box }, i) => ({
      id,
      label: labelOf(id),
      sublabel: `${Math.round(box.width)} × ${Math.round(box.height)}`,
      weight: Math.round(box.width * box.height),
      href: `#${id}`,
      drillsInto: hasChildren ? id : null,
      shape,
      kind,
      ramp: (i + 0.5) / children.length,
      box,
      outline: raggedHere ? ragged(box, shapes, i % 3 === 0) : null,
      // With a lake in the middle, the label goes above it.
      labelAt: raggedHere && i % 3 === 0 ? { x: box.x + box.width / 2, y: box.y + box.height * 0.22 } : null,
      // Every fifth item carries the `ring` emphasis, to show it following each shape.
      emphasis: i % 5 === 2 ? ["ring" as const] : [],
    }));
    return {
      id: focus ?? "world",
      heading: focus === null ? "World" : labelOf(focus),
      layout: fixed ? "fixed" : "packed",
      bounds: focus === null ? WORLD : boxOf(focus),
      clusters: hasChildren ? items : [],
      nodes: hasChildren ? [] : items,
      edges: [],
    };
  }

  function parentOf(focus: Focus): ParentLink<Focus> {
    const parts = focus.split("/");
    return { kind: "anchored", focus: parts.length === 1 ? null : parts.slice(0, -1).join("/"), anchorId: focus };
  }

  return { scene, parentOf };
}
