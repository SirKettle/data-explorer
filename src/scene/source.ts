import type { ExplorerScene } from "./types";

/**
 * US070 / ADR-016 A24 — what a consumer supplies so the scene stack can explore its data.
 *
 * `F` is the consumer's own focus type and is opaque here: nothing in `scene/` or `camera/` reads
 * inside it. `null` always means the root scene. The stack only ever pushes and pops the scenes the
 * camera visits, so a source over a cyclic graph is safe: nothing here walks the data.
 */
export interface SceneSource<F, D = unknown> {
  /** A stable cache identity for a focus; `"root"` for `null`. Two foci with the same key are the same scene. */
  keyOf(focus: F | null): string;
  /** The scene for a focus (`null` is the top). Called often for the same focus: cache it. */
  loadScene(focus: F | null): Promise<ExplorerScene<F, D>>;
  /** Resolves as soon as the first part of a scene is available and reports every later part via
   *  `onUpdate`. Optional: without it the stack waits for `loadScene`. */
  loadSceneStreaming?(focus: F, onUpdate: (scene: ExplorerScene<F, D>) => void): Promise<ExplorerScene<F, D>>;
  /** Whether `loadScene(focus)` would resolve from cache, without itself triggering a load. */
  isCached(focus: F | null): boolean;
  /** Reloads a scene whose data changed underneath it. Optional: without it the stack reloads
   *  through `loadScene`, which may return the cached copy. */
  refreshScene?(focus: F | null): Promise<ExplorerScene<F, D>>;
  /** Where zooming out of `focus` leads. `current` is the scene for `focus` as it is on screen,
   *  for a source that can answer from data already in hand. A rejection leaves the camera where
   *  it was. */
  parentOf(focus: F, current: ExplorerScene<F, D>): Promise<ParentLink<F>>;
  /** Calls `onChange` when data behind the scenes changed (a write elsewhere), so the view can
   *  refresh what is on screen. Returns an unsubscribe function. Optional. */
  subscribeToInvalidation?(onChange: () => void): () => void;
}

/**
 * - `none`: nothing above; zooming out does nothing.
 * - `anchored`: the parent scene contains an item (`anchorId`) standing for the current scene, so
 *   zooming out continues smoothly from that item's box.
 * - `unanchored`: there is a parent but no single item in it stands for the current scene; the
 *   stack swaps to it directly.
 */
export type ParentLink<F> =
  | { kind: "none" }
  | { kind: "anchored"; focus: F | null; anchorId: string }
  | { kind: "unanchored"; focus: F | null };
