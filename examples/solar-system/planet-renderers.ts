import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { defineRenderers, type ItemFrame } from "@thirkettle/data-explorer/pixi";

/**
 * The solar-system example's custom renderers (US071 Step 7): a planet with a night side, and a
 * ringed planet whose rings pass behind and in front of it. This module and PixiJS are loaded
 * lazily, through `renderers={() => import("./planet-renderers")}`; nothing on the page imports
 * them directly.
 *
 * Every view is drawn at a design radius of 50 and scaled to the item, so the drawing code never
 * deals with zoom. The light comes from the upper left. Saturn's rings shimmer (`animated: true`),
 * which is the one thing here that asks for frames; under reduced motion they hold still.
 */

const R = 50;
/** The texture is cropped to a disc of radius 124 in a 256 px square (the package's crop). */
const TEXTURE_SCALE = R / 124;
/** Below this on screen, a planet is a plain tinted disc: the detail would not read. */
const DETAIL_PX = 28;
const LIGHT_ANGLE = (-135 * Math.PI) / 180; // from the upper left

/** The dark side: the half facing away from the light, bounded by an elliptical terminator. */
function nightSide(): Graphics {
  const shade = new Graphics();
  const points: number[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / 24;
    points.push(Math.cos(t) * R, Math.sin(t) * R); // the lit-away limb
  }
  // The terminator, bowed towards the night. It shares its two ends with the limb, so they are
  // not repeated: a repeated vertex made the triangulation degenerate and blacked out the canvas.
  for (let i = 23; i >= 1; i--) {
    const t = -Math.PI / 2 + (Math.PI * i) / 24;
    points.push(Math.cos(t) * R * 0.25, Math.sin(t) * R);
  }
  shade.poly(points).fill({ color: 0x000000, alpha: 0.55 });
  shade.rotation = LIGHT_ANGLE + Math.PI; // face away from the light
  return shade;
}

/** Half a ring ellipse: `front` is the half nearer the viewer, drawn over the planet. */
function ringHalf(front: boolean): Graphics {
  const ring = new Graphics();
  const from = front ? 0 : Math.PI;
  for (const [radius, alpha, width] of [
    [1.65, 0.75, 7],
    [1.95, 0.45, 5],
  ] as const) {
    const points: number[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = from + (Math.PI * i) / 32;
      points.push(Math.cos(t) * R * radius, Math.sin(t) * R * radius * 0.3);
    }
    ring.moveTo(points[0]!, points[1]!);
    for (let i = 2; i < points.length; i += 2) ring.lineTo(points[i]!, points[i + 1]!);
    ring.stroke({ color: 0xe8d3a2, alpha, width });
  }
  ring.rotation = -0.35;
  return ring;
}

interface PlanetView extends Container {
  body: Graphics;
  face: Sprite;
  shade: Graphics;
  back?: Graphics;
  front?: Graphics;
}

function createPlanet(ringed: boolean): PlanetView {
  const view = new Container() as PlanetView;
  view.body = new Graphics().circle(0, 0, R).fill(0xffffff);
  view.face = new Sprite(Texture.EMPTY);
  view.face.anchor.set(0.5);
  view.face.scale.set(TEXTURE_SCALE);
  view.shade = nightSide();
  if (ringed) {
    view.back = ringHalf(false);
    view.front = ringHalf(true);
    view.addChild(view.back);
  }
  view.addChild(view.body, view.face, view.shade);
  if (view.front) view.addChild(view.front);
  return view;
}

/** A slow shimmer of the rings: a 6 s breath of their brightness. */
const SHIMMER_MS = 6000;

function updatePlanet(view: PlanetView, frame: ItemFrame) {
  view.scale.set(frame.size / (R * 2));
  view.body.tint = frame.tint ?? 0x888888;
  view.face.texture = frame.texture ?? Texture.EMPTY;
  view.face.visible = frame.texture !== null;
  const detailed = frame.screenSize >= DETAIL_PX;
  view.shade.visible = detailed;
  if (view.back) view.back.visible = detailed;
  if (view.front) view.front.visible = detailed;
  if (view.back && view.front) {
    const level = frame.reducedMotion ? 0.5 : 0.5 - 0.5 * Math.cos((2 * Math.PI * frame.timeMs) / SHIMMER_MS);
    view.back.alpha = 0.7 + 0.3 * level;
    view.front.alpha = 0.7 + 0.3 * level;
  }
}

export default defineRenderers({
  planet: {
    create: () => createPlanet(false),
    update: (view: PlanetView, _item, frame) => updatePlanet(view, frame),
    destroy: (view: PlanetView) => view.destroy({ children: true }),
  },
  "ringed-planet": {
    create: () => createPlanet(true),
    update: (view: PlanetView, _item, frame) => updatePlanet(view, frame),
    destroy: (view: PlanetView) => view.destroy({ children: true }),
    animated: true,
  },
});
