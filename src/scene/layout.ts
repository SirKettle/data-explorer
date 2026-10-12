import type { ExplorerScene } from "./types";

/**
 * ADR-016 Decision 4 — `scene => positions` as a pure function: a sunflower/Fermat-spiral
 * placement for the L0-L2 cluster levels and a radial placement by relation kind for the L3
 * neighbourhood, both viewport-free (the continuous camera's own scale decides what's visible).
 * Both are deterministic — identical input produces identical output on every call — which is
 * also why no layout is ever persisted (AC 10): there is nothing worth storing.
 *
 * This file imports only `./types` — no React, no DOM, no `Math.random` seeded by wall-clock time.
 */

/** Where one item sits in a laid-out scene, in the scene's own world units. */
export interface ExplorerBox {
  /** The item's id. */
  id: string;
  /** Which list the item came from. */
  kind: "cluster" | "node";
  /** Left edge. */
  x: number;
  /** Top edge. */
  y: number;
  /** Width. */
  width: number;
  /** Height (equal to width). */
  height: number;
}

/** A laid-out scene: every item's box, and the size of the whole. */
export interface ExplorerLayout {
  /** One box per drawn item. */
  boxes: ExplorerBox[];
  /** The width of the whole laid-out scene, in world units. */
  width: number;
  /** The height of the whole laid-out scene, in world units. */
  height: number;
  /** For a scattered spiral (`sunflowerLayout`): the number of slots reserved, which
   *  `sunflowerLayoutAppend` keeps filling. Absent for the radial focus layout. */
  capacity?: number;
}

const MIN_BOX = 32;
const MAX_BOX = 220;
const FOCUS_SIZE = 140;

/**
 * US036 plan Step 3R.2 / D2 — per-scene size normalisation, replacing the old fixed
 * `72 + √w × 6` absolute map. The camera already fits each scene to the viewport at its own scale
 * on entry, so an absolute scale bought cross-scene comparability the viewer could never actually
 * see (§2.1/D2 of the plan: half of everything landed in a 72-101px band under the old map) and
 * cost the entire dynamic range within a scene, which is the comparison a viewer actually makes
 * ("which of these two is bigger").
 *
 * Two adjustments on top of D2's original min-max map, made after a live review found the size
 * spread still too subtle to read at a glance:
 *
 *  - **Outlier clamping.** Weights above the `OUTLIER_CLAMP_PERCENTILE`-th percentile are treated
 *    as equal to that percentile's value for scaling purposes (still sorted heaviest-first by
 *    their real weight — only *size* is clamped). A single mega-item (one item whose weight
 *    range can span 5 to 11,695) used to consume the entire visual range by itself, crushing every
 *    ordinary pairwise difference toward `min`; clamping keeps that outlier "big" without flattening
 *    everyone else.
 *  - **A gentler-than-sqrt exponent** (`SIZE_EXPONENT`, between linear and `sqrt`) so that, once
 *    the outlier is out of the way, a genuinely-double weight reads as visibly bigger rather than
 *    just technically bigger — pure `sqrt` (dimension ∝ √weight, chosen so *area* tracks weight
 *    linearly) is the more conventional choice for encoding magnitude via area, but under-delivers
 *    on "make the difference obvious" at a glance, which is what this scale is for.
 *
 * A degenerate scene (every item the same weight, or none) has nothing to normalise and sizes
 * everything at the range's midpoint — never `min`, which would say "smallest" about data with no
 * smallest. `min`/`max` are parameters (not always `MIN_BOX`/`MAX_BOX`) so a caller can normalise
 * one subset of a scene's items into its own, separately-floored range — see `buildSizeScales`.
 */
const SIZE_EXPONENT = 0.7;
const OUTLIER_CLAMP_PERCENTILE = 0.9;

function sizeScale(weights: readonly number[], min = MIN_BOX, max = MAX_BOX): (weight: number) => number {
  const positive = weights.map((weight) => Math.max(weight, 0));
  if (positive.length === 0) return () => min;

  // With too few items a "90th percentile" is not a meaningful outlier boundary — for `n < 5` it
  // can land on (or near) the smallest value and clamp everything to it, destroying the exact
  // differentiation this function exists to preserve. Below that count, the cap is simply the max:
  // no clamping.
  const sorted = [...positive].sort((a, b) => a - b);
  const capIndex = sorted.length >= 5 ? Math.min(sorted.length - 1, Math.floor(OUTLIER_CLAMP_PERCENTILE * (sorted.length - 1))) : sorted.length - 1;
  const cap = sorted[capIndex]!;

  const scaled = positive.map((weight) => Math.min(weight, cap) ** SIZE_EXPONENT);
  const lo = Math.min(...scaled);
  const hi = Math.max(...scaled);
  if (lo === hi) {
    const flat = Math.round((min + max) / 2);
    return () => flat;
  }

  return (weight: number) => {
    const t = (Math.min(Math.max(weight, 0), cap) ** SIZE_EXPONENT - lo) / (hi - lo);
    return Math.round(min + Math.min(1, Math.max(0, t)) * (max - min));
  };
}

interface LayoutItem {
  id: string;
  kind: "cluster" | "node";
  weight: number;
}

/**
 * A cluster (a sub-group, standing in for a whole subtree of items) and a node (one item) carry
 * weight in genuinely different units — a cluster's is a *count of sets*, a node's is a *part
 * count* — so normalising them on one shared scale conflated two unrelated quantities and produced
 * a spread neither reflected. This computes each group's own scale independently, then floors every
 * cluster's size at `CLUSTER_MIN_SIZE_RATIO` times the *biggest node actually on screen* — a
 * sub-group should always read as "bigger than any individual item", the same way it always draws as
 * a coarser unit of the same view. The floor is a range (`[floor, 2×floor]`), not a single flat
 * size, so clusters still show their own relative weight against each other; it collapses to the
 * ordinary `[MIN_BOX, MAX_BOX]` map when the scene has no nodes to floor against (a top-level
 * overview, which is clusters only).
 */
const CLUSTER_MIN_SIZE_RATIO = 2;

function buildSizeScales(items: readonly LayoutItem[]): (item: LayoutItem) => number {
  const clusterWeights = items.filter((item) => item.kind === "cluster").map((item) => item.weight);
  const nodeWeights = items.filter((item) => item.kind === "node").map((item) => item.weight);

  const nodeSizeFor = sizeScale(nodeWeights);
  const nodeMaxSize = nodeWeights.length > 0 ? Math.max(...nodeWeights.map(nodeSizeFor)) : 0;

  const clusterFloor = nodeMaxSize > 0 ? nodeMaxSize * CLUSTER_MIN_SIZE_RATIO : MIN_BOX;
  const clusterCeil = nodeMaxSize > 0 ? clusterFloor * 2 : MAX_BOX;
  const clusterSizeFor = sizeScale(clusterWeights, clusterFloor, clusterCeil);

  return (item: LayoutItem) => (item.kind === "cluster" ? clusterSizeFor(item.weight) : nodeSizeFor(item.weight));
}

// ---- US036 plan Step 3.1 / ADR-016 amendment A5 — scattered spiral placement ----------------
//
// The L0-L2 layout for the continuous-camera surface. Still a golden-angle spiral (no two items on
// one "spoke", no visible rows), but reworked after live review:
//
//  * **Sized up front.** A group streams its items in page by page; the old layout grew outward
//    with each page, so on a first visit the items spilled past the boundary the group had been
//    fitted to when it was entered. A scene can now say how many items it will hold
//    (`ExplorerScene.expectedItemCount`), and the layout reserves that many slots from the very
//    first page — its bounds never change, and later pages fill in across the whole disc.
//  * **Scattered, not sorted.** Slots are handed out in a seeded, shuffled order, so where an item
//    lands says nothing about its weight (heaviest-first read as a lit 3-D globe when panning).
//    Items are taken in arrival order — clusters, then nodes, as the scene lists them — which is
//    the same order whether the scene streamed in or came from cache, so both lay out the same.
//  * **Denser in the middle.** Radius grows as `slot ^ DENSITY_EXPONENT`; above 0.5 (the evenly
//    spaced Fermat spiral) the spacing widens steadily towards the rim.
//  * **A soft edge.** Each slot is pushed in or out by a random amount that grows towards the rim,
//    so the disc frays at its edge instead of ending in a clean circle.
//  * **No overlaps.** Sizes aren't known when slots are reserved, so each item, as it's placed,
//    steps outward from its slot until it clears everything already placed. Earlier items never
//    move, which is what keeps a streamed page from disturbing the last.

/** Centre-to-centre spacing of the innermost slots: room for the biggest node plus a margin. */
const SLOT_SPACING = MAX_BOX * 1.3;
/** `r ∝ slot ^ p`. 0.5 spaces slots evenly; this makes the rim's spacing ~1.7× the core's at 1,000. */
const DENSITY_EXPONENT = 0.58;
/** At the rim, a slot's radius moves by up to ± this fraction of itself. */
const EDGE_SCATTER = 0.2;
/** Everywhere, a slot also moves sideways by up to ± this much. */
const SLOT_JITTER = SLOT_SPACING * 0.3;
/** Clearance kept between boxes, and the outward step taken while finding it. */
const CLEARANCE = 12;
const MAX_NUDGES = 80;
// The golden angle (~137.5°): placing slot k at angle k × GOLDEN_ANGLE is the standard technique
// for distributing points across a disk with no two on the same radial spoke at any scale.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Sets the innermost slot's area to `SLOT_SPACING²` — see `slotRadius`. */
const SPIRAL_SCALE = SLOT_SPACING / Math.sqrt(2 * Math.PI * DENSITY_EXPONENT);

function idHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A small seeded PRNG (mulberry32) — never `Math.random()`, which would make the layout a
 *  different shape on every render and break "identical input, identical output". */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slotRadius(slot: number): number {
  return SPIRAL_SCALE * Math.pow(slot + 0.5, DENSITY_EXPONENT);
}

/** The outer radius `capacity` slots reach, edge scatter included, with room for the biggest node
 *  still to arrive. Clusters can be bigger, but a scene's clusters are all there from its first
 *  page, so `sunflowerLayout` widens the extent to fit them; only nodes stream in later. (A margin
 *  sized for the biggest possible cluster dwarfed a small scene's actual content.) */
function extentFor(capacity: number): number {
  return slotRadius(Math.max(capacity - 1, 0)) * (1 + EDGE_SCATTER) + SLOT_JITTER + MAX_BOX / 2;
}

/** Everything about where slot `k` sits, relative to the spiral's centre — a pure function of
 *  (scene id, capacity, k), so an append computes exactly what a full layout would. */
function slotPosition(sceneSeed: number, capacity: number, slot: number): { x: number; y: number } {
  const rand = seededRandom(sceneSeed ^ Math.imul(slot + 1, 0x9e3779b1));
  const rim = Math.min(1, slot / Math.max(capacity - 1, 1));
  const base = slotRadius(slot);
  const radius = base * (1 + (rand() * 2 - 1) * EDGE_SCATTER * rim * rim);
  const angle = slot * GOLDEN_ANGLE;
  const sideways = (rand() * 2 - 1) * SLOT_JITTER;
  return {
    x: radius * Math.cos(angle) - Math.sin(angle) * sideways,
    y: radius * Math.sin(angle) + Math.cos(angle) * sideways,
  };
}

/** Which slot the `index`-th arriving item takes: a seeded shuffle of the reserved slots, then —
 *  only if more items arrive than the scene expected — the spiral simply continues outward. */
function slotOrder(sceneSeed: number, capacity: number): number[] {
  const order = Array.from({ length: capacity }, (_, i) => i);
  const rand = seededRandom(sceneSeed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

function slotFor(order: number[], index: number): number {
  return index < order.length ? order[index]! : index;
}

/** Clusters, then nodes, in the order the scene lists them — the order a streamed scene grows in. */
function arrivalItems(scene: ExplorerScene): LayoutItem[] {
  return [
    ...scene.clusters.map((cluster) => ({ id: cluster.id, kind: "cluster" as const, weight: cluster.weight })),
    ...scene.nodes.map((node) => ({ id: node.id, kind: "node" as const, weight: node.weight })),
  ];
}

function overlapsAny(x: number, y: number, size: number, placed: readonly ExplorerBox[]): boolean {
  const left = x - CLEARANCE;
  const top = y - CLEARANCE;
  const right = x + size + CLEARANCE;
  const bottom = y + size + CLEARANCE;
  for (const box of placed) {
    if (left < box.x + box.width && right > box.x && top < box.y + box.height && bottom > box.y) return true;
  }
  return false;
}

/** Places `items` (with their sizes) into `placed`, continuing from `startIndex` arrivals. */
function placeItems(
  items: readonly { item: LayoutItem; size: number }[],
  placed: ExplorerBox[],
  startIndex: number,
  sceneSeed: number,
  order: number[],
  capacity: number,
  centre: number,
): void {
  items.forEach(({ item, size }, i) => {
    const slot = slotFor(order, startIndex + i);
    const at = slotPosition(sceneSeed, capacity, slot);
    // Step outward along the slot's own direction until clear of everything already placed.
    const distance = Math.hypot(at.x, at.y) || 1;
    const dirX = distance > 1e-6 ? at.x / distance : 1;
    const dirY = distance > 1e-6 ? at.y / distance : 0;
    const step = Math.max(size, MIN_BOX) * 0.4;
    let x = centre + at.x - size / 2;
    let y = centre + at.y - size / 2;
    for (let nudge = 0; nudge < MAX_NUDGES && overlapsAny(x, y, size, placed); nudge++) {
      x += dirX * step;
      y += dirY * step;
    }
    placed.push({ id: item.id, kind: item.kind, x, y, width: size, height: size });
  });
}

/**
 * The scattered spiral over `clusters` + `nodes` — see the section comment above. `width`/`height`
 * come from the scene's `expectedItemCount` (or its current item count, if it states none), plus
 * however far any item actually landed, so every box fits; `capacity` is carried on the layout for
 * `sunflowerLayoutAppend`.
 */
export function sunflowerLayout(scene: ExplorerScene): ExplorerLayout {
  const items = arrivalItems(scene);
  const sizeFor = buildSizeScales(items);
  const capacity = Math.max(items.length, scene.expectedItemCount ?? 0);
  const sceneSeed = idHash(scene.id);
  const centre = extentFor(capacity);

  const placed: ExplorerBox[] = [];
  placeItems(items.map((item) => ({ item, size: sizeFor(item) })), placed, 0, sceneSeed, slotOrder(sceneSeed, capacity), capacity, centre);

  // Normally a no-op; only grows if nudging pushed something past the reserved extent.
  let reach = centre;
  for (const box of placed) {
    reach = Math.max(reach, Math.abs(box.x - centre), Math.abs(box.x + box.width - centre), Math.abs(box.y - centre), Math.abs(box.y + box.height - centre));
  }
  const shift = reach - centre;
  const boxes = shift > 0 ? placed.map((box) => ({ ...box, x: box.x + shift, y: box.y + shift })) : placed;
  return { boxes, width: reach * 2, height: reach * 2, capacity };
}

/**
 * The incremental sibling of `sunflowerLayout`, for a group scene still streaming in more of its
 * own sets. Places only the items in `scene` that aren't already in `previous`, into the next
 * slots of the same reserved, shuffled order — **every already-placed box is copied through
 * unchanged**, and `width`/`height` never change, because the extent was reserved for the whole
 * group up front. (Recomputing the full layout on every page reshuffled and reshifted every
 * visible dot; confirmed in a real browser before this existed.)
 *
 * Sizes are normalised over the whole growing scene, but an already-placed box keeps the size it
 * was given, so a streamed layout can differ slightly in size from a fresh one. Positions only
 * drift from a fresh layout if a later item's nudge hits something a fresh layout would have sized
 * differently — and only ever for the new item.
 */
export function sunflowerLayoutAppend(scene: ExplorerScene, previous: ExplorerLayout): ExplorerLayout {
  const existingIds = new Set(previous.boxes.map((box) => box.id));
  const items = arrivalItems(scene);
  const newItems = items.filter((item) => !existingIds.has(item.id));
  if (newItems.length === 0) return previous;

  const sizeFor = buildSizeScales(items);
  const capacity = previous.capacity ?? previous.boxes.length;
  const sceneSeed = idHash(scene.id);
  const placed = [...previous.boxes];
  placeItems(
    newItems.map((item) => ({ item, size: sizeFor(item) })),
    placed,
    previous.boxes.length,
    sceneSeed,
    slotOrder(sceneSeed, capacity),
    capacity,
    previous.width / 2,
  );
  return { boxes: placed, width: previous.width, height: previous.height, capacity };
}

// ---- US036 plan Step 3R.1 / ADR-016 amendment A16 — viewport-free radial focus layout, D2 -----
//
// A camera world has no fixed viewport for a focus/neighbour ring to size itself against
// (`centreX`/`centreY`/`radius` derived from one would reflow on every rotate or resize and fight
// the camera's own transform) — the same reasoning that makes `sunflowerLayout` viewport-free for
// the L0-L2 tier applies here for L3: the camera's own scale decides what's visible, so there is
// no "radius" for this layout to fit to. Neighbours are grouped by `edge.kind` (alphabetical, for
// determinism) and spread evenly around a single ring, each kind occupying a contiguous angular
// arc proportional to its member count — a tree plus one bounded neighbourhood hop has no need of
// a general force-directed graph layout (ADR-016 Decision 4).

const FOCUS_RING_RADIUS = 640;

/** The L3 sibling of `sunflowerLayout` — the Visual Explorer's only focus/neighbourhood layout
 *  since US036 plan Step 5 deleted the discrete click-drill `SceneView`'s own viewport-fractional
 *  version of this ring. */
export function radialFocusLayout(scene: ExplorerScene): ExplorerLayout {
  const focusId = scene.focusId;
  const boxes: ExplorerBox[] = [];
  // A fixed margin of `MAX_BOX` (not a per-neighbour size) keeps the focus exactly centred in the
  // reported bounding box regardless of how large any one neighbour turns out to be.
  const centreX = FOCUS_RING_RADIUS + MAX_BOX;
  const centreY = FOCUS_RING_RADIUS + MAX_BOX;

  const nodesById = new Map(scene.nodes.map((node) => [node.id, node]));

  if (focusId && nodesById.has(focusId)) {
    boxes.push({
      id: focusId,
      kind: "node",
      x: centreX - FOCUS_SIZE / 2,
      y: centreY - FOCUS_SIZE / 2,
      width: FOCUS_SIZE,
      height: FOCUS_SIZE,
    });
  }

  // Group neighbour node ids by the edge kind that connects them to the focus, sorted so the
  // grouping (and therefore every angle below) is independent of the edges' original array order
  // — identical rationale to `radialLayout`'s own version of this loop.
  const neighbourIds = new Set<string>();
  const kindOf = new Map<string, string>();
  for (const edge of [...scene.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    const neighbourId = edge.sourceId === focusId ? edge.targetId : edge.targetId === focusId ? edge.sourceId : null;
    if (neighbourId === null || neighbourId === focusId) continue;
    neighbourIds.add(neighbourId);
    if (!kindOf.has(neighbourId)) kindOf.set(neighbourId, edge.kind);
  }

  const ordered = [...neighbourIds]
    .filter((id) => nodesById.has(id))
    .sort((a, b) => {
      const kindCompare = (kindOf.get(a) ?? "").localeCompare(kindOf.get(b) ?? "");
      return kindCompare !== 0 ? kindCompare : a.localeCompare(b);
    });

  // Box size comes from this file's own `sizeScale` (the same per-scene-normalised rule every
  // other layout in this file uses) rather than a flat `NEIGHBOUR_SIZE` — a camera world has no
  // fixed viewport to divide a constant size against, so weight is what distinguishes a busy
  // neighbour from a quiet one here. Normalised over the neighbours alone, not the focus (which
  // is always `FOCUS_SIZE` regardless of its own weight) — the focus was never part of this
  // spread and including it would let one outlier compress every neighbour's own range.
  const sizeFor = sizeScale(ordered.map((id) => nodesById.get(id)!.weight));
  const total = ordered.length;
  ordered.forEach((id, index) => {
    const node = nodesById.get(id)!;
    const size = sizeFor(node.weight);
    const angle = total === 0 ? 0 : (2 * Math.PI * index) / total;
    const x = centreX + FOCUS_RING_RADIUS * Math.cos(angle) - size / 2;
    const y = centreY + FOCUS_RING_RADIUS * Math.sin(angle) - size / 2;
    boxes.push({ id, kind: "node", x, y, width: size, height: size });
  });

  const span = centreX * 2;
  return { boxes, width: span, height: span };
}
