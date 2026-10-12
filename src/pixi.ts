/**
 * @thirkettle/data-explorer/pixi — for writing custom renderers (US071 Step 7, ADR-016 A25).
 *
 * Import this only from your renderers module, the one you hand the view as
 * `renderers={() => import("./my-renderers")}`. That module, and PixiJS, are then loaded lazily,
 * after the page. Build your views with `pixi.js` (v8) yourself; this entry adds only the
 * contract's types and an identity helper that checks a module against it. The package's main
 * and `./headless` entries never reach this one (asserted by `architecture.test.ts`).
 *
 * @packageDocumentation
 * @module pixi
 */
import type { Container, Texture } from "pixi.js";
import type { RenderNode } from "./camera/scene-stack";
import type { ItemFrame as GenericFrame, ItemRenderer as GenericRenderer } from "./custom-views";

export type { RenderNode };

/** What `update` is given each drawn frame; `texture` is the item's own, cropped to a disc. */
export type ItemFrame = GenericFrame<Texture>;

/** One kind's renderer: `create` a view, `update` it per frame, `destroy` it when released. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ItemRenderer<V extends Container = any> = GenericRenderer<V, RenderNode, Texture>;

/** A renderers module: one renderer per item `kind`. */
export type RendererModule = Record<string, ItemRenderer>;

/** Checks a module against the contract and returns it unchanged: `export default defineRenderers({ … })`. */
export function defineRenderers<M extends RendererModule>(module: M): M {
  return module;
}

/** The scene types a renderer meets on `item`. */
export type * from "./scene/types";
/** The view-type-agnostic forms of `ItemFrame` and `ItemRenderer`, which the two above specialise to PixiJS. */
export type { ItemFrame as GenericItemFrame, ItemRenderer as GenericItemRenderer } from "./custom-views";
