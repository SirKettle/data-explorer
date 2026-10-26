/**
 * @data-xplorer/core/pixi — for writing custom renderers (US071 Step 7, ADR-016 A25).
 *
 * Import this only from your renderers module, the one you hand the view as
 * `renderers={() => import("./my-renderers")}`. That module, and PixiJS, are then loaded lazily,
 * after the page. Build your views from the classes `create(kit)` hands you (`kit.Container`,
 * `kit.Graphics`, ...), and import from `pixi.js` only as types (`import type`): then PixiJS reaches
 * the page by one lazy path, the package's own. (A second runtime import of `pixi.js`, in your
 * module, made Bun's bundler emit a PixiJS chunk as one app's page entry.) This entry adds only the
 * contract's types and an identity helper that checks a module against it. The package's main
 * and `./headless` entries never reach this one (asserted by `architecture.test.ts`).
 *
 * @packageDocumentation
 * @module pixi
 */
import type { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { RenderNode } from "./camera/scene-stack";
import type { ItemFrame as GenericFrame, ItemRenderer as GenericRenderer } from "./custom-views";

export type { RenderNode };

/** What `update` is given each drawn frame; `texture` is the item's own, cropped to a disc. */
export type ItemFrame = GenericFrame<Texture>;

/** The PixiJS classes a renderer is handed in `create(kit)`, so it need not import `pixi.js` at
 *  runtime. The same classes the package draws with. */
export interface PixiKit {
  /** PixiJS's `Container`: a view's root, grouping its parts. */
  Container: typeof Container;
  /** PixiJS's `Graphics`: shapes drawn in code (`circle`, `roundRect`, `fill`, `stroke`). */
  Graphics: typeof Graphics;
  /** PixiJS's `Sprite`: an image, such as the item's own texture from `frame.texture`. */
  Sprite: typeof Sprite;
  /** PixiJS's `Text`, for text drawn on the canvas (labels are the package's already). */
  Text: typeof Text;
  /** PixiJS's `Texture`, for `Texture.EMPTY` and textures you make. */
  Texture: typeof Texture;
}

/** One kind's renderer: `create` a view (from `kit`), `update` it per frame, `destroy` it when released. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ItemRenderer<V extends Container = any> = GenericRenderer<V, RenderNode, Texture, PixiKit>;

/** A renderers module: one renderer per item `kind`. */
export type RendererModule = Record<string, ItemRenderer>;

/** Checks a module against the contract and returns it unchanged: `export default defineRenderers({ … })`. */
export function defineRenderers<M extends RendererModule>(module: M): M {
  return module;
}

/** A grid tile: the pattern that repeats behind the scene, drawn by you.
 *  `export default defineGridTile({ size: 64, draw(kit) { ... } })` in the module you hand the view as
 *  `background={{ grid: { tile: () => import("./my-grid-tile") } }}`. */
export interface GridTile {
  /** The tile's side in pixels at scale 1. It covers one `step` of the world. */
  size: number;
  /** Draws one tile within `0..size` on both axes. Draw in white or greys: the grid's `color`
   *  tints it, and its `alpha` fades it. Called once, when the tile loads. */
  draw(kit: PixiKit): Container;
}

/** Checks a grid tile against the contract and returns it unchanged. */
export function defineGridTile<T extends GridTile>(tile: T): T {
  return tile;
}

/** The scene types a renderer meets on `item`. */
export type * from "./scene/types";
/** The view-type-agnostic forms of `ItemFrame` and `ItemRenderer`, which the two above specialise to PixiJS. */
export type { ItemFrame as GenericItemFrame, ItemRenderer as GenericItemRenderer } from "./custom-views";
