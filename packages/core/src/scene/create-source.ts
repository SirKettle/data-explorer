// `createSceneSource` — US072 review change 3.
//
// Every scene source needs a cache, because the explorer asks `isCached` before it loads anything
// it might only preview. Hand-writing one was the first thing every consumer did (each example in
// this repository imported the same private helper). This builds a whole `SceneSource` from the
// one function a consumer actually has to write, `load`, and owns the cache, `isCached`, refresh
// and invalidation. `SceneSource` itself is unchanged for sources that cache elsewhere.

import type { ParentLink, SceneSource } from "./source";
import type { ExplorerScene } from "./types";

/** What `createSceneSource` builds a scene source from. Only `load` is required. */
export interface SceneSourceOptions<F, D = unknown> {
  /** The scene for a focus (`null` is the top). Called once per focus until it is invalidated. */
  load(focus: F | null): ExplorerScene<F, D> | Promise<ExplorerScene<F, D>>;
  /** Where zooming out of `focus` leads (see `ParentLink`). Without it, nothing is above. */
  parentOf?(focus: F, current: ExplorerScene<F, D>): ParentLink<F> | Promise<ParentLink<F>>;
  /** A stable string per focus. Without it: `"root"` for `null`, the value itself for a string,
   *  `String()` for a number, and `JSON.stringify` for anything else (so give objects their own
   *  `keyOf` if their key order can vary). */
  keyOf?(focus: F | null): string;
  /** Resolve with a first part of a scene at once, then call `onUpdate` with fuller ones. Without
   *  it, the explorer waits for `load`. The cache holds the fullest scene seen so far. */
  loadStreaming?(focus: F, onUpdate: (scene: ExplorerScene<F, D>) => void): Promise<ExplorerScene<F, D>>;
}

/** A `SceneSource` that also lets you say its data changed. */
export interface CachedSceneSource<F, D = unknown> extends SceneSource<F, D> {
  /** Forget the cached scene for `focus`, or every cached scene, and have any explorer using this
   *  source reload what it shows, in place. Call it when your data changes. */
  invalidate(focus?: F | null): void;
}

function defaultKeyOf(focus: unknown): string {
  if (focus === null || focus === undefined) return "root";
  if (typeof focus === "string") return focus;
  if (typeof focus === "number" || typeof focus === "boolean" || typeof focus === "bigint") return String(focus);
  return JSON.stringify(focus);
}

/**
 * Builds a scene source from a `load` function. It caches each scene (a failed load is not cached,
 * so it is retried), answers `isCached`, and reloads what any explorer shows when you call
 * `invalidate()`. Implement `SceneSource` yourself only if your scenes are cached elsewhere.
 */
export function createSceneSource<F, D = unknown>(options: SceneSourceOptions<F, D>): CachedSceneSource<F, D> {
  const keyOf = options.keyOf ?? ((focus: F | null) => defaultKeyOf(focus));
  const cache = new Map<string, Promise<ExplorerScene<F, D>>>();
  const listeners = new Set<() => void>();

  /** Caches `promise` under `key`, and forgets it again if it fails, so a later call can retry. */
  function remember(key: string, promise: Promise<ExplorerScene<F, D>>): Promise<ExplorerScene<F, D>> {
    cache.set(key, promise);
    promise.catch(() => {
      if (cache.get(key) === promise) cache.delete(key);
    });
    return promise;
  }

  function loadScene(focus: F | null): Promise<ExplorerScene<F, D>> {
    const key = keyOf(focus);
    const cached = cache.get(key);
    if (cached) return cached;
    return remember(key, Promise.resolve().then(() => options.load(focus)));
  }

  const source: CachedSceneSource<F, D> = {
    keyOf,
    loadScene,
    isCached: (focus) => cache.has(keyOf(focus)),
    parentOf: async (focus, current) => (options.parentOf ? options.parentOf(focus, current) : { kind: "none" }),
    refreshScene(focus) {
      cache.delete(keyOf(focus));
      return loadScene(focus);
    },
    subscribeToInvalidation(onChange) {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
    invalidate(focus) {
      if (focus === undefined) cache.clear();
      else cache.delete(keyOf(focus));
      for (const listener of listeners) listener();
    },
  };

  const streaming = options.loadStreaming;
  if (streaming) {
    source.loadSceneStreaming = (focus, onUpdate) => {
      const key = keyOf(focus);
      const cached = cache.get(key);
      if (cached) return cached;
      const first = streaming(focus, (scene) => {
        cache.set(key, Promise.resolve(scene)); // the fullest scene seen so far
        onUpdate(scene);
      });
      return remember(key, first);
    };
  }
  return source;
}
