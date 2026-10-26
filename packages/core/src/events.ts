// The view's event payloads — US071 Step 2 (ADR-016 A25).
//
// Pure data: every payload carries scene items and plain numbers, never a PixiJS object, so a
// consumer's handlers work the same with or without the canvas (US071 AC6).

import type { NavigationDirection } from "./camera/scene-stack";
import type { ExplorerItem, ExplorerScene } from "./scene/types";

export type { NavigationDirection };

/** A scene the viewer entered or left. `direction` is how: `in` by entering an item, `out` by
 *  zooming out to a parent, `jump` by a focus change from outside (Back/Forward, a pasted link). */
export interface ExplorerSceneEvent<F, D = unknown> {
  /** The scene's heading. */
  heading: string;
  /** The scene's focus (`null` for the top). */
  focus: F | null;
  /** The scene as your source returned it. */
  scene: ExplorerScene<F, D>;
  /** How the viewer moved: see `NavigationDirection`. */
  direction: NavigationDirection;
}

/**
 * A double-click or double-tap on an item, or Enter on its entry in the outline. The default
 * action is the explorer's own: enter the item if it can be entered, otherwise (pointer only)
 * zoom in at that point. Call `preventDefault()` to do something else instead, such as opening a
 * panel.
 */
export interface ExplorerActivateEvent<F = unknown, D = unknown> {
  /** The item as your source wrote it, `data` included. */
  item: ExplorerItem<F, D>;
  /** `"pointer"` for a double-click or double-tap, `"keyboard"` for Enter on its outline entry. */
  source: "pointer" | "keyboard";
  /** Whether a handler has called `preventDefault()`. */
  readonly defaultPrevented: boolean;
  /** Stops the explorer's own action: entering the item, or zooming in. */
  preventDefault(): void;
}

/** Where the camera is: the world point at the middle of the view, and its scale. */
export interface ExplorerCameraEvent {
  /** The world point at the middle of the view: x. */
  x: number;
  /** The world point at the middle of the view: y. */
  y: number;
  /** Screen pixels per world unit: bigger is zoomed in. */
  scale: number;
}

/** A confirmed single click or tap that hit no item. */
export interface ExplorerBackgroundClickEvent {
  /** Pixels from the canvas's top-left corner. */
  screen: { x: number; y: number };
  /** The same point in the scene's own coordinates. */
  world: { x: number; y: number };
}

export function createActivateEvent<F, D>(item: ExplorerItem<F, D>, source: ExplorerActivateEvent["source"]): ExplorerActivateEvent<F, D> {
  let prevented = false;
  return {
    item,
    source,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
}

/** Fires `report` only when the camera moved since the last report: at most once per drawn frame. */
export function cameraReporter(report: (camera: ExplorerCameraEvent) => void) {
  let last: ExplorerCameraEvent | null = null;
  return (camera: ExplorerCameraEvent) => {
    if (last && last.x === camera.x && last.y === camera.y && last.scale === camera.scale) return;
    last = { x: camera.x, y: camera.y, scale: camera.scale };
    report({ ...last });
  };
}
