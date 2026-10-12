# @thirkettle/data-explorer

A continuous, zoomable explorer for tree- and graph-shaped data. You zoom into a group to enter
it, zoom out to leave it, and pan across to its neighbours. It is drawn with PixiJS (WebGL), with
an accessible outline of real links and buttons alongside the canvas.

Nothing in it knows what your data is: you describe your data through a small contract, and the
package handles the camera, gestures, transitions and outline. It started as the visual explorer of
a collectibles catalogue, which is still its first consumer ([history](./docs/history.md)).

```sh
npm install @thirkettle/data-explorer pixi.js react react-dom
```

> **Status:** 0.x. Until 1.0, a **minor** version may break the API, and its CHANGELOG entry says
> how; a patch never does. Peers: React 18 or 19, PixiJS 8.13.2 or later 8.x, Node 20+ for
> tooling. ESM only.

## Examples

[`examples/`](./examples/) has four runnable apps (a file tree, a module dependency graph, a
streaming atlas, and a solar system) and a stress page for measuring draw cost. Run
`bun run examples` in this package and open http://localhost:3070. It also starts a second origin
on the next port (3071), which serves an image with no CORS header for the solar system.

Every option is used by at least one example:

| Option | Example |
| --- | --- |
| `palette`, `ramp` | atlas (light/dark re-tint, a custom ramp), file tree (ramp by age) |
| item `color` | file tree ("Colour by type": hex, `rgb()` and `hsl()` strings) |
| `background` (colour, gradient, image, grid) | atlas (backdrop and grid buttons), solar system (tiled starfield, grid off) |
| `effects` (grow-in, halo, rings) | atlas (halo toggle) |
| item `effects`, `effects.glow`/`pulse` | atlas (visited countries pulse; "Visited: pulse / still glow / ring only"), solar system (the Sun) |
| `edges` | module graph (every scene, styled per kind, with a toggle), solar system (orbits), stress |
| item `texture`, `textures`, `onTextureError` | solar system (planet faces; Pluto's from the no-CORS origin), stress (`textures=1`) |
| item `kind`, `renderers`, `customViews` | solar system (night sides, Saturn's shimmering rings), stress (`custom=1`) |
| `onNodeSelect`, `onNodeHover`, `onNodeActivate`, `onEnter`, `onLeave`, `onCameraChange`, `onBackgroundClick` | module graph (live event log; "Double-click: open details") |
| `subscribeToInvalidation`, `refreshScene` | atlas (mark visited), file tree (colour mode) |
| `loadSceneStreaming` | atlas |

## How it works

You give the explorer a **scene source**, which can:

1. load the **scene** for a **focus** (a focus is any value you choose; `null` means the root);
2. say which item in a scene **drills into** which focus;
3. say where **zooming out** of a focus leads.

A scene is either:

- **packed**: clusters and nodes laid out together. This is how a tree level is shown.
- **radial**: one focused item with its neighbours around it, joined by typed edges. This is how a
  graph neighbourhood is shown.

A scene is radial when it sets `focusId`. Its neighbours are the items joined to the centre by an
edge (either direction), grouped by edge `kind`; an item joined by no edge is not drawn, and the
centre itself is never entered. [Concepts](./docs/concepts.md#4-packed-and-radial-scenes) has the
full rules.

The explorer keeps a stack of the scenes the viewer has entered and never walks your data itself.
That makes cycles safe: a graph with A → B → C → A costs only as many scenes as the viewer
actually visits, and each one loads once.

## Example: a file tree

```tsx
import { createSceneSource, DataExplorer, type ExplorerScene } from "@thirkettle/data-explorer";

type Path = string; // the focus: a folder path

const source = createSceneSource<Path>({
  async load(path) {
    const folder = await listFolder(path ?? "/"); // your own data access
    return {
      id: path ?? "/",
      heading: folder.name,
      clusters: folder.subfolders.map((sub) => ({
        id: sub.name,
        label: sub.name,
        weight: sub.fileCount, // a count the viewer can read, never a made-up score
        marks: [],
        href: `/files${sub.path}`, // the item's own page: required, see Accessibility
        drillsInto: sub.path, // zooming into this cluster opens this folder
        shape: "cloud",
        truncated: null,
      })),
      nodes: folder.files.map((file) => ({
        id: file.name,
        label: file.name,
        weight: file.size,
        marks: [],
        href: `/files${file.path}`,
        drillsInto: null, // a file has nothing inside it
        shape: "disc",
      })),
      edges: [],
    } satisfies ExplorerScene<Path>;
  },

  // Zooming out of a folder lands on that folder's own cluster in its parent.
  parentOf(path) {
    const parent = parentPath(path);
    return { kind: "anchored", focus: parent === "/" ? null : parent, anchorId: baseName(path) };
  },
});

<DataExplorer source={source} focus={currentPath} onSettle={(path) => navigate(path)} />;
```

## The contract

### `createSceneSource(options)`

Builds a `SceneSource` that caches each scene, which is what most consumers need:

| Option | Required | Purpose |
| --- | --- | --- |
| `load(focus)` | yes | The scene for a focus (`null` is the top), or a promise of it. Called once per focus; a failed load is not cached. |
| `parentOf(focus, current)` | no | Where zooming out leads (see below). Without it, nothing is above. |
| `keyOf(focus)` | no | A stable string per focus. Defaults to `"root"` for `null`, the string itself, `String()` for a number, or `JSON.stringify` for anything else. |
| `loadStreaming(focus, onUpdate)` | no | Resolve with a first part at once, then report fuller scenes. The cache keeps the fullest seen. |

The source it returns also has **`invalidate(focus?)`**: call it when your data changes, and any
explorer showing it reloads the scene on screen in place.

Implement `SceneSource` yourself only when your scenes are cached elsewhere (a query library, say).

### `SceneSource<F>`

| Member | Required | Purpose |
| --- | --- | --- |
| `keyOf(focus)` | yes | A stable cache key; `"root"` for `null`. Two foci with the same key are the same scene. |
| `loadScene(focus)` | yes | The scene for a focus. |
| `isCached(focus)` | yes | Whether `loadScene` would resolve from cache, without loading. |
| `parentOf(focus, current)` | yes | Where zooming out leads: see below. A rejection leaves the camera where it is. |
| `loadSceneStreaming(focus, onUpdate)` | no | Resolve with the first page, then report fuller scenes. Without it, the explorer waits for `loadScene`. |
| `refreshScene(focus)` | no | Reload a scene whose data changed. Without it, `loadScene` is used. |
| `subscribeToInvalidation(onChange)` | no | Tell the explorer to refresh what is on screen. Returns an unsubscribe function. |

`parentOf` returns one of:

- `{ kind: "anchored", focus, anchorId }`: the parent scene has an item (`anchorId`) that stands
  for this one, so zooming out continues smoothly from that item's box;
- `{ kind: "unanchored", focus }`: there is a parent but no single item in it, so the explorer
  swaps to it directly (use this for a node in a cycle, or with many parents);
- `{ kind: "none" }`: there is nothing above.

For a node with several parents (a DAG), choose one. Leaving a scene the viewer entered always goes
back the way they came, whatever `parentOf` says.

### Scene items

Clusters and nodes share these fields:

| Field | Meaning |
| --- | --- |
| `id`, `label`, `sublabel?` | Identity and text. |
| `weight` | Drives size, against the other items in the same list (nodes against nodes, clusters against clusters; clusters are always at least twice the largest node). Use a count the viewer could read as text. |
| `marks` | Display text (badges), shown in the outline. Never parsed. |
| `href` | The item's own page (`null` allowed only for an aggregate cluster). |
| `drillsInto` | The focus this item opens, or `null`. |
| `shape` | `"cloud"` (a soft container), `"disc"` or `"square"`. |
| `ramp?` | A `[0, 1]` position on the colour ramp, or `null` for a stable per-id colour. |
| `color?` | The item's own colour, a number or CSS string (see [Colours](#colours)). Wins over `ramp`. |
| `effects?` | `"glow"` and/or `"pulse"` (see [Glow and pulse](#glow-and-pulse)). |
| `texture?` | `{ url, fit?: "cover" \| "contain" }`: an image drawn inside a `disc` or `square` item (see [Textures](#textures)). |
| `kind?` | Selects a custom renderer for this item (see [Custom renderers](#custom-renderers)). |
| `emphasis?` | `["ring"]` draws a shape-matched outline and halo. |
| `image?` | Shown in DOM views only, never drawn on the canvas. |

A cluster also has `truncated`. It is `null` when nothing was left out, or `{ shown, total }` for
an honest "Other" aggregate. Use `windowed(items, limit)` to produce both, and add the aggregate
cluster yourself with `href: null` and `drillsInto: null`. Aggregates are drawn hollow and are
never drillable.

## Props of `DataExplorer`

| Prop | Purpose |
| --- | --- |
| `source` | Your `SceneSource`. Pass a new one to start over with an empty cache. |
| `focus` | The current focus, usually from the URL. A change jumps there. |
| `onSettle(focus)` | Called once the camera settles on a new scene, at most once per burst of motion. Update your URL here. |
| `onSceneChange?({ heading, focus, scene })` | Called on every scene swap, immediately, including a scene filling in as it streams. Good for a breadcrumb. |
| `onNodeSelect?(node)` | A confirmed single click on a node, or `null` when the selection clears. |
| `onNodeHover?`, `onNodeActivate?`, `onEnter?`, `onLeave?`, `onCameraChange?`, `onBackgroundClick?` | See [Events](#events). |
| `palette?` | Canvas colours as `0xRRGGBB` numbers (`ExplorerPalette`). Pass a new object to re-tint live. Defaults to `FALLBACK_PALETTE`. |
| `ramp?` | The colour ramp for `ramp` positions (`RampColours`). Read once, at mount. Defaults to `DEFAULT_RAMP`. |
| `background?` | The background behind the scene (`ExplorerBackground`). See [Options](#options). Changes apply live. |
| `effects?` | Built-in effects switched on or off (`ExplorerEffects`). See [Options](#options). Changes apply live. |
| `edges?` | Draw the scene's edges, styled per `kind` (`ExplorerEdges`). Off by default. See [Edges](#edges). |
| `textures?` | `{ minDiameterPx?, budget? }` for item images. See [Textures](#textures). |
| `onTextureError?({ url })` | An item image could not be loaded or drawn; once per URL. |
| `renderers?` | `() => import("./my-renderers")`: custom renderers by item `kind`, loaded lazily. See [Custom renderers](#custom-renderers). |
| `customViews?` | `{ max? }`: how many items custom renderers draw at once. |
| `renderLoading?`, `renderError?`, `renderCanvasUnavailable?` | Your own loading, error and "the canvas could not start" UI. Plain defaults are provided. |
| `stats?` | Shows a small overlay of draw time, frame rate and pool sizes. Read once, at mount. The package never reads the page URL: the examples pass `?stats=1` through to it. |

## Options

Options are grouped, partial and live. Leave one out and you get exactly what the explorer drew
before it had options. Pass a new value and the canvas updates in place, with no new scene and no
camera reset. Values are compared by content, so an inline `effects={{ halo: false }}` costs
nothing on re-render.

```tsx
<DataExplorer
  source={source}
  focus={focus}
  onSettle={setFocus}
  background={{ grid: false }} // or { alpha: 0.4 } to restyle it
  effects={{ growIn: false, halo: false }}
/>
```

| Option | Default | Effect |
| --- | --- | --- |
| `background.color` | `palette.background` | A solid colour behind everything. |
| `background.gradient` | none | `{ from, to, angle? }`: a linear gradient across the view. `angle` is in degrees as in CSS: 180 (the default) runs top to bottom, 90 left to right. |
| `background.image` | none | A URL, or `{ url, fit?: "cover" \| "tile", alpha? }`. Fixed to the view, above the gradient. See the CORS note below. |
| `background.grid` | `true` (alpha 0.22, colour `palette.grid`) | `false` hides the dot grid. `{ alpha, color }` restyles it. |
| `effects.growIn` | `true` | A node grows from a dot to its size the first time it is drawn. |
| `effects.halo` | `true` | The soft glow behind an item with the `ring` emphasis. The ring itself always draws, since it carries meaning. |
| `effects.hoverRing` | `true` | The ring around the hovered item. Its label still shows. |
| `effects.selectionRing` | `true` | The ring around the selected item. `onNodeSelect` still fires. |
| `effects.glow` | `true` | Glows on items that ask for `glow` or `pulse`. Off, none of them glow. |
| `effects.pulse` | `true` | Whether a `pulse` breathes. Off, it holds as a still glow. |

### Glow and pulse

An item asks for an effect with `effects: ["glow"]` or `effects: ["pulse"]`: a soft light in the
item's own colour behind it, which a pulse makes breathe, each item on its own phase. The view's
`effects` switch them globally, so one request can show three ways (the atlas example cycles
them). A non-navigable aggregate never glows.

Nothing animates on a timer. A pulse asks for the next frame only while one is drawn on screen;
with none in view, or none at all, the canvas draws nothing at rest, as before. Under
`prefers-reduced-motion`, a pulse holds still and items appear at their size without growing in.
The stats overlay's `draws` count stops climbing whenever nothing is moving.

### Colours

Anywhere a colour is accepted (`background`, an item's `color`), you can pass a `0xRRGGBB` number
or a CSS string: `#rrggbb`, `#rgb`, `rgb()`/`rgba()` or `hsl()`/`hsla()`, with commas or spaces.
Alpha is ignored, because the explorer sets transparency per layer. Named colours (`"tomato"`)
are not supported. A value that does not parse is ignored, as if it had not been set.
`parseColour` is exported if you want to check a value yourself.

An item's own `color` wins over its `ramp` position, which wins over the stable per-id tint. A
non-navigable aggregate keeps the palette's `aggregate` colour, so it never looks like an item.

### Images on the canvas need CORS

A background image is drawn into the WebGL canvas, and a browser lets a canvas draw only pixels
the page is allowed to read. Serve the image from the same origin, or from a host that sends
`Access-Control-Allow-Origin`. The explorer requests it with `crossOrigin = "anonymous"`. If it
does not load, it is left out and a single warning is logged. Showing an image in your own DOM
(a detail panel) has no such limit.

`resolveOptions(options)` returns the full resolved value (`ResolvedOptions`), defaults included,
for tests and tooling. The atlas example cycles plain, gradient and image backdrops and toggles the
grid and the halo live. The file-tree example switches between colouring files by age (`ramp`)
and by type (`color`).

## Textures

An item can carry an image: `texture: { url, fit? }`. Once the item is at least
`textures.minDiameterPx` across on screen (default 48), the image is loaded and drawn inside its
`disc` or `square`, cropped to the shape: `cover` (the default) fills it, `contain` fits the whole
image. Until it loads, below that size, and if it fails, the plain shape shows. A `cloud` keeps
its nebula and ignores `texture`.

```tsx
const planet: ExplorerNode<string> = {
  ...rest,
  shape: "disc",
  texture: { url: "/textures/mars.svg" }, // same origin, or a host that sends CORS headers
};

<DataExplorer {...props} textures={{ minDiameterPx: 32 }} onTextureError={({ url }) => report(url)} />
```

**CORS.** The image is drawn into the WebGL canvas, so it must come from the same origin or from
a host that sends `Access-Control-Allow-Origin`; it is requested with `crossOrigin = "anonymous"`.
Anything else fails, the item keeps its shape, and `onTextureError` fires once for that URL. The
solar-system example serves Pluto's image from a second origin with no CORS header to show it.

**Memory.** Each image is cropped once into a 256 px square (256 KB of GPU memory). At most
`textures.budget` (default 128, so 32 MB) are held or loading at once; the least recently drawn
go first. Images drawn in the current frame are never evicted, so a view needing more than the
budget draws the rest as plain shapes instead of reloading them every frame. Measured: panning
across 1,000 textured items with a budget of 64, the held count peaked at exactly 64.

## Custom renderers

When the built-in shapes are not enough, draw an item yourself with PixiJS v8. Give the item a
`kind`, and hand the view a module of renderers keyed by kind, loaded lazily:

```tsx
<DataExplorer {...props} renderers={() => import("./planet-renderers")} />
```

```ts
// planet-renderers.ts: import this module only through the dynamic import above.
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { defineRenderers } from "@thirkettle/data-explorer/pixi";

export default defineRenderers({
  planet: {
    create() {
      // One view, reused for whichever item it is given next. Draw at a fixed design size.
      const view = new Container();
      view.addChild(new Graphics().circle(0, 0, 50).fill(0xffffff), new Sprite(Texture.EMPTY));
      return view;
    },
    update(view, item, frame) {
      view.scale.set(frame.size / 100); // the package has already placed and faded it
      (view.children[0] as Graphics).tint = frame.tint ?? 0x888888;
      (view.children[1] as Sprite).texture = frame.texture ?? Texture.EMPTY;
    },
    destroy: (view) => view.destroy({ children: true }),
  },
});
```

- **The frame** gives `size` (world units: draw centred on 0, 0), `screenSize` (pixels, for level
  of detail), `opacity`, `hovered`, `selected`, `timeMs`, `tint` (the colour the item would have
  had), `texture` (the item's own, cropped to a disc, once ready) and `reducedMotion`. The package
  positions each view at its item and applies `opacity`.
- **The package still does** culling, transitions, hit-testing (by the item's box), the outline,
  rings, halos, glows and labels. A custom view replaces only the shape and its texture.
- **Pooling:** views are pooled per kind and reused, hidden when off screen, and destroyed only
  when a pool has many spares or the explorer unmounts. Keep per-item state in `update`.
- **Animation:** set `animated: true` to be given frames while a view of that kind is on screen.
  Under `prefers-reduced-motion` no frames are asked for, and `frame.reducedMotion` is true.
- **Failures:** a kind with no renderer, and a renderer that throws, fall back to the item's
  `shape`, each reported once; a renderer that throws is switched off for the session. A module
  that fails to load leaves every item as its shape. The package isolates *throws*, not drawing
  mistakes: a renderer that draws something wrong (a degenerate polygon blacked out the whole
  canvas while the example was being written) can still spoil the frame.
- **Stacking:** custom views sit in one layer above every plain shape and below rings and labels.
- **Cap:** at most `customViews.max` items (default 200) are drawn by renderers at once; past it,
  the ones furthest from the middle of the view draw their shape. Measured on desktop Chrome
  (`stress?custom=1`, a three-`Graphics` view): 1,000 plain items 1.6 ms; 50 custom views 1.9
  ms; 200, 3.4 ms; 1,000, 6.0 ms; 1,000 items under the default cap, 2.9 ms.
- **`@thirkettle/data-explorer/pixi`** holds only the contract's types and `defineRenderers`. It
  never loads PixiJS itself, and the main and `./headless` entries never reach it. Only your
  renderers module should import it, so that it and PixiJS stay out of your page's first load.
  The examples' `bun run check:bundle` builds the solar system and checks exactly that.

## Edges

A scene's `edges` always shape a radial scene's layout. With `edges={{ visible: true }}` they are
also drawn, in packed and radial scenes alike: under the items, fading with them through every
transition, and culled off screen. An edge naming an item that is not in the scene is skipped.

```tsx
<DataExplorer
  {...props}
  edges={{
    visible: true,
    style: { width: 1.5, alpha: 0.5 }, // every edge starts from this
    styles: {
      imports: { arrow: "end" },
      "imported-by": { dash: [5, 4], curve: 0.15 },
    },
  }}
/>
```

| Style | Default | Effect |
| --- | --- | --- |
| `color` | `palette.label` | Any [colour](#colours). |
| `width` | `1.5` | Screen pixels, whatever the zoom. |
| `alpha` | `0.5` | Multiplied by the lower opacity of the edge's two items. |
| `dash` | `null` | `[dash, gap]` in screen pixels, or `null` for solid. |
| `arrow` | `"none"` | `"start"`, `"end"` or `"both"`. |
| `curve` | `0` | Bows the edge sideways by this fraction of its length (−1 to 1). Edges both ways between one pair, with the same curve, part. |

**Every drawn edge is also in the outline**, as a link to its far end (the end that is not the
scene's focus), so a relationship that can be seen can also be followed from the keyboard and by
a screen reader. That is why `href` is required on every item.

**Cap.** A scene draws at most `edges.max` edges (default 500). Over it, edges to the scene's
`focusId` come first, then the rest in order, and the outline says "Showing N of M
relationships". Measured on desktop Chrome with 1,000 items (the `stress` example):

| Edges | Style | Draw time (avg) |
| --- | --- | --- |
| 0 | none | 2.1 ms |
| 500 | straight | 2.3 ms |
| 2,000 | straight | 2.9 ms |
| 2,000 | curved | 5.4 ms |
| 2,000 | arrows | 3.7 ms |
| 2,000 | dashed | 18.0 ms |
| 500 | curved, dashed, arrows | 7.0 ms |
| 1,000 | curved, dashed, arrows | 11.2 ms |

Dashes are the expensive style, because each dash is its own piece of geometry. Only the stretch
of an edge on screen is dashed, which helps when zoomed in but not when a whole dense scene fits
the view. A phone is several times slower than this desktop, so raise `max` with care.

## Events

Every payload is plain data: scene items, headings, foci and numbers, never a PixiJS object.

| Event | Fires | Payload |
| --- | --- | --- |
| `onNodeSelect` | A confirmed single click or tap on an item, or `null` on empty space. | the item, or `null` |
| `onNodeHover` | The item under the mouse changes. Mouse only. | the item, or `null` |
| `onNodeActivate` | A double-click or double-tap on an item, or Enter on its outline entry. | `{ node, source: "pointer" \| "keyboard", preventDefault() }` |
| `onLeave` | The viewer left a scene, by any route. | `{ heading, focus, scene, direction }` |
| `onEnter` | The viewer arrived at a scene, right after the `onLeave` for the one left. | `{ heading, focus, scene, direction }` |
| `onCameraChange` | The camera moved: at most once per drawn frame, and only while the canvas is up. | `{ x, y, scale }` |
| `onBackgroundClick` | A confirmed single click or tap on empty space. | `{ screen: { x, y }, world: { x, y } }` |

`direction` is `"in"` (entering an item), `"out"` (zooming out to a parent) or `"jump"` (a
`focus` change from outside, such as Back/Forward). A sideways move to a neighbour is a leave to
the parent and then an enter, so it fires both pairs. A scene filling in as its pages stream, or
refreshing after a write, is not a navigation and fires nothing.

`onNodeActivate` is cancellable. The default action enters the item if it can be entered and,
for a pointer, otherwise zooms in at that point. Call `preventDefault()` to do something else:

```tsx
<DataExplorer
  {...props}
  onNodeActivate={(event) => {
    if (!wantsDetails) return; // let the explorer enter it
    event.preventDefault();
    openDetails(event.node);
  }}
/>
```

The module-graph example logs every event and has a toggle that turns activation into "open
details".

## Performance

Measured on desktop Chrome (Apple silicon), canvas 1102 × 631 at a device pixel ratio of 2, with
the stats overlay (`?stats=1`): the rolling average draw time over 300 small zoom steps. The
stress page holds 1,000 items; "everything" is 500 edges, a texture per item and custom renderers
on every item (so 200 custom views under the default cap, and 800 plain shapes).

| Scene | Fit to view | Zoomed in about 6× |
| --- | --- | --- |
| 1,000 plain items (the baseline) | 1.65 ms | 1.41 ms |
| 1,000 items, everything | 3.39 ms | 2.71 ms (402 edges, 128 textures held) |

The defaults are set from the per-feature measurements in [Edges](#edges) and
[Custom renderers](#custom-renderers): at most 500 edges, 200 custom views and 128 textures (32 MB)
at once. They were measured on a desktop; a phone is several times slower, so check yours before
raising them. At rest, nothing is drawn: only a pulse, an `animated` renderer or a transition on
screen asks for frames.

## Styling

The explorer needs no stylesheet. It sets inline only what it cannot work without: the canvas
fills its container's width, owns its touch gestures, and the outline is visually hidden but read
aloud. If nothing gives the canvas a height, it takes 480 px.

To style it, target these classes: your rules win, because the inline styles only set what the
explorer needs, at the values a styled page would use anyway.

- `.data-explorer`: the view's wrapper;
- `.data-explorer__surface`: the canvas host. Give it a height (or give its container one);
  borders, background and cursor are yours to choose;
- `.visually-hidden`: on the outline, which is already hidden inline.

## Accessibility

The canvas is `aria-hidden`. Next to it, the outline renders the current scene as real links (an
item's `href`) and buttons (an aggregate). From the keyboard, Enter on an outline entry enters that
item (raising `onNodeActivate` first, exactly as a double-click does), and focus moves to the new
scene with a polite announcement. That is why `href` is required
on every node: every relationship you draw must also be reachable as an ordinary link. If your data
has no pages of its own, use a stable in-app URL. If WebGL is unavailable, the canvas is skipped
and the outline still works.

## Headless use

`@thirkettle/data-explorer/headless` drives the explorer without a canvas, for tests and tooling.
Nothing in it imports PixiJS, and it needs no DOM.

**`createTestStack(source, options?)`** is the place to start. It loads the first scene and
returns a stack that navigates the way the explorer does, with every move un-animated, so it runs
in `bun test`, Vitest or Node with no `requestAnimationFrame`:

```ts
import { createTestStack } from "@thirkettle/data-explorer/headless";

test("a folder opens, and zooming out comes back", async () => {
  const explorer = await createTestStack(source); // or { focus: "src/lib" } to start deep
  expect(explorer.current.heading).toBe("my-app");

  await explorer.enter("src"); // the item's id in the current scene, as a double-click would
  expect(explorer.current.focus).toBe("src");
  expect(explorer.breadcrumb()).toEqual(["my-app", "src"]);

  await explorer.zoomOut(); // back the way it came; at the start, asks your parentOf
  expect(explorer.current.focus).toBeNull();
});
```

| Member | Does |
| --- | --- |
| `current` | The scene the viewer is in: `focus`, `heading`, the `scene` your source returned, and `renderNodes` (each item as laid out, with `x`, `y` and `size`). |
| `depth` | How many scenes deep the viewer is from where they started. |
| `enter(itemId)` | Enters that item. A non-drillable item, or a failed load, leaves the stack where it was. |
| `zoomOut()` | Leaves the way it came in; at the starting scene, follows your `parentOf`. |
| `enterSibling(itemId)`, `jumpTo(focus)` | Moves sideways, or jumps as a deep link would. |
| `breadcrumb()` | The headings from the start to here. |
| `stack`, `rig` | The underlying scene stack and camera, for anything else. Their own `enter` animates by default, so pass `{ approach: false }` in a test. |

Also exported: `createSceneStack` and `CameraRig` (what `createTestStack` is built from), and
`appearanceFor`, the colour and shape choice the canvas makes for each item.

## Development

```sh
bun install
bun test               # the package's own tests
bun run typecheck
bun run examples       # the examples, at http://localhost:3070
```

See [CONTRIBUTING](./CONTRIBUTING.md) for the full loop, including working on the package inside an
app with `bun link`.

`src/architecture.test.ts` enforces the boundary:

- no consumer imports;
- `pixi.js` only in the files it names (`renderer-pixi/renderer.ts`, `edges.ts`, `textures.ts`,
  `custom.ts`), and in `src/pixi.ts` only as types;
- nothing in the package imports the `./pixi` entry;
- the renderer reached only through the view's one dynamic import;
- `scene/` self-contained;
- no consumer-domain vocabulary in code or strings.

## Building and releasing

`bun run build` writes `dist/`: one ESM file per entry plus shared chunks (the PixiJS renderer stays
a lazily loaded chunk) and one rolled-up `.d.ts` per entry. The build **fails** if the public API
differs from `api/*.api.md`: run `bun run api:report` and commit the change when it is meant. The
API report is the public contract.

| Check | What it proves |
| --- | --- |
| `bun run lint:package` | `publint` and `@arethetypeswrong/cli` (ESM-only profile) pass on the build. |
| `bun run check:size` | Each entry, and the renderer loaded on first mount, stays within its gzipped budget. |
| `bun run check:bundle --built` | The built package keeps PixiJS and a renderers module out of what a page loads up front. |
| `bun run check:consumer <react> <pixi.js>` | The packed tarball installs into a fresh npm project, type-checks under `bundler` and `node16` resolution, server-renders and navigates under Node. CI runs React 18 and 19 against PixiJS 8.13.2 and the latest 8. |

Releases are made by [release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org/) on `main`, and published from CI only,
with npm provenance. See [CONTRIBUTING](./CONTRIBUTING.md#releasing).

## Licence

MIT. See [LICENSE](./LICENSE).
