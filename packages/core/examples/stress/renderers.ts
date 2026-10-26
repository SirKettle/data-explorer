import { Container, Graphics } from "pixi.js";
import { defineRenderers } from "@data-xplorer/core/pixi";

/**
 * A custom renderer of typical weight for measuring (US071 Step 7): three Graphics per view (a
 * tinted body, a rim and a highlight), updated every frame. Loaded lazily by the stress page.
 */
interface DotView extends Container {
  body: Graphics;
}

export default defineRenderers({
  dot: {
    create() {
      const view = new Container() as DotView;
      view.body = new Graphics().circle(0, 0, 50).fill(0xffffff);
      const rim = new Graphics().circle(0, 0, 46).stroke({ color: 0x000000, alpha: 0.35, width: 6 });
      const highlight = new Graphics().circle(-16, -16, 14).fill({ color: 0xffffff, alpha: 0.4 });
      view.addChild(view.body, rim, highlight);
      return view;
    },
    update(view: DotView, _item, frame) {
      view.scale.set(frame.size / 100);
      view.body.tint = frame.tint ?? 0x888888;
    },
    destroy: (view: DotView) => view.destroy({ children: true }),
  },
});
