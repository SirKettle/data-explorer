/**
 * Driving the explorer without its canvas: the scene stack and camera on their own, and the pure
 * colour and shape choice the canvas makes for each node. For tests, custom renderers and tooling.
 * Nothing here imports PixiJS.
 *
 * @packageDocumentation
 * @module headless
 */
export { CameraRig, type Camera, type Viewport } from "./camera/camera";
export {
  createSceneStack,
  PREVIEW_RETRY_MS,
  type CameraLimitOptions,
  type NavigationDirection,
  type PreviewParent,
  type RenderEdge,
  type RenderNode,
  type SceneStack,
  type SceneStackDeps,
  type StackedScene,
  type TransitionLayer,
  type TransitionView,
} from "./camera/scene-stack";
export { appearanceFor, rampColor, type NodeAppearance } from "./renderer-pixi/tint";
// How the canvas draws a presence: for custom renderers that want to match it.
export { clampPresence, easePresence, presenceLook, PRESENCE_GHOST, PRESENCE_EASE_MS, type ExplorerPresence } from "./presence";
export { createTestStack, type TestStack, type TestStackOptions } from "./camera/test-stack";
// US072 change 10: tooling-level pieces that left the main entry.
export { parseColour, resolvePalette } from "./colour";
export { resolveOptions, type ResolvedEdgeStyle, type ResolvedOptions } from "./options";
export type { ResolvedPalette } from "./renderer-pixi/tint";
// The types the records above are built from, so tooling can name them without the main entry.
export type { ScreenPoint } from "./camera/camera";
export type { ExplorerBox, ExplorerLayout } from "./scene/layout";
export type { ParentLink, SceneSource } from "./scene/source";
export type * from "./scene/types";
export type * from "./options";
export type { ExplorerPalette, GlowSwitches, NodeShape, RampColours, RampInterpolation, RampStop } from "./renderer-pixi/tint";
