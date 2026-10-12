// Custom renderers on the canvas — US071 Step 7 (ADR-016 A25 clauses 2 and 5: one of the files
// allowed to import pixi.js).
//
// One layer of consumer-drawn containers, above the shape sprites and their textures and under the
// rings and labels. The lifecycle, pooling, error isolation and fallbacks are `custom-views.ts`'s;
// this file only attaches PixiJS containers to the stage.

import { Container, type Texture } from "pixi.js";
import type { RenderNode } from "../camera/scene-stack";
import { createViewPools } from "../custom-views";

export function createCustomViews(parent: Container) {
  const layer = new Container();
  parent.addChild(layer);
  return createViewPools<Container, RenderNode, Texture>({
    attach: (view) => layer.addChild(view),
    detach: (view) => layer.removeChild(view),
    show: (view, visible) => {
      view.visible = visible;
    },
  });
}

export type CustomViews = ReturnType<typeof createCustomViews>;
