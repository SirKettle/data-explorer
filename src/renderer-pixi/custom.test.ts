import "../test-setup";
import { describe, expect, test } from "bun:test";
import { Container, Sprite, type Texture } from "pixi.js";
import type { RenderNode } from "../camera/scene-stack";
import type { ItemFrame } from "../custom-views";
import { createCustomViews, itemZ } from "./custom";

// Issue #5: custom views used to live in a layer of their own above every shape, so during a
// transition a view from the scene beneath was drawn over the shapes of the scene in front. They
// now share the renderer's sorted item layer, placed by draw order like the shapes.

const node = (id: string) => ({ id, kind: "planet" }) as unknown as RenderNode;
const frame = { size: 10, screenSize: 10, opacity: 1, hovered: false, selected: false, timeMs: 0, tint: null, texture: null, reducedMotion: false } as ItemFrame<Texture>;

/** A frame as the renderer draws it: each entry is one item, in draw order. */
function drawFrame(entries: { id: string; custom: boolean; textured?: boolean }[]) {
  const layer = new Container();
  layer.sortableChildren = true;
  const views = createCustomViews(layer);
  views.setModule({ planet: { create: () => new Container(), update: () => {} } });
  views.begin();
  entries.forEach((entry, order) => {
    if (entry.custom) {
      views.draw("planet", node(entry.id), frame, (view) => {
        view.label = `custom:${entry.id}`;
        view.zIndex = itemZ(order, "body");
      });
    } else {
      const shape = new Sprite();
      shape.label = `shape:${entry.id}`;
      shape.zIndex = itemZ(order, "body");
      layer.addChild(shape);
    }
    if (entry.textured) {
      const texture = new Sprite();
      texture.label = `texture:${entry.id}`;
      texture.zIndex = itemZ(order, "texture");
      layer.addChild(texture);
    }
  });
  views.end();
  layer.sortChildren();
  return layer.children.filter((child) => child.visible).map((child) => child.label);
}

describe("custom views stack with their own scene layer (issue #5)", () => {
  test("a custom view from the scene beneath stays under the shapes of the scene in front", () => {
    // Drawn as the renderer does: the scene being entered (beneath) first, then the current scene.
    const order = drawFrame([
      { id: "moon", custom: true }, // beneath
      { id: "earth", custom: false }, // current
    ]);
    expect(order).toEqual(["custom:moon", "shape:earth"]);
  });

  test("a custom view in front stays over the shapes beneath it", () => {
    expect(drawFrame([{ id: "dust", custom: false }, { id: "mars", custom: true }])).toEqual(["shape:dust", "custom:mars"]);
  });

  test("an item's texture sits just above its own shape, and under the next item", () => {
    const order = drawFrame([
      { id: "a", custom: false, textured: true },
      { id: "b", custom: false },
    ]);
    expect(order).toEqual(["shape:a", "texture:a", "shape:b"]);
  });

  test("views attach to the item layer itself, not a layer of their own", () => {
    const layer = new Container();
    const views = createCustomViews(layer);
    views.setModule({ planet: { create: () => new Container(), update: () => {} } });
    views.begin();
    views.draw("planet", node("x"), frame, () => {});
    views.end();
    expect(layer.children).toHaveLength(1);
    expect(layer.children[0]!.children).toHaveLength(0); // the view, not a wrapper holding it
  });
});
