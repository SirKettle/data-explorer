import {
  createSceneSource,
  type ExplorerCluster,
  type ExplorerEdge,
  type ExplorerNode,
  type ExplorerScene,
  type SceneSource,
} from "@thirkettle/data-explorer";
import { delay } from "../shared/delay";
import { importersOf, IN_CYCLE, MODULES, modulesIn, PACKAGES, type Module } from "./data";

/**
 * A graph, reached through a tree. The focus is a small tagged union, which the explorer treats
 * as opaque:
 *
 * - `null`: every package, as clusters (packed);
 * - a package: its modules, as nodes (packed);
 * - a module: its neighbourhood (radial, because the scene sets `focusId`): the module in the
 *   middle, what it imports as discs, what imports it as squares, joined by typed edges.
 *
 * Every neighbour drills into its own neighbourhood, so you can walk the graph sideways forever.
 * Cycles cost nothing: the explorer only loads the scenes you actually visit, each once.
 */
export type Focus = { kind: "package"; pkg: string } | { kind: "module"; id: string };

const href = (focus: Focus) => `/module-graph#${encodeFocus(focus)}`;

export const encodeFocus = (focus: Focus) =>
  focus.kind === "package" ? `package:${focus.pkg}` : `module:${focus.id}`;

export function decodeFocus(hash: string): Focus | null {
  const [kind, value] = [hash.slice(0, hash.indexOf(":")), hash.slice(hash.indexOf(":") + 1)];
  if (kind === "package" && PACKAGES.includes(value)) return { kind: "package", pkg: value };
  if (kind === "module" && MODULES.has(value)) return { kind: "module", id: value };
  return null;
}

function marksFor(module: Module): string[] {
  return [
    `${module.lines} lines`,
    `imports ${module.imports.length}`,
    `imported by ${importersOf(module.id).length}`,
    ...(IN_CYCLE.has(module.id) ? ["on an import cycle"] : []),
  ];
}

function moduleNode(module: Module, shape: ExplorerNode<Focus>["shape"]): ExplorerNode<Focus> {
  const focus: Focus = { kind: "module", id: module.id };
  return {
    id: module.id,
    label: module.name,
    sublabel: module.pkg,
    weight: module.lines,
    marks: marksFor(module),
    href: href(focus),
    drillsInto: focus,
    shape,
    // No ramp: each module keeps a stable colour of its own wherever it appears.
    ramp: null,
    emphasis: IN_CYCLE.has(module.id) ? ["ring"] : [],
  };
}

function packageCluster(pkg: string): ExplorerCluster<Focus> {
  const modules = modulesIn(pkg);
  const focus: Focus = { kind: "package", pkg };
  return {
    id: pkg,
    label: pkg,
    sublabel: `${modules.length} modules`,
    weight: modules.length,
    marks: [`${modules.length} modules`],
    href: href(focus),
    drillsInto: focus,
    shape: "cloud",
    truncated: null,
  };
}

/** US071 — packed scenes have edges too: a package depends on another when any of its modules
 *  imports one of the other's. The packed layout ignores edges; they are only drawn. */
function packageEdges(): ExplorerEdge[] {
  const pairs = new Set<string>();
  for (const module of MODULES.values()) {
    for (const id of module.imports) {
      const other = MODULES.get(id)!.pkg;
      if (other !== module.pkg) pairs.add(`${module.pkg}->${other}`);
    }
  }
  return [...pairs].sort().map((pair) => {
    const [sourceId, targetId] = pair.split("->") as [string, string];
    return { id: pair, sourceId, targetId, kind: "depends-on" };
  });
}

/** Imports between modules of the same package. */
function importsWithin(pkg: string): ExplorerEdge[] {
  return modulesIn(pkg).flatMap((module) =>
    module.imports
      .filter((id) => MODULES.get(id)!.pkg === pkg)
      .map((id) => ({ id: `${module.id}->${id}`, sourceId: module.id, targetId: id, kind: "imports" })),
  );
}

function buildScene(focus: Focus | null): ExplorerScene<Focus> {
  if (focus === null) {
    return {
      id: "root",
      heading: "All packages",
      clusters: PACKAGES.map(packageCluster),
      nodes: [],
      edges: packageEdges(),
    };
  }
  if (focus.kind === "package") {
    return {
      id: focus.pkg,
      heading: focus.pkg,
      clusters: [],
      nodes: modulesIn(focus.pkg).map((m) => moduleNode(m, "disc")),
      edges: importsWithin(focus.pkg),
    };
  }

  const centre = MODULES.get(focus.id)!;
  const imports = centre.imports.map((id) => MODULES.get(id)!);
  // A module that both imports and is imported by the centre is drawn once, as an import.
  const importers = importersOf(centre.id).filter((m) => !centre.imports.includes(m.id));
  const edges: ExplorerEdge[] = [
    ...imports.map((m) => ({
      id: `${centre.id}->${m.id}`,
      sourceId: centre.id,
      targetId: m.id,
      kind: "imports",
    })),
    ...importers.map((m) => ({
      id: `${m.id}->${centre.id}`,
      sourceId: m.id,
      targetId: centre.id,
      kind: "imported-by",
    })),
  ];
  return {
    id: centre.id,
    heading: centre.id,
    focusId: centre.id, // this is what makes the scene radial
    clusters: [],
    nodes: [
      moduleNode(centre, "disc"),
      ...imports.map((m) => moduleNode(m, "disc")),
      ...importers.map((m) => moduleNode(m, "square")),
    ],
    edges,
  };
}

export function moduleGraphSource(): SceneSource<Focus> {
  return createSceneSource<Focus>({
    keyOf: (focus) => (focus === null ? "root" : encodeFocus(focus)),
    load: async (focus) => {
      await delay(120);
      return buildScene(focus);
    },
    parentOf(focus) {
      if (focus.kind === "package") return { kind: "anchored", focus: null, anchorId: focus.pkg };
      // A module lives in exactly one package, and appears there under its own id. (Walking
      // sideways and then zooming out retraces your steps instead: the explorer remembers.)
      return {
        kind: "anchored",
        focus: { kind: "package", pkg: MODULES.get(focus.id)!.pkg },
        anchorId: focus.id,
      };
    },
  });
}
