import { describe, expect, test } from "bun:test";
import {
  boxCentre,
  cameraFillingBox,
  cameraPlacing,
  CameraRig,
  clampScale,
  fitCamera,
  lerpCamera,
  limitCamera,
  MAX_SCALE,
  MIN_SCALE,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
  type Camera,
  type Viewport,
} from "./camera";

/**
 * US036 plan Step 3R.1 Step 2 — camera maths tests the spike itself never had (its own README
 * names this as new work Step 2 is buying, not something ported from the spike).
 */

const viewport: Viewport = { width: 800, height: 600 };

describe("clampScale", () => {
  test("clamps to [MIN_SCALE, MAX_SCALE]", () => {
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(-5)).toBe(MIN_SCALE);
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(1)).toBe(1);
  });
});

describe("worldToScreen / screenToWorld", () => {
  test("are exact inverses of each other for any camera/viewport pair", () => {
    const camera: Camera = { x: 120, y: -40, scale: 2.5 };
    const world = { x: 37, y: 91 };
    const screen = worldToScreen(camera, viewport, world.x, world.y);
    const back = screenToWorld(camera, viewport, screen.x, screen.y);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  test("the world point at the camera's own (x, y) always renders at the viewport centre", () => {
    const camera: Camera = { x: 500, y: 500, scale: 4 };
    const screen = worldToScreen(camera, viewport, camera.x, camera.y);
    expect(screen.x).toBeCloseTo(viewport.width / 2);
    expect(screen.y).toBeCloseTo(viewport.height / 2);
  });
});

describe("zoomAtScreenPoint", () => {
  test("keeps the world point under the given screen point fixed across the zoom", () => {
    const camera: Camera = { x: 0, y: 0, scale: 1 };
    const screen = { x: 200, y: 150 };
    const before = screenToWorld(camera, viewport, screen.x, screen.y);
    const after = zoomAtScreenPoint(camera, viewport, screen, 3);
    const afterWorld = screenToWorld(after, viewport, screen.x, screen.y);
    expect(afterWorld.x).toBeCloseTo(before.x, 6);
    expect(afterWorld.y).toBeCloseTo(before.y, 6);
    expect(after.scale).toBe(3);
  });

  test("clamps the resulting scale rather than overshooting MAX_SCALE/MIN_SCALE", () => {
    const camera: Camera = { x: 0, y: 0, scale: MAX_SCALE };
    const after = zoomAtScreenPoint(camera, viewport, { x: 0, y: 0 }, 100);
    expect(after.scale).toBe(MAX_SCALE);
  });
});

describe("cameraPlacing / cameraFillingBox", () => {
  test("cameraPlacing produces a camera under which the world point renders exactly at the requested screen point and scale", () => {
    const worldPoint = { x: 42, y: -17 };
    const screen = { x: 300, y: 100 };
    const camera = cameraPlacing(viewport, worldPoint, screen, 5);
    expect(camera.scale).toBe(5);
    const rendered = worldToScreen(camera, viewport, worldPoint.x, worldPoint.y);
    expect(rendered.x).toBeCloseTo(screen.x, 6);
    expect(rendered.y).toBeCloseTo(screen.y, 6);
  });

  test("cameraFillingBox centres the box and scales it to fillFraction of the viewport's smaller dimension", () => {
    const box = { x: 100, y: 100, width: 50, height: 50 };
    const camera = cameraFillingBox(viewport, box, 0.9);
    const centre = boxCentre(box);
    expect(camera.x).toBe(centre.x);
    expect(camera.y).toBe(centre.y);
    // The box, rendered under this camera, spans roughly fillFraction of the smaller viewport side.
    const spanPx = box.width * camera.scale;
    expect(spanPx).toBeLessThanOrEqual(Math.min(viewport.width, viewport.height));
    expect(spanPx / Math.min(viewport.width, viewport.height)).toBeCloseTo(0.9 / 1.05, 2);
  });

  test("cameraFillingBox fits a rectangular box by whichever axis is tighter", () => {
    const tall = { x: 0, y: 0, width: 10, height: 400 };
    const camera = cameraFillingBox(viewport, tall, 0.9);
    expect(camera.y).toBe(200);
    expect(tall.height * camera.scale).toBeCloseTo((viewport.height * 0.9) / 1.05, 2);
    expect(tall.width * camera.scale).toBeLessThan(viewport.width);
  });
});

describe("fitCamera", () => {
  test("contains the whole layout, centred, at padding of the limiting dimension", () => {
    const camera = fitCamera(viewport, 2000, 1000, 0.85);
    expect(camera.x).toBe(1000);
    expect(camera.y).toBe(500);
    // width is the limiting dimension here (2000/800 > 1000/600), so scale should derive from it.
    expect(camera.scale).toBeCloseTo((viewport.width * 0.85) / 2000, 6);
  });
});

describe("lerpCamera", () => {
  test("interpolates x/y/scale independently and linearly", () => {
    const a: Camera = { x: 0, y: 0, scale: 1 };
    const b: Camera = { x: 100, y: 200, scale: 3 };
    expect(lerpCamera(a, b, 0)).toEqual(a);
    expect(lerpCamera(a, b, 1)).toEqual(b);
    expect(lerpCamera(a, b, 0.5)).toEqual({ x: 50, y: 100, scale: 2 });
  });
});

describe("CameraRig", () => {
  function rig(initial: Camera = { x: 0, y: 0, scale: 1 }): CameraRig {
    return new CameraRig(() => viewport, initial);
  }

  test("set() clamps scale and notifies onChange exactly once", () => {
    let notifications = 0;
    const r = rig();
    r.onChange = () => notifications++;
    r.set({ x: 5, y: 5, scale: 1000 });
    expect(r.camera.scale).toBe(MAX_SCALE);
    expect(notifications).toBe(1);
  });

  test("panByScreen moves the camera opposite to content following the finger, scaled by the current zoom", () => {
    const r = rig({ x: 0, y: 0, scale: 2 });
    r.panByScreen(20, 10); // finger/content moves right+down -> camera (world focus) moves left+up
    expect(r.camera.x).toBeCloseTo(-10);
    expect(r.camera.y).toBeCloseTo(-5);
  });

  test("zoomAtScreen keeps the world point under that screen point fixed, delegating to zoomAtScreenPoint", () => {
    const r = rig({ x: 0, y: 0, scale: 1 });
    const screen = { x: 400, y: 300 }; // viewport centre
    const before = r.screenToWorld(screen.x, screen.y);
    r.zoomAtScreen(screen, 2);
    const after = r.screenToWorld(screen.x, screen.y);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(r.camera.scale).toBe(2);
  });

  test("worldToScreen/screenToWorld are the camera's own bound versions of the free functions", () => {
    const r = rig({ x: 10, y: 20, scale: 1.5 });
    expect(r.worldToScreen(30, 40)).toEqual(worldToScreen(r.camera, viewport, 30, 40));
    expect(r.screenToWorld(300, 200)).toEqual(screenToWorld(r.camera, viewport, 300, 200));
  });
});

describe("limitCamera", () => {
  // viewport is 800 × 600; a scene 1,000 wide and 500 tall.
  const limits = { bounds: { x: 0, y: 0, width: 1000, height: 500 }, keep: 0.25, minScale: 0.2, maxScale: 4 };

  test("clamps the scale", () => {
    expect(limitCamera({ x: 500, y: 250, scale: 0.01 }, viewport, limits).scale).toBe(0.2);
    expect(limitCamera({ x: 500, y: 250, scale: 9 }, viewport, limits).scale).toBe(4);
  });

  test("leaves a camera that shows enough of the scene alone", () => {
    expect(limitCamera({ x: 500, y: 250, scale: 1 }, viewport, limits)).toEqual({ x: 500, y: 250, scale: 1 });
  });

  test("stops the scene being panned out of view: it keeps covering a quarter of the view on each axis", () => {
    // 0.25 × 800 = 200 px across must stay covered. Panned far right of the scene:
    const panned = limitCamera({ x: 5000, y: 250, scale: 1 }, viewport, limits);
    const rightEdge = worldToScreen(panned, viewport, 1000, 0).x;
    expect(rightEdge).toBeCloseTo(200, 6);
    // And 0.25 × 600 = 150 px down.
    const below = limitCamera({ x: 500, y: -4000, scale: 1 }, viewport, limits);
    expect(600 - worldToScreen(below, viewport, 0, 0).y).toBeCloseTo(150, 6);
  });

  test("a scene smaller than that must stay wholly in view", () => {
    const small = { ...limits, bounds: { x: 0, y: 0, width: 50, height: 50 } };
    const panned = limitCamera({ x: -5000, y: 25, scale: 1 }, viewport, small);
    expect(worldToScreen(panned, viewport, 0, 0).x).toBeCloseTo(800 - 50, 6);
  });

  test("no pan limit when keep is null", () => {
    expect(limitCamera({ x: 5000, y: 250, scale: 1 }, viewport, { ...limits, keep: null }).x).toBe(5000);
  });

  test("the rig applies its limit on every set", () => {
    const r = new CameraRig(() => viewport, { x: 500, y: 250, scale: 1 });
    r.limit = (camera) => limitCamera(camera, viewport, limits);
    r.panByScreen(-100_000, 0);
    expect(worldToScreen(r.camera, viewport, 1000, 0).x).toBeCloseTo(200, 6);
  });
});
