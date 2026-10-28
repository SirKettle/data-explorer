import { defineGridTile } from "@data-xplorer/core/pixi";

/** One baseplate stud, the same shape as a brick's (`lego-renderers.ts`): a shadow, a face in a
 *  mid grey so the grid's colour tints it a little darker than its highlight, a rim, and the light
 *  on its upper left in white. The page sets the grid's `step` to one stud of the current scene. */
const SIZE = 64;
const R = SIZE * 0.3;

export default defineGridTile({
  size: SIZE,
  draw(kit) {
    const c = SIZE / 2;
    const stud = new kit.Container();
    stud.addChild(
      new kit.Graphics().circle(c + SIZE * 0.04, c + SIZE * 0.06, R).fill({ color: 0x000000, alpha: 0.45 }),
      new kit.Graphics().circle(c, c, R).fill(0xb4b4b4).stroke({ width: SIZE * 0.04, color: 0x707070 }),
      new kit.Graphics().arc(c, c, R - SIZE * 0.06, Math.PI * 1.05, Math.PI * 1.45).stroke({ width: SIZE * 0.05, color: 0xffffff }),
    );
    return stud;
  },
});
