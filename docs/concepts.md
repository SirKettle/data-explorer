# Concepts

Six ideas, in the order you meet them.

## 1. Focus: where the viewer is

A **focus** is a value you choose that says where the viewer is in your data: a folder path, a
database id, `{ kind: "module", id }`, anything. `null` always means the top. The explorer never
looks inside a focus; it only hands it back to you.

You give each focus a **key** (`keyOf`): a string that is equal for equal foci. The explorer uses
it to cache and compare scenes. `keyOf(null)` is usually `"root"`.

## 2. Scene: what is drawn at a focus

A **scene** is everything drawn at one focus: a `heading`, the items, and any edges between them.
Your scene source builds it; the explorer lays it out and draws it.

Items come in two lists:

- **`clusters`**: groups, usually drawn as soft clouds you can enter. A cluster's `href` may be
  `null`, but only for an "Other (N more)" aggregate, which also sets `truncated` (`windowed()`
  makes both for you). An aggregate is drawn hollow and cannot be entered.
- **`nodes`**: single things, drawn as discs or squares. A node always has an `href`.

Every item has an `id` (unique in its scene), a `label`, a `weight`, an `href`, a `shape`
(`"cloud"`, `"disc"` or `"square"`) and `drillsInto`, and may have `marks` (short text shown in the
accessible outline) and `data` (your own, handed back by the selection events).

**`weight` sets size, within its own list.** Nodes are sized against the other nodes in the scene,
and clusters against the other clusters; every cluster is drawn at least twice the size of the
largest node, so groups read as groups. Size grows more gently than weight (weight to the power
0.7), and the top tenth of weights is clamped, so one outlier cannot shrink everything else. Use a
real count the viewer could read (files, members, bytes), not a made-up score.

## 3. Drilling in, zooming out

**`drillsInto`** is the focus an item opens, or `null` if there is nothing inside it. Zooming far
enough into such an item (or double-clicking it) enters it: the explorer loads the scene for that
focus and draws it inside the item, so the viewer never loses their place.

Zooming **out** of a scene asks your source's `parentOf(focus)` where to go:

- `{ kind: "anchored", focus, anchorId }`: the parent scene has an item, `anchorId`, standing for
  this one; the camera zooms out of it smoothly. This is the usual answer for a tree.
- `{ kind: "unanchored", focus }`: there is a parent, but no single item in it stands for this
  scene; the explorer swaps to it directly.
- `{ kind: "none" }`: nothing above.

If the viewer *entered* the scene, zooming out goes back the way they came, whatever `parentOf`
says. `parentOf` matters when they arrived some other way, such as a deep link.

The explorer keeps a stack of the scenes the viewer entered and never walks your data, so a graph
with cycles is safe: it costs only the scenes actually visited.

## 4. Packed and radial scenes

A scene is laid out one of two ways:

- **Packed**: clusters and nodes packed together, biggest first. This is how a level of a tree is
  shown.
- **Radial**: one item in the middle with its neighbours round it, grouped by edge kind. This is
  how one node's neighbourhood in a graph is shown.

A scene is radial when it sets **`focusId`** to the id of the item to put in the middle. Without
`focusId` it is packed. In a radial scene:

- the **neighbours** are the items joined to the centre by an edge, in either direction. An item
  joined to the centre by no edge is **not drawn**;
- neighbours are **grouped by the `kind`** of the edge that joins them, then ordered by id, and
  placed evenly round the centre, starting at three o'clock and going clockwise;
- the **centre** is drawn at a fixed size and is never entered (it is the scene you are in), so
  its `drillsInto` is ignored; the neighbours are sized against each other;
- an edge's **direction** only matters for drawing: arrowheads point from `sourceId` to
  `targetId`. Edges between two neighbours are drawn (with edges on) but do not affect the layout.

Edges in a packed scene do not affect the layout either, but can be drawn (see `edges` in the
README). A neighbour can drill into its own radial scene, which is how a viewer walks a graph.

## 5. Loading, caching and change

While the viewer zooms towards an item, the explorer loads its scene early and fades it in inside
the item, so it needs to know what is already loaded. **`createSceneSource({ load, parentOf })`**
handles that: it calls `load` once per focus and caches the result (a failed load is not cached,
so it is retried). Its extras:

- `loadStreaming(focus, onUpdate)`: resolve with a first part quickly, then call `onUpdate` with
  fuller scenes as more arrives. The cache keeps the fullest scene seen.
- `source.invalidate(focus?)`: when your data changes, call it (for one focus, or all), and any
  explorer showing this source reloads its scene in place.
- `keyOf(focus)`: needed only when your focus is an object whose key order can vary.

If your data already lives in a cache of its own (a query library, say), implement the
`SceneSource` interface directly instead: `keyOf`, `loadScene`, `isCached` and `parentOf`, plus
the optional `loadSceneStreaming`, `refreshScene` and `subscribeToInvalidation`.

## 6. The accessible outline

The canvas is invisible to assistive technology. Beside it, the explorer renders an **outline**:
the current scene as a list of real links (each item's `href`) and buttons, hidden from sight but
read aloud and reachable by keyboard. Enter on an entry enters that item. This is why every node
needs an `href`: anything the canvas shows must also be reachable as an ordinary link. If your
data has no pages of its own, use stable in-app URLs.

## Events

The explorer tells you what the viewer does:

| Prop | When |
| --- | --- |
| `onSettle(focus)` | The camera came to rest on a scene. Store it and pass it back as `focus`. |
| `onSceneChange({ heading, focus, scene })` | Every scene swap, immediately. Good for a breadcrumb. |
| `onEnter`, `onLeave` | A scene was entered or left, with a `direction`: `"in"`, `"out"` or `"jump"`. |
| `onNodeSelect(node)` | A single click on an item (`null` on empty space). |
| `onNodeHover(node)` | The item under the mouse changed. |
| `onNodeActivate(event)` | A double-click or Enter on an item. `event.preventDefault()` stops the explorer entering it. |
| `onCameraChange`, `onBackgroundClick`, `onTextureError` | See the README. |

The `node` these give you is a **`RenderNode`**: the explorer's own drawing record of your item,
with its `id`, `label`, `href`, `drillable`, `focus` (your `drillsInto`, typed as `unknown`) and
`rawMarks` (your `marks`), as well as its laid-out position and size. To get your own object back,
look it up by `id`.
