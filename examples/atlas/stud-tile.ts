import { defineGridTile } from "@thirkettle/data-explorer/pixi";

/** A baseplate stud: a raised disc with a light upper-left edge, drawn in white and greys so the
 *  grid's `color` tints it. The atlas's "Grid: studs" button uses it with `zoom: "continuous"`. */
export default defineGridTile({
  size: 64,
  draw(kit) {
    const stud = new kit.Container();
    stud.addChild(
      new kit.Graphics().circle(34, 35, 17).fill({ color: 0x000000, alpha: 0.35 }),
      new kit.Graphics().circle(32, 32, 16).fill(0xffffff).stroke({ width: 2, color: 0x7a7a7a }),
      new kit.Graphics().arc(32, 32, 12, Math.PI, Math.PI * 1.5).stroke({ width: 2.5, color: 0xffffff }),
    );
    return stud;
  },
});
