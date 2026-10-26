/**
 * US032 Step 3 / ADR-016 Decisions 2-3 — the scene model, extracted from the winning DOM/SVG
 * prototype (Step 1), not invented ahead of it.
 *
 * This file imports nothing outside `scene/`: no React, no consumer types (ADR-016 Decision 2, as
 * amended by A24, enforced by `architecture.test.ts`). It knows nothing about what a consumer's
 * data *is*: the consumer's adapter speaks to it only through `label`, `weight`, `marks`, `href`,
 * `drillsInto`, `shape`, `ramp` and `emphasis`, and a test keeps domain vocabulary out.
 *
 * Two of the story's acceptance criteria are structural guarantees here, not review promises:
 *
 * 1. **Every node has a real link to its conventional page.** `ExplorerNode.href` is mandatory,
 *    so a node without one is unconstructable. This is the whole mechanism behind "every
 *    relationship exposed visually remains navigable through an equivalent conventional control".
 * 2. **A partial grouping must never look complete.** A cluster that stands for items left out
 *    sets `truncated: { shown, total }`, which `windowed()` produces, and only such a cluster is
 *    drawn hollow and announced as "showing N of M". `truncated` was a mandatory key until US072
 *    (review change 6) made it optional, because every ordinary cluster had to spell out `null`:
 *    the guarantee lives in `windowed()` and in the aggregate's own declaration now, not in a
 *    required field on every cluster.
 *
 * **Non-navigable aggregates are clusters, never nodes** (ADR-016 Decision 3). A cluster's `href`
 * is nullable — `null` for a pure count with no page of its own (an honest `Other (N groups)`
 * figure), and set for a cluster that also happens to have a real destination (a group with a page
 * of its own). A node's `href` has no such escape hatch.
 */

/**
 * How an item is drawn: a soft `cloud` for a group you go into, a hard-edged `disc` or `square` for
 * a single thing. Distinct shapes read even when items are too small to label. A `region` is an
 * area of its own, for a fixed scene: its `outline` (or, without one, its whole `box`), filled edge
 * to edge, labelled inside. A custom renderer (`kind`) replaces the shape where one is loaded.
 */
export type ExplorerShape = "cloud" | "disc" | "square" | "region";

/** A colour: a `0xRRGGBB` number, or a CSS string (`#rrggbb`, `#rgb`, `rgb()`, `hsl()`). */
export type ExplorerColour = number | string;

/** `glow` draws a soft light in the item's colour behind it; `pulse` makes that glow breathe. The
 *  view's `effects` switch both globally, and a pulse holds still under `prefers-reduced-motion`. */
export type ExplorerEffect = "glow" | "pulse";

/** An image drawn on the canvas inside a `disc` or `square` item, cropped to its shape. The canvas
 *  can only use pixels it may read: serve it from the same origin or with CORS headers, or it is
 *  not drawn (and `onTextureError` says so). A `cloud` ignores it. */
export interface ExplorerTexture {
  /** The image's address: same origin, or a host that sends CORS headers. */
  url: string;
  /** `cover` (the default) fills the shape, cropping the image; `contain` fits the whole image inside. */
  fit?: "cover" | "contain";
}

/** `ring` draws an outline and a soft halo in the item's shape, in the palette's `ownership`
 *  colour: for a state worth seeing at a glance, such as "you own this". */
export type ExplorerEmphasis = "ring";

/** A rectangle in a fixed scene's own units: left, top, width and height. */
export interface ExplorerRect {
  /** Left edge. */
  x: number;
  /** Top edge. */
  y: number;
  /** Width. */
  width: number;
  /** Height. */
  height: number;
}

/**
 * A `region`'s outline, in the same units as its `box`: a list of polygons, each a list of rings,
 * each a list of `[x, y]` points. A polygon's first ring is its edge and any others are holes in it,
 * the shape of a GeoJSON MultiPolygon's coordinates once projected. Keep it inside the box: the box
 * is what is culled and fitted, and a point outside it never counts as on the region.
 */
export type ExplorerOutline = number[][][][];

/** A point in a fixed scene's own units. */
export interface ExplorerPoint {
  /** Across. */
  x: number;
  /** Down. */
  y: number;
}

/** How much of a group an aggregate stands for: `shown` of `total` (as from `windowed()`). */
export interface ExplorerTruncation {
  /** How many of the group's items the scene draws. */
  shown: number;
  /** How many there are in all. */
  total: number;
}

/**
 * One thing in a scene: a file, a person, a module. Drawn as a disc or square (or by a custom
 * renderer), and listed in the accessible outline as a link to its `href`.
 *
 * `F` is your focus type (where `drillsInto` leads) and `D` your own data (`data`), both handed back
 * unchanged by the selection events.
 */
export interface ExplorerNode<F = unknown, D = unknown> {
  /** Unique within its scene. In a radial scene, `focusId` and edges refer to items by it. */
  id: string;
  /** The name shown under the item and in the outline. */
  label: string;
  /** A second line, shown when the item is big enough on screen, and in the outline. */
  sublabel?: string | null;
  /** Sets the item's size relative to the other nodes in its scene (nodes and clusters are sized
   *  separately). Use a real count the viewer could read, such as files, members or bytes. */
  weight: number;
  /** Short display text shown with the item in the outline (badges). Never parsed. Defaults to none. */
  marks?: string[];
  /** The item's own page. Required: everything the canvas shows must also be reachable as an
   *  ordinary link, through the outline. Use a stable in-app URL if your data has no pages. */
  href: string;
  /** The focus this item opens when entered, or `null` if there is nothing inside it. The item a
   *  radial scene centres on (`focusId`) is never entered, whatever this says. */
  drillsInto: F | null;
  /** Its shape: `"disc"` or `"square"` for a node (a `"cloud"` reads as a group). */
  shape: ExplorerShape;
  /** A position from 0 to 1 on the view's colour ramp (`ramp` prop). Absent or `null` gives the
   *  item a stable colour of its own instead, so a missing value never reads as an average one. */
  ramp?: number | null;
  /** The item's own colour, which wins over `ramp` and the stable per-id colour. An unparseable
   *  value is ignored. */
  color?: ExplorerColour | null;
  /** `["ring"]` draws an outline and halo: see `ExplorerEmphasis`. */
  emphasis?: ExplorerEmphasis[];
  /** `"glow"` and/or `"pulse"`: see `ExplorerEffect`. */
  effects?: ExplorerEffect[];
  /** An image drawn inside the item once it is big enough on screen: see `ExplorerTexture`. */
  texture?: ExplorerTexture | null;
  /** Selects a custom renderer from the view's `renderers` module (for example `"planet"`). With
   *  no renderer for this kind, the item is drawn as its `shape`. */
  kind?: string | null;
  /** Where the item is, in a scene with `layout: "fixed"`: its rectangle in the scene's units. A
   *  `square` fills it; a `disc` or `cloud` is the largest circle that fits. Without one, the item
   *  is not drawn in a fixed scene. Other layouts ignore it. */
  box?: ExplorerRect | null;
  /** A `region`'s shape inside its `box` (see `ExplorerOutline`): drawn, and hit-tested, instead of
   *  the whole box. Ignored by other shapes. */
  outline?: ExplorerOutline | null;
  /** Where a `region`'s label goes, in the same units as its `box`: a point well inside it, for a
   *  shape whose box's middle falls outside it. Defaults to the middle of the box. */
  labelAt?: ExplorerPoint | null;
  /** Your own data for this item, handed back with it by the selection events (`onNodeSelect`,
   *  `onNodeHover`, `onNodeActivate`). The explorer never reads it. */
  data?: D;
}

/**
 * A group in a scene: a folder, a department, a package. Drawn as a soft cloud, usually entered to
 * see what is inside. It shares a node's fields, with two differences:
 *
 * - its `href` may be `null`, but only for an **aggregate**: a cluster standing for items left out
 *   ("12 more"), which sets `truncated` and has `drillsInto: null`. An aggregate is drawn hollow,
 *   cannot be entered, and the outline says "showing N of M";
 * - it is sized against the other clusters, and always drawn at least twice the size of the
 *   largest node in its scene.
 */
export interface ExplorerCluster<F = unknown, D = unknown> {
  /** As `ExplorerNode.id`. */
  id: string;
  /** As `ExplorerNode.label`. */
  label: string;
  /** As `ExplorerNode.sublabel`. */
  sublabel?: string | null;
  /** Sets the cluster's size relative to the other clusters in its scene. Use a real count. */
  weight: number;
  /** As `ExplorerNode.marks`. */
  marks?: string[];
  /** The group's own page, or `null` only for an aggregate (see above). */
  href: string | null;
  /** The focus this group opens when entered; `null` for an aggregate or a group with nothing inside. */
  drillsInto: F | null;
  /** Set only on an aggregate standing for items left out (use `windowed()`); absent or `null`
   *  means this cluster is complete. */
  truncated?: ExplorerTruncation | null;
  /** Usually `"cloud"`. */
  shape: ExplorerShape;
  /** As `ExplorerNode.ramp`. */
  ramp?: number | null;
  /** As `ExplorerNode.color`. An aggregate keeps the palette's `aggregate` colour. */
  color?: ExplorerColour | null;
  /** As `ExplorerNode.emphasis`. */
  emphasis?: ExplorerEmphasis[];
  /** As `ExplorerNode.effects`. Ignored on an aggregate. */
  effects?: ExplorerEffect[];
  /** As `ExplorerNode.texture`. A `"cloud"` ignores it. */
  texture?: ExplorerTexture | null;
  /** As `ExplorerNode.kind`. */
  kind?: string | null;
  /** As `ExplorerNode.box`. */
  box?: ExplorerRect | null;
  /** As `ExplorerNode.outline`. */
  outline?: ExplorerOutline | null;
  /** As `ExplorerNode.labelAt`. */
  labelAt?: ExplorerPoint | null;
  /** As `ExplorerNode.data`. */
  data?: D;
}

/**
 * A relationship between two items of the same scene, by their ids.
 *
 * - **In a radial scene** (one with `focusId`), edges decide the layout: the items joined to the
 *   centre by an edge, in either direction, are its neighbours, placed evenly round it. They are
 *   grouped by the `kind` of the edge that joins them, then ordered by id, starting at three
 *   o'clock and going clockwise. An item joined to the centre by no edge is not drawn in a radial
 *   scene.
 * - **In a packed scene**, edges do not affect the layout.
 * - **Either way**, with the view's `edges={{ visible: true }}`, every edge whose two ends are
 *   drawn is drawn too, styled by its `kind` (including edges between two neighbours), and listed
 *   in the outline as a link to its far end.
 *
 * Direction matters only for drawing: an arrowhead (`edges.styles[kind].arrow`) points from
 * `sourceId` to `targetId`.
 */
export interface ExplorerEdge {
  /** Unique within its scene. */
  id: string;
  /** The item the edge starts from. */
  sourceId: string;
  /** The item the edge ends at. */
  targetId: string;
  /** What the relationship is (`"imports"`, `"reports-to"`): groups neighbours in a radial scene,
   *  and selects a style in the view's `edges.styles`. Never interpreted. */
  kind: string;
}

/** One item of a scene, a node or a cluster, as you wrote it: what the selection events hand back.
 *  A cluster is the one whose `href` may be `null`, and the only one that can carry `truncated`. */
export type ExplorerItem<F = unknown, D = unknown> = ExplorerNode<F, D> | ExplorerCluster<F, D>;

/**
 * Everything drawn at one focus: a heading, its clusters and nodes, and the edges between them.
 * Your scene source builds one per focus.
 *
 * **Packed** (the default): clusters and nodes packed together, biggest first; how a level of a
 * tree is shown. **Radial**: set `focusId` to an item's id to draw it in the middle with its
 * neighbours round it; how one item's neighbourhood in a graph is shown (see `ExplorerEdge`).
 * **Fixed**: set `layout: "fixed"` and give every item a `box`; items are drawn where you put them,
 * at the size you gave, for data with places of its own, such as a map.
 */
export interface ExplorerScene<F = unknown, D = unknown> {
  /** Identifies the scene (for example, the focus as a string). */
  id: string;
  /** The scene's name: announced to screen readers, and good for a breadcrumb. */
  heading: string;
  /** The groups in the scene. */
  clusters: ExplorerCluster<F, D>[];
  /** The single things in the scene. */
  nodes: ExplorerNode<F, D>[];
  /** Relationships between items of this scene (see `ExplorerEdge`). */
  edges: ExplorerEdge[];
  /** `"fixed"` draws every item at its own `box`, ignoring `weight`; `"packed"` (the default) lays
   *  them out for you. A fixed scene with a `focusId` keeps its boxes; the focus is still never
   *  entered. */
  layout?: "packed" | "fixed";
  /** A fixed scene's extent, in the same units as its items' boxes; defaults to the smallest
   *  rectangle round them. When a fixed scene is entered from an item of a fixed scene, its
   *  `bounds` is fitted exactly onto that item's box: give a child scene its parent item's box as
   *  `bounds`, in the same units, and the children land exactly where the parent was drawn. */
  bounds?: ExplorerRect | null;
  /** Makes the scene radial, centred on the item with this id. The centre is drawn at a fixed size
   *  and is never entered; its neighbours are sized against each other. */
  focusId?: string | null;
  /** How many items the scene will hold once every part has streamed in, if known in advance. The
   *  layout reserves room for that many, so a streaming scene never outgrows its space. */
  expectedItemCount?: number;
}

/**
 * The one windowing primitive every adapter level uses (D5's per-level budgets). Deterministic:
 * the first `limit` items in whatever order the caller already sorted them, never re-sorted here.
 * `truncated` is `null` exactly when nothing was left out — the mechanical guarantee behind "a
 * partial grouping must never look complete".
 */
export function windowed<T>(items: readonly T[], limit: number): { shown: T[]; truncated: ExplorerTruncation | null } {
  if (items.length <= limit) {
    return { shown: [...items], truncated: null };
  }
  return { shown: items.slice(0, limit), truncated: { shown: limit, total: items.length } };
}
