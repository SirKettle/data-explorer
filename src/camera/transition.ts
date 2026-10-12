// The cross-fade between a scene and the scene inside one of its nodes — pure maths, no pixi, no
// scene-stack state, so every curve here is unit-tested directly.
//
// The whole transition is driven by **one number**: `fill`, the anchor node's on-screen size as a
// fraction of the viewport's smaller dimension. Before the swap it's read from the parent's anchor
// box; after the swap it's read from the *virtual* anchor the child scene was fitted into. `enter`
// and `leave(false)` both preserve that geometry exactly (`childToParentFactor` below), so `fill`
// is continuous across the swap — and because every alpha is a function of `fill` alone, so is
// everything drawn. That is what makes the swap invisible: the same pixels, at the same opacity,
// just owned by a different scene.
//
//  * The children fade in behind the parent's cloud as it grows (`childAlpha`).
//  * The cloud thins as the children become visible, then dissolves entirely shortly after the swap
//    (`cloudAlpha`) — it is still drawn, as a ghost over the child scene, until it's gone.
//
// Every node runs this on its own `fill`, so any number can be revealing at once and none fades
// because a different node is being zoomed into; the anchor's siblings stay as they are.

/** Where the children start fading in — comfortably after a prefetch at `PREVIEW_PREFETCH_FILL`
 *  has had time to land, so they arrive *into* a fade rather than popping in mid-way. */
const CHILD_FADE_START = 0.22;
/** Fully visible a little before the 85% auto-enter threshold, so the swap lands on a fully
 *  revealed child scene. */
const CHILD_FADE_END = 0.8;
/** How much of the cloud's own alpha the fully-revealed children wash out (not all of it: a faint
 *  haze over the children right at the swap is what reads as "inside the cloud"). */
const CLOUD_WASHOUT = 0.82;
/** The last of the haze dissolves over this `fill` range — after the swap, as the user carries on
 *  zooming into the child scene. */
const HAZE_DISSOLVE_START = 0.86;
const HAZE_DISSOLVE_END = 1.5;

/** The prefetch threshold for the dive candidate. Lower than the old 40% so the children have
 *  usually arrived before `CHILD_FADE_START`. */
export const PREVIEW_PREFETCH_FILL = 0.16;
/** Below this, no candidate is considered at all — nothing to preview, and nothing to compute. */
export const PREVIEW_MIN_FILL = 0.14;
/** How long a preview that has just arrived takes to fade up to its `fill`-driven alpha, so a
 *  late arrival (a fast zoom, a slow network) never pops in. */
export const PREVIEW_ARRIVAL_MS = 420;

/** The fraction of the anchor box the child scene is fitted into, both in a preview and at the
 *  swap (the scene stack's `CONTAIN_PADDING_FACTOR` is this). Was 0.9; lowered so the children sit
 *  within the cloud's visible body rather than spilling past its faint edge. */
export const CHILD_CONTAIN_FRACTION = 0.8;

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** The children's opacity at `fill`, scaled by how far through its arrival fade the preview is
 *  (`arrival` in `[0, 1]`; 1 for anything already on screen). */
export function childAlpha(fill: number, arrival = 1): number {
  return smoothstep(CHILD_FADE_START, CHILD_FADE_END, fill) * arrival;
}

/** The anchor cloud's opacity *multiplier* (the renderer owns its base opacity). Thins as the
 *  children appear, then dissolves. With no children to reveal (`childVisibility` 0) it only
 *  dissolves, never thins, so a cloud never fades into nothing while its contents are loading.
 *
 *  `solid` is for an anchor that isn't a cloud (a disc or a square): a lingering haze only reads
 *  as haze when it is soft — the same leftover opacity on a hard-edged shape is a big flat disc
 *  over the scene. A solid anchor is washed out completely, so it's gone by the time its
 *  contents are fully shown. */
export function cloudAlpha(fill: number, childVisibility: number, solid = false): number {
  const washout = solid ? 1 : CLOUD_WASHOUT;
  return (1 - washout * childVisibility) * (1 - smoothstep(HAZE_DISSOLVE_START, HAZE_DISSOLVE_END, fill));
}

export interface PlainBox {
  x: number;
  y: number;
  size: number;
}

/**
 * The child layout's world units per parent world unit, inverted: one child world unit is this many
 * parent world units. Pure geometry — the child layout fitted into `CHILD_CONTAIN_FRACTION` of the
 * anchor box — so it is the same at entry, at leave and for a preview, regardless of camera.
 */
export function childToParentFactor(anchorSize: number, childWidth: number, childHeight: number): number {
  return (CHILD_CONTAIN_FRACTION * anchorSize) / Math.max(childWidth, childHeight, 1e-9);
}

/** A child-world box expressed in parent world coordinates, centred in `anchor`. */
export function childBoxInParent(box: PlainBox, anchor: PlainBox, childWidth: number, childHeight: number): PlainBox {
  const k = childToParentFactor(anchor.size, childWidth, childHeight);
  const anchorCx = anchor.x + anchor.size / 2;
  const anchorCy = anchor.y + anchor.size / 2;
  return {
    x: anchorCx + (box.x - childWidth / 2) * k,
    y: anchorCy + (box.y - childHeight / 2) * k,
    size: box.size * k,
  };
}

/** The inverse of `childBoxInParent`: a parent-world box expressed in the child's world. */
export function parentBoxInChild(box: PlainBox, anchor: PlainBox, childWidth: number, childHeight: number): PlainBox {
  const k = childToParentFactor(anchor.size, childWidth, childHeight);
  const anchorCx = anchor.x + anchor.size / 2;
  const anchorCy = anchor.y + anchor.size / 2;
  return {
    x: childWidth / 2 + (box.x - anchorCx) / k,
    y: childHeight / 2 + (box.y - anchorCy) / k,
    size: box.size / k,
  };
}
