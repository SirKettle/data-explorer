// Import this module only through the dynamic import in custom-renderers.tsx, so it and PixiJS
// stay out of the page's first load.
import { Container, Graphics } from "pixi.js";
import { defineRenderers } from "@thirkettle/data-explorer/pixi";

const PETALS = 6;

export default defineRenderers({
  flower: {
    // One view, reused for whichever item it is given next: draw at a fixed design size of 100.
    create() {
      const view = new Container();
      const petals = new Graphics();
      for (let i = 0; i < PETALS; i++) {
        const a = (i / PETALS) * Math.PI * 2;
        petals.ellipse(Math.cos(a) * 26, Math.sin(a) * 26, 22, 22).fill(0xffffff);
      }
      view.addChild(petals, new Graphics().circle(0, 0, 16).fill(0xfacc15));
      return view;
    },
    // Each frame: scale to the item's size, tint with its colour, turn slowly.
    update(view, node, frame) {
      view.scale.set(frame.size / 100);
      view.children[0]!.tint = frame.tint ?? 0xffffff;
      view.rotation = frame.reducedMotion ? 0 : (frame.timeMs / 4000 + node.x) % (Math.PI * 2);
    },
    destroy: (view) => view.destroy({ children: true }),
    animated: true, // ask for frames while a flower is on screen
  },
});
