import {
  createSceneSource,
  type ExplorerCluster,
  type ExplorerNode,
  type ExplorerRect,
  type ExplorerScene,
  type RampColours,
  type CachedSceneSource,
} from "@data-xplorer/core";
import { LAYOUT } from "./baseplate";
import { CATALOGUE, LEGO_COLOURS, paletteColour, themeById, type LegoSet, type Theme } from "./data";

/**
 * The catalogue as one giant baseplate, in fixed scenes. A theme is a plate; zoom into it and what
 * is on it comes in as the plate fades away (the package's own reveal, for a solid item): its
 * sub-themes' plates and its own sets, as bricks. Every scene's
 * `bounds` is its theme's plate, in the same studs as the scene above, so a stud is the same size
 * on screen either side of the swap and nothing moves when it happens.
 *
 * The focus is a theme's id (`null`, the whole catalogue).
 */
type Focus = string;

/** What a brick or plate carries for its renderer: its size in studs, since the renderer is given
 *  only world units, and those change from scene to scene. */
export interface LegoItemData {
  studs: { w: number; h: number };
}

/** How the bricks are coloured: `mixed` like a tub of bricks, `theme` in their theme's colour,
 *  `era` on a ramp from the oldest set to the newest. */
export type BrickColouring = "mixed" | "theme" | "era";

/** Old sets in the primary colours of the 1950s to 1970s, new ones in today's mid tones. */
export const ERA_RAMP: RampColours = {
  stops: [LEGO_COLOURS.red, LEGO_COLOURS.yellow, LEGO_COLOURS.blue, LEGO_COLOURS.mediumAzure, LEGO_COLOURS.magenta],
  interpolation: "oklab",
};
const FIRST_YEAR = 1949;
const LAST_YEAR = 2026;

const studsOf = (box: ExplorerRect): LegoItemData => ({ studs: { w: box.width, h: box.height } });

const themeHref = (theme: Theme) => `#${theme.id}`;

function themePlate(theme: Theme): ExplorerCluster<Focus, LegoItemData> {
  const box = LAYOUT.themeBox.get(theme)!;
  return {
    id: theme.id,
    label: theme.name,
    sublabel: `${theme.total} ${theme.total === 1 ? "set" : "sets"}`,
    weight: theme.total,
    marks: [
      `${theme.total} sets`,
      ...(theme.children.length > 0 ? [`${theme.children.length} sub-themes`] : []),
      `${box.width} × ${box.height} studs`,
    ],
    href: themeHref(theme),
    drillsInto: theme.id,
    shape: "region",
    kind: "plate",
    color: theme.colour,
    box,
    data: studsOf(box),
  };
}

function setBrick(set: LegoSet, colouring: BrickColouring): ExplorerNode<Focus, LegoItemData> {
  const box = LAYOUT.setBox.get(set)!;
  return {
    id: set.id,
    label: set.name,
    sublabel: [set.number, set.year].filter(Boolean).join(" · "),
    weight: Math.max(set.parts, 1),
    marks: [
      `${set.parts} pieces`,
      ...(set.year ? [`released ${set.year}`] : []),
      `a ${Math.min(box.width, box.height)} × ${Math.max(box.width, box.height)} brick`,
    ],
    href: `https://rebrickable.com/search/?q=${encodeURIComponent(set.number)}`,
    drillsInto: null,
    shape: "region",
    kind: "brick",
    color: colouring === "mixed" ? paletteColour(set.number + set.name) : colouring === "theme" ? set.theme.colour : null,
    ramp: colouring === "era" && set.year ? (set.year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR) : null,
    box,
    data: studsOf(box),
  };
}

export function sceneFor(focus: Focus | null, colouring: BrickColouring): ExplorerScene<Focus, LegoItemData> {
  const theme = focus === null ? null : themeById(focus);
  if (theme === null) {
    return {
      id: "catalogue",
      heading: "The catalogue",
      layout: "fixed",
      bounds: LAYOUT.baseplate,
      clusters: CATALOGUE.roots.map(themePlate),
      nodes: [],
      edges: [],
    };
  }
  return {
    id: theme.id,
    heading: theme.name,
    layout: "fixed",
    bounds: LAYOUT.themeBox.get(theme)!,
    clusters: theme.children.map(themePlate),
    nodes: theme.sets.map((set) => setBrick(set, colouring)),
    edges: [],
  };
}

/** World units per stud in a scene: the package scales a fixed scene so its longer side is 1000. */
export function stepFor(scene: Pick<ExplorerScene, "bounds">): number {
  const bounds = scene.bounds ?? LAYOUT.baseplate;
  return 1000 / Math.max(bounds.width, bounds.height);
}

export function legoSource(colouring: () => BrickColouring): CachedSceneSource<Focus, LegoItemData> {
  return createSceneSource<Focus, LegoItemData>({
    load: async (focus) => sceneFor(focus, colouring()),
    parentOf: (focus) => ({ kind: "anchored", focus: themeById(focus)?.parent?.id ?? null, anchorId: focus }),
  });
}

export const decodeTheme = (hash: string) => (themeById(hash) ? hash : null);
