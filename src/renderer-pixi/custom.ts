// Custom renderers on the canvas — US071 Step 7 (ADR-016 A25 clauses 2 and 5: one of the files
// allowed to import pixi.js).
//
// Consumer-drawn containers, attached to the renderer's item layer beside the shape sprites and
// textures, so each view stacks with its own scene layer rather than above every shape (issue #5).
// The lifecycle, pooling, error isolation and fallbacks are `custom-views.ts`'s; this file only
// attaches PixiJS containers to the stage.

import { Container, type Texture } from "pixi.js";
import type { RenderNode } from "../camera/scene-stack";
import { createViewPools } from "../custom-views";

/** `layer` is the renderer's item layer: it sorts by `zIndex`, which the renderer sets on each view
 *  as it places it (see `itemZ`). */
export function createCustomViews(layer: Container) {
  return createViewPools<Container, RenderNode, Texture>({
    attach: (view) => layer.addChild(view),
    detach: (view) => layer.removeChild(view),
    show: (view, visible) => {
      view.visible = visible;
    },
  });
}

export type CustomViews = ReturnType<typeof createCustomViews>;

/**
 * Where an item's pieces sit in the item layer. Items are drawn in stacking order, scene layer by
 * scene layer (the scene being entered beneath, then the current one, then the one being left), so
 * the `n`th item drawn in a frame stacks above every item before it: its body (a shape sprite or a
 * custom view) at `2n`, and its texture just above that, at `2n + 1`.
 */
export function itemZ(drawOrder: number, part: "body" | "texture"): number {
  return drawOrder * 2 + (part === "texture" ? 1 : 0);
}
