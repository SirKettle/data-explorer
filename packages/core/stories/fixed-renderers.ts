// Loaded only through the dynamic import in FixedLayout.stories.tsx, as a consumer's renderers
// module would be. PixiJS is imported only as types: the classes come from `create(kit)`.
import type { Container, Graphics } from "pixi.js";
import { defineRenderers } from "../src/pixi";

export default defineRenderers({
  // A rectangle filling the item's box exactly: what a fixed scene's items need until the package
  // draws regions itself. Drawn once at 1 × 1, then scaled to the box each frame.
  tile: {
    create(kit) {
      const view: Container = new kit.Container();
      view.addChild(new kit.Graphics().rect(-0.5, -0.5, 1, 1).fill(0xffffff));
      return view;
    },
    update(view, _node, frame) {
      const fill = view.children[0] as Graphics;
      fill.scale.set(frame.width, frame.height);
      fill.tint = frame.tint ?? 0xffffff;
      fill.alpha = frame.hovered || frame.selected ? 1 : 0.82;
    },
    destroy: (view) => view.destroy({ children: true }),
  },
});
