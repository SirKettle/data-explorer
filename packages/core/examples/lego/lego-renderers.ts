// Loaded only through `renderers={() => import("./lego-renderers")}`. PixiJS is imported as types
// only: the classes come from `create(kit)`.
import type { Container, Graphics, GraphicsContext, Texture } from "pixi.js";
import { defineRenderers, type ItemFrame, type PixiKit, type RenderNode } from "@data-xplorer/core/pixi";
import type { LegoItemData } from "./source";

/**
 * A set as a brick seen from above, and a theme as a plate. Both are drawn in studs, centred
 * on (0, 0), and the view is scaled by the world units in a stud, so a stud is the same size on
 * every brick and on the baseplate's grid behind them.
 *
 * Drawing is in white and greys, tinted per item, apart from the shadows and the light catching
 * each stud, which are separate and never tinted. The geometry depends only on a footprint, so it
 * is drawn once per footprint into a shared `GraphicsContext` and every view of that size reuses
 * it: a scene of a thousand bricks has a dozen footprints.
 */

/** Below this many pixels a stud is a smudge: the brick is drawn flat. */
const STUD_PX = 5;
/** Below this, the light on each stud is left off. */
const HIGHLIGHT_PX = 10;
/** A stud's radius, in studs: LEGO's 4.8 mm stud on its 8 mm pitch. */
const STUD_R = 0.3;
/** Each brick stops short of its neighbours by this much on every side, so a seam shows. */
const INSET = 0.04;

const EDGE = { color: 0x000000, alpha: 0.28 };

const studsOf = (node: RenderNode) => (node.item.data as LegoItemData | undefined)?.studs ?? { w: 1, h: 1 };

/** Pixels per stud this frame. `frame.width` is the box's width in world units. */
const pxPerStud = (frame: ItemFrame, w: number) => ((frame.width / w) * frame.screenSize) / frame.size;

/** Shared contexts, by footprint and part. */
const contexts = new Map<string, GraphicsContext>();
/** The classes from the first `create(kit)`: `update` draws a footprint it has not met yet. */
let pixi: PixiKit;

function context(key: string, draw: (g: Graphics) => void): GraphicsContext {
  let ctx = contexts.get(key);
  if (!ctx) {
    const g = new pixi.Graphics();
    draw(g);
    ctx = g.context;
    contexts.set(key, ctx);
  }
  return ctx;
}

/** The stud textures' side in pixels: one stud. */
const TILE = 64;

/** One stud, drawn on a canvas, `part` of it: what the plate tints (`studs`), or the light on it. */
function studCanvas(part: "studs" | "light"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE;
  const g = canvas.getContext("2d")!;
  const [c, r] = [TILE / 2, TILE * STUD_R];
  const circle = (x: number, y: number, radius: number) => {
    g.beginPath();
    g.arc(x, y, radius, 0, Math.PI * 2);
  };
  if (part === "studs") {
    circle(c + TILE * 0.04, c + TILE * 0.06, r);
    g.fillStyle = "rgba(0, 0, 0, 0.3)";
    g.fill();
    circle(c, c, r);
    g.fillStyle = "#fff";
    g.fill();
    g.lineWidth = TILE * 0.04;
    g.strokeStyle = "rgba(0, 0, 0, 0.28)";
    g.stroke();
  } else {
    g.beginPath();
    g.arc(c, c, r - TILE * 0.06, Math.PI * 1.05, Math.PI * 1.45);
    g.lineWidth = TILE * 0.05;
    g.strokeStyle = "rgba(255, 255, 255, 0.65)";
    g.stroke();
  }
  return canvas;
}

const studTextures = new Map<"studs" | "light", Texture>();
function studTexture(part: "studs" | "light"): Texture {
  let texture = studTextures.get(part);
  if (!texture) {
    texture = pixi.Texture.from(studCanvas(part));
    // Mipmaps, so a plate of small studs averages out rather than shimmering as it moves.
    texture.source.autoGenerateMipmaps = true;
    studTextures.set(part, texture);
  }
  return texture;
}

/**
 * A `w` × `h` footprint's studs (or the light on them) on `layer`: one rectangle filled with the
 * one-stud texture, repeating. It is drawn in the texture's pixels from (0, 0), so the texture
 * tiles once per stud from the footprint's corner, then scaled down to studs. Circles drawn in
 * stud units came out as hexagons: PixiJS picks a circle's segments by its radius, and 0.3 is few.
 */
function tileStuds(layer: Graphics, part: "studs" | "light", w: number, h: number) {
  layer.context = context(`${part}:${w}x${h}`, (g) => g.rect(0, 0, w * TILE, h * TILE).fill({ texture: studTexture(part), textureSpace: "global" }));
  layer.position.set(-w / 2, -h / 2);
  layer.scale.set(1 / TILE);
}

interface BrickView extends Container {
  shadow: Graphics;
  body: Graphics;
  studs: Graphics;
  light: Graphics;
  footprint: string;
}

const brick = {
  create(kit: PixiKit): BrickView {
    pixi = kit;
    const view = new kit.Container() as BrickView;
    view.shadow = new kit.Graphics();
    view.body = new kit.Graphics();
    view.studs = new kit.Graphics();
    view.light = new kit.Graphics();
    view.footprint = "";
    view.addChild(view.shadow, view.body, view.studs, view.light);
    return view;
  },
  update(view: BrickView, node: RenderNode, frame: ItemFrame) {
    const { w, h } = studsOf(node);
    const key = `${w}x${h}`;
    if (view.footprint !== key) {
      view.footprint = key;
      view.shadow.context = context(`brick-shadow:${key}`, (g) =>
        g.roundRect(-w / 2 + INSET + 0.1, -h / 2 + INSET + 0.14, w - 2 * INSET, h - 2 * INSET, 0.1).fill({ color: 0x000000, alpha: 0.4 }),
      );
      view.body.context = context(`brick-body:${key}`, (g) =>
        g.roundRect(-w / 2 + INSET, -h / 2 + INSET, w - 2 * INSET, h - 2 * INSET, 0.08).fill(0xffffff).stroke({ width: 0.05, ...EDGE }),
      );
      tileStuds(view.studs, "studs", w, h);
      tileStuds(view.light, "light", w, h);
    }
    view.scale.set(frame.width / w);
    const tint = frame.tint ?? 0xa0a5a9;
    view.body.tint = tint;
    view.studs.tint = tint;
    const px = pxPerStud(frame, w);
    view.studs.visible = px >= STUD_PX;
    view.light.visible = px >= HIGHLIGHT_PX;
    view.shadow.visible = px >= STUD_PX / 2;
  },
  destroy: (view: BrickView) => view.destroy({ children: true }),
};

interface PlateView extends Container {
  shadow: Graphics;
  face: Graphics;
  /** The studs: one rectangle filled with the stud texture, tiled one per stud. Tinted. */
  studs: Graphics;
  /** The light on each stud, tiled the same way. Never tinted. */
  light: Graphics;
  rim: Graphics;
  footprint: string;
}

/**
 * A theme is a plate: a face in its colour, with its studs on top (`tileStuds`, so even Duplo's
 * 7,000 studs are one rectangle).
 *
 * Zoom into a plate and the package fades it out as its contents fade in (a solid item is washed
 * out completely), so the plate gives way to what is on it, on the same studs.
 */
const plate = {
  create(kit: PixiKit): PlateView {
    pixi = kit;
    const view = new kit.Container() as PlateView;
    view.shadow = new kit.Graphics();
    view.face = new kit.Graphics();
    view.studs = new kit.Graphics();
    view.light = new kit.Graphics();
    view.rim = new kit.Graphics();
    view.footprint = "";
    view.addChild(view.shadow, view.face, view.studs, view.light, view.rim);
    return view;
  },
  update(view: PlateView, node: RenderNode, frame: ItemFrame) {
    const { w, h } = studsOf(node);
    const key = `${w}x${h}`;
    if (view.footprint !== key) {
      view.footprint = key;
      const [l, t] = [-w / 2, -h / 2];
      const r = Math.min(0.3, w / 6, h / 6);
      view.shadow.context = context(`plate-shadow:${key}`, (g) => g.roundRect(l + 0.1, t + 0.14, w, h, r).fill({ color: 0x000000, alpha: 0.35 }));
      view.face.context = context(`plate-face:${key}`, (g) => g.roundRect(l, t, w, h, r).fill(0xffffff));
      tileStuds(view.studs, "studs", w, h);
      tileStuds(view.light, "light", w, h);
      view.rim.context = context(`plate-rim:${key}`, (g) => g.roundRect(l, t, w, h, r).stroke({ width: 0.06, ...EDGE }));
    }
    view.scale.set(frame.width / w);
    const tint = frame.tint ?? 0xa0a5a9;
    view.face.tint = tint;
    view.studs.tint = tint;
    // The studs come in as they grow big enough to read, rather than all at once.
    const px = pxPerStud(frame, w);
    view.studs.alpha = Math.min(1, Math.max(0, (px - STUD_PX + 1) / 3));
    view.studs.visible = view.studs.alpha > 0;
    view.light.visible = px >= HIGHLIGHT_PX;
    view.shadow.visible = px >= STUD_PX / 2;
  },
  destroy: (view: PlateView) => view.destroy({ children: true }),
};

export default defineRenderers({ brick, plate });
