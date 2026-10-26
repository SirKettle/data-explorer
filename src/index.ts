/**
 * @thirkettle/data-explorer — a continuous zoomable explorer for any tree- or graph-shaped data.
 *
 * Supply a `SceneSource` (how to load a scene for a focus, and where zooming out leads), render
 * `DataExplorer`, and the camera, gestures, transitions and the accessible outline are handled.
 * The canvas is drawn with PixiJS, loaded lazily the first time the view mounts.
 *
 * @packageDocumentation
 * @module main
 */
export { DataExplorer, type RenderersModule, type DataExplorerProps } from "./DataExplorer";
export type { ExplorerPresence } from "./presence";
export type { ParentLink, SceneSource } from "./scene/source";
export { createSceneSource, type CachedSceneSource, type SceneSourceOptions } from "./scene/create-source";
export {
  windowed,
  type ExplorerCluster,
  type ExplorerColour,
  type ExplorerEdge,
  type ExplorerEffect,
  type ExplorerEmphasis,
  type ExplorerItem,
  type ExplorerNode,
  type ExplorerOutline,
  type ExplorerPoint,
  type ExplorerScene,
  type ExplorerRect,
  type ExplorerShape,
  type ExplorerTexture,
  type ExplorerTruncation,
} from "./scene/types";
export { DEFAULT_RAMP, FALLBACK_PALETTE, type ExplorerPalette, type RampColours, type RampInterpolation, type RampStop, type ResolvedPalette } from "./renderer-pixi/tint";
export {
  type ExplorerBackground,
  type ExplorerBackgroundImage,
  type ExplorerCustomViews,
  type ExplorerLimits,
  type ExplorerEdges,
  type ExplorerEdgeStyle,
  type ExplorerEffects,
  type ExplorerGradient,
  type ExplorerTextures,
  type ExplorerGridOption,
  type ExplorerGridStyle,
  type ExplorerGridTile,
  type ExplorerGridTileModule,
  type ExplorerOptions,
} from "./options";
export type {
  ExplorerActivateEvent,
  ExplorerBackgroundClickEvent,
  ExplorerCameraEvent,
  ExplorerSceneEvent,
  NavigationDirection,
} from "./events";
