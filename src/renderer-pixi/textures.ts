// Item images on the canvas — US071 Step 6 (ADR-016 A25 clauses 4 and 5: one of the files allowed
// to import pixi.js).
//
// An image is loaded with `crossOrigin = "anonymous"` (a canvas may only draw pixels it is allowed
// to read), then drawn once into a small canvas cropped to the item's shape, at exactly the
// geometry of the renderer's own shape textures. The renderer lays the result over the plain
// shape with the same scale, so no per-sprite mask (a stencil pass each) is ever needed. What to
// keep, what to evict and what to report is `texture-cache.ts`'s decision, not this file's.

import { Texture } from "pixi.js";
import { TextureBudget, textureDecision } from "../texture-cache";

/** The crop's side: the renderer's 128 px shape textures at 2×, so the two line up exactly. */
export const CROP_SIZE = 256;
const SCALE = CROP_SIZE / 128;
/** Matches `discTexture` (radius 62 of 128) and `squareTexture` (side 100, corner 16, of 128). */
const DISC_RADIUS = 62 * SCALE;
const SQUARE_SIDE = 100 * SCALE;
const SQUARE_CORNER = 16 * SCALE;

export type TexturedShape = "disc" | "square";

function crop(image: HTMLImageElement, shape: TexturedShape, fit: "cover" | "contain"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CROP_SIZE;
  canvas.height = CROP_SIZE;
  const ctx = canvas.getContext("2d")!;
  const centre = CROP_SIZE / 2;
  const box = shape === "disc" ? DISC_RADIUS * 2 : SQUARE_SIDE;
  ctx.beginPath();
  if (shape === "disc") ctx.arc(centre, centre, DISC_RADIUS, 0, Math.PI * 2);
  else ctx.roundRect(centre - box / 2, centre - box / 2, box, box, SQUARE_CORNER);
  ctx.clip();
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const scale = fit === "cover" ? Math.max(box / width, box / height) : Math.min(box / width, box / height);
  ctx.drawImage(image, centre - (width * scale) / 2, centre - (height * scale) / 2, width * scale, height * scale);
  return canvas;
}

export function createTextureStore(budget: number, onReady: () => void, onError: (url: string) => void) {
  const cache = new TextureBudget<Texture>(budget, (texture) => texture.destroy(true));
  const reported = new Set<string>();
  let destroyed = false;

  function load(key: string, url: string, shape: TexturedShape, fit: "cover" | "contain") {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    const failed = () => {
      if (destroyed) return;
      // One report per URL, however many shapes or fits it was asked for in.
      if (cache.fail(key) && !reported.has(url)) {
        reported.add(url);
        onError(url);
      }
    };
    image.onload = () => {
      if (destroyed) return;
      let texture: Texture;
      try {
        texture = Texture.from(crop(image, shape, fit));
      } catch {
        failed(); // a decoded image the canvas still refuses (a tainted source) is a failure too
        return;
      }
      if (cache.resolve(key, texture)) onReady();
    };
    image.onerror = failed;
    image.src = url;
  }

  return {
    /** Call once per draw, before `textureFor`. */
    beginFrame: () => cache.beginFrame(),
    /** The texture to draw over an item's shape this frame, or `null` to draw the shape alone. A
     *  first sighting at a big enough size starts the load. */
    textureFor(texture: { url: string; fit: "cover" | "contain" }, shape: TexturedShape, diameterPx: number, minDiameterPx: number): Texture | null {
      const key = `${texture.url}\u0000${shape}\u0000${texture.fit}`;
      const decision = textureDecision(diameterPx, minDiameterPx, cache.status(key));
      if (decision === "texture") return cache.use(key);
      if (decision === "load" && cache.reserve(key)) load(key, texture.url, shape, texture.fit);
      return null;
    },
    setBudget: (next: number) => cache.setBudget(next),
    /** How many images are held or loading, for the stats overlay. */
    held: () => cache.held(),
    destroy() {
      destroyed = true;
      cache.clear();
    },
  };
}
