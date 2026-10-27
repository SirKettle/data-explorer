// Camera state and the world<->screen maths every input path and every scripted motion shares.
//
// US036 plan Step 3R.1 Step 2 — ported verbatim from
// `apps/explorer/__scratch/pixijs-explorer-spike/camera.ts` (ADR-016 amendments A1-A10, A16).
// Deliberately renderer-agnostic: nothing here imports pixi.js. The renderer consumes a Camera to
// place a transform; the gesture layer and the scene-transition layer only ever mutate one through
// `CameraRig`. Keeping all of it in one place is what stopped the DOM spike's "zoom to a point"
// maths from being re-derived (and got wrong) per input handler.

/** Where the camera looks, and how closely. */
export interface Camera {
  /** World coordinates of the point currently at the viewport's centre. */
  x: number;
  /** As `x`. */
  y: number;
  /** Screen pixels per world unit: bigger is zoomed in. */
  scale: number;
}

/** The size of the view, in screen pixels. */
export interface Viewport {
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}

/** A point, in screen pixels (or world units, where a function says so). */
export interface ScreenPoint {
  /** Across. */
  x: number;
  /** Down. */
  y: number;
}

// MIN_SCALE must stay below any tier's own contained-fit scale (a 1,049-node tier fits at
// ~0.018 on a phone) — a floor above that silently makes zoom-out-to-leave unreachable for that
// tier, since scale snaps back up before ever crossing the leave threshold.
export const MIN_SCALE = 0.002;
export const MAX_SCALE = 40;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function worldToScreen(camera: Camera, viewport: Viewport, worldX: number, worldY: number): ScreenPoint {
  return {
    x: (worldX - camera.x) * camera.scale + viewport.width / 2,
    y: (worldY - camera.y) * camera.scale + viewport.height / 2,
  };
}

export function screenToWorld(camera: Camera, viewport: Viewport, screenX: number, screenY: number): ScreenPoint {
  return {
    x: camera.x + (screenX - viewport.width / 2) / camera.scale,
    y: camera.y + (screenY - viewport.height / 2) / camera.scale,
  };
}

/** Zoom by `factor` while keeping whatever world point is under `screen` exactly under it —
 *  the standard zoom-to-pointer solve, used by wheel, pinch, momentum and double-tap alike. */
export function zoomAtScreenPoint(camera: Camera, viewport: Viewport, screen: ScreenPoint, factor: number): Camera {
  const world = screenToWorld(camera, viewport, screen.x, screen.y);
  const scale = clampScale(camera.scale * factor);
  return {
    x: world.x - (screen.x - viewport.width / 2) / scale,
    y: world.y - (screen.y - viewport.height / 2) / scale,
    scale,
  };
}

/** The camera that makes `worldPoint` appear at `screen` at exactly `scale`. */
export function cameraPlacing(viewport: Viewport, worldPoint: ScreenPoint, screen: ScreenPoint, scale: number): Camera {
  return {
    x: worldPoint.x - (screen.x - viewport.width / 2) / scale,
    y: worldPoint.y - (screen.y - viewport.height / 2) / scale,
    scale,
  };
}

/** Contain a whole layout in view, centred, at `padding` of the viewport's limiting dimension. */
export function fitCamera(viewport: Viewport, width: number, height: number, padding = 0.85): Camera {
  return {
    x: width / 2,
    y: height / 2,
    scale: clampScale(Math.min((viewport.width * padding) / width, (viewport.height * padding) / height)),
  };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boxCentre(box: Box): ScreenPoint {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The camera at which `box` fills `fillFraction` of the viewport, centred: for a square box, of the
 *  viewport's smaller dimension; for any box, as much as fits on both axes. */
export function cameraFillingBox(viewport: Viewport, box: Box, fillFraction: number): Camera {
  const centre = boxCentre(box);
  return {
    ...centre,
    scale: clampScale(Math.min(viewport.width / (box.width * 1.05), viewport.height / (box.height * 1.05)) * fillFraction),
  };
}

/** Where the camera may go, in the current scene's world (see `limitCamera`). */
export interface CameraLimits {
  /** The content the view must keep showing. */
  bounds: { x: number; y: number; width: number; height: number };
  /** How much of the view the content must keep covering on each axis, as a share of the view's
   *  size on that axis (all of the content, where it is smaller); `null` for no pan limit. */
  keep: number | null;
  /** The smallest and largest scale allowed. */
  minScale: number;
  maxScale: number;
}

/**
 * `camera` kept within `limits`: its scale clamped, then its centre moved, on each axis, just far
 * enough that `bounds` still covers `keep` of the view (or all of itself, when smaller).
 */
export function limitCamera(camera: Camera, viewport: Viewport, limits: CameraLimits): Camera {
  const scale = Math.min(limits.maxScale, Math.max(limits.minScale, camera.scale));
  const keep = limits.keep;
  if (keep === null) return { ...camera, scale };
  const axis = (centre: number, start: number, size: number, view: number) => {
    const need = Math.min(keep * view, size * scale);
    const slack = (view / 2 - need) / scale;
    const lo = start - slack;
    const hi = start + size + slack;
    return lo > hi ? start + size / 2 : Math.min(hi, Math.max(lo, centre));
  };
  const { x, y, width, height } = limits.bounds;
  return { x: axis(camera.x, x, width, viewport.width), y: axis(camera.y, y, height, viewport.height), scale };
}

export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, scale: a.scale + (b.scale - a.scale) * t };
}

/** Mutable camera + viewport holder. Every mutation notifies `onChange` exactly once, which is
 *  the single hook the render loop needs — no caller anywhere has to remember to request a draw. */
export class CameraRig {
  /** The current camera. Change it through `set`, so `onChange` fires. */
  camera: Camera;
  /** Called after every change of camera. */
  onChange: (() => void) | null = null;
  /** Keeps every camera `set` within limits (`limitCamera`), or `null` for none. */
  limit: ((camera: Camera) => Camera) | null = null;

  constructor(
    private readonly readViewport: () => Viewport,
    camera: Camera,
  ) {
    this.camera = camera;
  }

  /** The current viewport, read fresh each time. */
  get viewport(): Viewport {
    return this.readViewport();
  }

  /** Moves the camera, clamping its scale and applying `limit`, and notifies `onChange`. */
  set(camera: Camera): void {
    const clamped = { ...camera, scale: clampScale(camera.scale) };
    this.camera = this.limit ? this.limit(clamped) : clamped;
    this.onChange?.();
  }

  /** Pan by a screen-space delta (the direction a finger/mouse moved: content follows it). */
  panByScreen(dx: number, dy: number): void {
    this.set({ ...this.camera, x: this.camera.x - dx / this.camera.scale, y: this.camera.y - dy / this.camera.scale });
  }

  /** Zooms by `factor` about a screen point, keeping that point still. */
  zoomAtScreen(screen: ScreenPoint, factor: number): void {
    // Solve for the scale the limit allows, not the one asked for: solving at a scale the limit
    // then clamps back leaves the camera moved, so zooming on at the limit drifts the view.
    if (this.limit) {
      const scale = this.limit({ ...this.camera, scale: clampScale(this.camera.scale * factor) }).scale;
      factor = scale / this.camera.scale;
    }
    this.set(zoomAtScreenPoint(this.camera, this.viewport, screen, factor));
  }

  /** Where a world point is on screen now. */
  worldToScreen(worldX: number, worldY: number): ScreenPoint {
    return worldToScreen(this.camera, this.viewport, worldX, worldY);
  }

  /** Which world point is under a screen point now. */
  screenToWorld(screenX: number, screenY: number): ScreenPoint {
    return screenToWorld(this.camera, this.viewport, screenX, screenY);
  }
}

/** This environment's Chrome-automation harness reports `document.visibilityState: "hidden"`
 *  even while focused, which starves requestAnimationFrame almost entirely — the same
 *  constraint ADR-016's spike, US032's width measurement and the DOM spike all recorded. A
 *  setTimeout(~16ms) backstop races rAF so physics still advances under automation; a real
 *  foreground tab gets rAF promptly and the backstop never wins. */
export function scheduleFrame(cb: (now: number) => void): void {
  let called = false;
  const fire = (now: number) => {
    if (called) return;
    called = true;
    cb(now);
  };
  requestAnimationFrame(fire);
  setTimeout(() => fire(performance.now()), 16);
}
