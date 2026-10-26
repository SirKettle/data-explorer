# Plan: fixed layouts (shapes at the positions you give)

Drafted 2026-10-26. Status: all five phases done on `feat/fixed-layout`, to be released as
`feat!:`. Ladle story `stories/FixedLayout.stories.tsx`; guide `guides/fixed-layouts.mdx` with demo
`site/src/demos/fixed-layout.tsx`; example `examples/world-map/` (Natural Earth 110m from
`world-atlas`, projected with `d3-geo`, both development dependencies only).

**Goal.** Let the explorer show data whose items have their own shapes and positions, such as a
world map whose top level is continents and which you zoom into to reach countries and their
regions, while keeping the camera, transitions, streaming, previews and the accessible outline.

**Approach.** A third layout beside packed and radial: the consumer gives each item's rectangle (and
optionally its outline); the package places nothing. Mostly additive. Phase 1 keeps `size` as an
alias, so the whole can ship as `feat:`, not `feat!:`.

## The contract a consumer writes

On `ExplorerScene`:

- `layout?: "packed" | "fixed"`. Absent means today's behaviour; `focusId` still means radial.
- `bounds?: { x, y, width, height }`: the scene's extent in the consumer's own units. For Africa's
  scene, Africa's bounding box, the same rectangle Africa had in the world scene. That shared
  rectangle is what makes the countries land exactly on the continent. Defaults to the union of the
  items' boxes.

On `ExplorerNode` / `ExplorerCluster`, read only in a fixed scene:

- `box?: { x, y, width, height }`, in the same units as `bounds`. An item without one in a fixed
  scene is not drawn, and the scene warns once, as a missing renderer kind does.
- `outline?: number[][][]`: polygon rings in the same units, used for hit-testing and drawing. Absent
  means the box is the hit area.
- `shape: "region"`: a new built-in shape that fills `outline` (or the box), so a map needs no custom
  renderer. A custom `kind` still replaces it.

`weight` stays required so the types do not split; a fixed scene ignores it for sizing.

Geography stays in the consumer: GeoJSON, projection, simplification per level, which scenes exist.
The package never learns what a map is, so the "no domain vocabulary" test still holds.

## Phases

### 1. Non-square boxes, with no change in behaviour

The prerequisite for everything else.

- `RenderNode` gains `width` / `height`; `size` stays, deprecated, as `max(width, height)`. Additive in
  `api/headless.api.md`.
- `PlainBox` and `childBoxInParent` / `parentBoxInChild` (`src/camera/transition.ts`) become
  rectangles; `childToParentFactor` fits by `min(aw / cw, ah / ch)`.
- Every `size / 2` centre or radius moves over: `scene-stack.ts`, `renderer.ts`, `transition.ts`,
  `camera.ts` (`frameBox`), `edges.ts`.
- `ItemFrame` gains `width` / `height` for custom renderers, keeping `size`.
- Done when packed and radial still produce square boxes and the existing tests pass unchanged.

As built: a shape is drawn centred in its box at the largest size that fits (`min(width, height)`),
which is the box itself when square; `ItemFrame.size` is that diameter. The round tests Phase 2
replaces (`fillOf`, `nodeAtScreenCentre`, `maybeMoveAcross`, `hitTest`) measured by the box's larger
side until Phase 2 did.

### 2. One containment test

Four separate circle tests decide what is under a point today:

- `hitTest` (`renderer.ts`);
- `nodeAtScreenCentre` (auto-enter on zoom, `scene-stack.ts`);
- `anchorFootprint` / `maybeMoveAcross` (moving sideways, `scene-stack.ts`);
- `fillOf`.

Replace them with one pure `contains(node, worldPoint)` in `scene/`: a circle for `disc` and `cloud`,
the rectangle for `square`, point-in-polygon on `outline` for `region`, after a bounding-box check.
Keep a minimum target in pixels for hit-testing (today's `minRadiusPx`) so small items stay
clickable. For a region, `fillOf` becomes the box's on-screen area relative to the viewport.

As built: `src/scene/geometry.ts` (`contains`, `distanceToCentre`, `fillFraction`). Fill is not area
but the box's on-screen size over the view's along whichever axis it fills more: identical to the
old measure for a square box, and the same one `cameraFillingBox` frames by, so the existing
thresholds (auto-enter at 0.85 and the rest) keep their meaning. One change in behaviour: a
`square` item is now hit across its whole box, corners included, where it used to be hit as a
circle. `outline` waits for Phase 4.

### 3. `fixedLayout` in `src/scene/layout.ts`

- A pure function that moves the boxes to a (0, 0) origin relative to `bounds`; the layout's width and
  height are the bounds'.
- `layoutFor` (`scene-stack.ts`) picks it for `scene.layout === "fixed"`.
- Streaming append is trivial, because positions are given; `sunflowerLayoutAppend` routes a fixed
  scene to it.
- A fixed scene skips the cluster floor and the size normalisation.
- `CHILD_CONTAIN_FRACTION` stays 0.8 for a packed parent; a fixed parent and fixed child use 1, so
  the child's `bounds` maps exactly onto the anchor's box. The fraction becomes per frame rather than
  one constant, including where `entryScale` is computed.

As built: `fixedLayout` in `src/scene/layout.ts`; `layoutFor`, `layoutAppend` and
`containFraction` in `scene-stack.ts`, with the fraction kept on each stack frame (`contain`). An
item without a `box` is simply left out, with no warning yet. A `square` now stretches to fill its
box (identical in a square box), and its hover and selection rings follow a rectangle. The built-in
square is drawn inset in its box (its texture's padding), so a child scene at a fraction of 1 spills
just past the parent's drawn edge; the story draws with a custom `tile` renderer that fills the box
exactly, using `ItemFrame.width` / `height`. Phase 4's `region` shape fills its box exactly.

Found in the story: a fixed scene in the data's own units can be too small for the camera's
`MAX_SCALE` (40) to fill the screen, so deeper levels could never be entered. `fixedLayout` now
scales every scene so its longer side is 1,000 units, as a packed scene's world is about that size.
Fitting a child into its parent uses only proportions, so the exact landing is unaffected.

### 4. Drawing regions in `renderer-pixi/`

- A `Graphics` path per region, cached by scene and item id, rebuilt only when its outline changes,
  never every frame. Fill and tint come from the existing appearance code.
- Hover, selection and the `ring` emphasis stroke the outline instead of drawing a ring sprite.
- Labels at the box centre by default, with an optional `labelAt?: { x, y }`, because a box's centre
  can fall outside an awkwardly shaped item.
- Previews (children drawn inside a parent before you enter) need nothing once Phase 1 is done.

As built: `shape: "region"`, `outline` (`ExplorerOutline`, a projected GeoJSON MultiPolygon's
coordinates) and `labelAt` on items. A render node carries the outline and label point relative to
its box (`relativeOutline`), so previews and ghosts need no extra work. Fills are pooled `Graphics`
built at 1 × 1 and scaled, rebuilt only when given a different outline array; holes use `cut()`.
Hover, selection and the `ring` emphasis are strokes in one `Graphics`, redrawn each frame at a
constant width on screen. Regions are labelled inside, and get no halo. Hit-testing is
point-in-polygon with holes; the smallest target now applies only to items smaller than it, so a
lake in the middle of a big region is never hit (unchanged for discs and squares).

Type note for the release: `ExplorerShape`, `NodeShape` and `NodeAppearance.ring` gained `"region"`.
That is additive for anyone writing scenes, but a consumer that switches exhaustively over one of
them would stop compiling, so the release note should say so.

### 5. Docs, example and playground

- A Ladle story and a site example: world as continents, each continent as its countries, from
  Natural Earth 110m (public domain), projected in the example with `d3-geo`, an example
  dependency only.
- A Concepts or guide page on fixed layouts, its demo in `site/src/demos/` so `check:docs` passes.
- `bun run api:report` for the new fields; check that polygon data stays within `check:size`.

## Risks and open questions

1. **Coordinates across levels.** The contract above is one global projection, with each child's
   `bounds` equal to its parent's box. The simplest, and the recommendation. The alternative, a
   projection per continent, looks better (Russia and Antarctica in Mercator) but the child no longer
   lines up with its parent and would need a crossfade instead of an exact overlay. Decide before
   Phase 3.
2. **Touching items.** Packed scenes rely on gaps between items. Countries share borders, so glow,
   halo and grow-in may smear across neighbours; likely off or reduced for `region`.
3. **Moving sideways.** With polygon containment this should work, arguably better than with clouds
   (panning from France into Spain just works). Test the fill threshold at a fraction of 1 so a move
   does not fire as soon as a border is touched.
4. **Performance.** Hit-testing walks every item per pointer move. Countries at 110m are fine;
   thousands of detailed regions would need a spatial index, which can wait until needed.
5. **Outline order.** The accessible outline lists clusters, then nodes, in the scene's order. For a
   map, the consumer's order (alphabetical, say) is right, so no change; the docs should say so.

## Order

Phases 1 and 2 are the risky part: they touch every geometry site but change no behaviour, so the
existing tests guard them. Each phase can be its own PR. Phase 1 is useful alone and unblocks the
rest; 3 to 5 are additive.
