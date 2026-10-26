// Import this module only through the dynamic import in custom-grid.tsx, so it stays out of the
// page's first load. It imports PixiJS only as types: its classes come from `draw(kit)`.
import { defineGridTile } from "@data-xplorer/core/pixi";

// One baseplate stud, drawn in white and greys: the grid's `color` tints it, its `alpha` fades it.
export default defineGridTile({
  size: 64,
  draw(kit) {
    const tile = new kit.Container();
    tile.addChild(
      new kit.Graphics().circle(34, 35, 17).fill({ color: 0x000000, alpha: 0.35 }),
      new kit.Graphics().circle(32, 32, 16).fill(0xffffff).stroke({ width: 2, color: 0x7a7a7a }),
    );
    return tile;
  },
});
