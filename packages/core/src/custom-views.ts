// Custom renderers' lifecycle — US071 Step 7 (ADR-016 A25 clause 2).
//
// Pure and generic over the view type, so pooling, the lifecycle order, error isolation and the
// visible-count cap are tested with plain objects. `renderer-pixi/custom.ts` supplies the
// PixiJS containers and attaches them; nothing here knows what a view is.

/** What one item renderer is given each drawn frame. All numbers, never a PixiJS object, except
 *  `texture`, which is whatever the renderer itself works with (a PixiJS `Texture` in practice). */
export interface ItemFrame<Tex = unknown> {
  /** The item's diameter in world units: draw centred on (0, 0) at this size. In a box that is not
   *  square, the largest circle or square that fits it. */
  size: number;
  /** The width of the item's box in world units, centred on (0, 0). Equal to `size` when square. */
  width: number;
  /** The height of the item's box in world units, centred on (0, 0). Equal to `size` when square. */
  height: number;
  /** The same, in screen pixels: for choosing level of detail. */
  screenSize: number;
  /** 0 to 1, already applied to the view by the package; for a renderer that fades parts. */
  opacity: number;
  /** Whether the mouse is over the item. */
  hovered: boolean;
  /** Whether the item is selected. */
  selected: boolean;
  /** `performance.now()` for this frame. */
  timeMs: number;
  /** The colour the item would have been drawn in (its `color`, ramp or per-id tint). */
  tint: number | null;
  /** The item's `texture`, loaded and cropped to a disc, when it is big enough and ready. */
  texture: Tex | null;
  /** Hold still: the viewer asked for less motion. */
  reducedMotion: boolean;
}

/** One kind's renderer, over any view type `V` (`./pixi` specialises it to PixiJS containers). */
export interface ItemRenderer<V, Item, Tex = unknown, Kit = unknown> {
  /** Makes one view. Called when a pool needs one more, not once per item: a view is reused for
   *  whichever item it is given next, so keep per-item state in `update`, not here. `kit` holds
   *  the renderer's own classes (for PixiJS, `Container`, `Graphics` and the rest), so a renderers
   *  module can build views without importing the renderer library itself. */
  create(kit: Kit): V;
  /** Brings the view up to date for `item` this frame. */
  update(view: V, item: Item, frame: ItemFrame<Tex>): void;
  /** Releases whatever `create` made, when a pool shrinks or the explorer unmounts. */
  destroy?(view: V): void;
  /** Asks for the next frame while a view of this kind is on screen (never under reduced motion). */
  animated?: boolean;
}

export type RendererModule<V, Item, Tex = unknown, Kit = unknown> = Record<string, ItemRenderer<V, Item, Tex, Kit>>;

export interface ViewHost<V> {
  attach(view: V): void;
  detach(view: V): void;
  show(view: V, visible: boolean): void;
}

/** Hidden views kept per kind beyond what a frame used, before the extra are destroyed. */
const SPARE_VIEWS = 16;

/**
 * Pools of views by kind. Each frame: `begin`, then `draw` per item that has a custom kind (it
 * returns false when the item must fall back to its shape), then `end`, which hides the unused.
 * A renderer that throws is disabled for the rest of the session, its views released, and every
 * item of that kind falls back; it is reported once. So is a kind with no renderer.
 */
export function createViewPools<V, Item, Tex = unknown, Kit = unknown>(host: ViewHost<V>, warn: (message: string) => void = console.warn, kit?: Kit) {
  let module: RendererModule<V, Item, Tex, Kit> | null = null;
  const pools = new Map<string, { views: V[]; used: number }>();
  const disabled = new Set<string>();
  const warned = new Set<string>();
  let animatedOnScreen = false;

  function once(key: string, message: string) {
    if (warned.has(key)) return;
    warned.add(key);
    warn(message);
  }

  function release(kind: string, renderer: ItemRenderer<V, Item, Tex, Kit> | undefined) {
    const pool = pools.get(kind);
    if (!pool) return;
    for (const view of pool.views) {
      host.detach(view);
      try {
        renderer?.destroy?.(view);
      } catch {
        // A renderer that throws on the way out has nothing left to protect.
      }
    }
    pools.delete(kind);
  }

  function disable(kind: string, renderer: ItemRenderer<V, Item, Tex, Kit>, error: unknown) {
    disabled.add(kind);
    release(kind, renderer);
    once(`throw:${kind}`, `data-explorer: the renderer for kind "${kind}" threw, so items of that kind are drawn as their shape from now on. ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    /** The consumer's module, once its lazy import has resolved. */
    setModule(next: RendererModule<V, Item, Tex, Kit>) {
      module = next;
    },
    /** Whether `kind` will be drawn by a renderer (false before the module has loaded, too). */
    has(kind: string): boolean {
      if (!module || disabled.has(kind)) return false;
      if (module[kind]) return true;
      once(`missing:${kind}`, `data-explorer: no renderer for kind "${kind}" in the renderers module, so those items are drawn as their shape.`);
      return false;
    },
    begin() {
      animatedOnScreen = false;
      for (const pool of pools.values()) pool.used = 0;
    },
    /** Draws `item` with its kind's next pooled view. False means "draw the shape instead". */
    draw(kind: string, item: Item, frame: ItemFrame<Tex>, place: (view: V) => void): boolean {
      const renderer = module?.[kind];
      if (!renderer || disabled.has(kind)) return false;
      let pool = pools.get(kind);
      if (!pool) {
        pool = { views: [], used: 0 };
        pools.set(kind, pool);
      }
      try {
        let view = pool.views[pool.used];
        if (view === undefined) {
          view = renderer.create(kit as Kit);
          pool.views.push(view);
          host.attach(view);
        }
        renderer.update(view, item, frame);
        place(view);
        host.show(view, true);
        pool.used++;
      } catch (error) {
        disable(kind, renderer, error);
        return false;
      }
      if (renderer.animated && !frame.reducedMotion) animatedOnScreen = true;
      return true;
    },
    /** Hides the views this frame did not use, and destroys spares beyond a small margin. */
    end() {
      for (const [kind, pool] of pools) {
        for (let i = pool.used; i < pool.views.length; i++) host.show(pool.views[i]!, false);
        const keep = pool.used + SPARE_VIEWS;
        if (pool.views.length > keep) {
          const renderer = module?.[kind];
          for (const view of pool.views.splice(keep)) {
            host.detach(view);
            try {
              renderer?.destroy?.(view);
            } catch {
              // as in `release`
            }
          }
        }
      }
    },
    /** True when an `animated` renderer drew a view this frame. */
    animatedOnScreen: () => animatedOnScreen,
    /** Views alive across all kinds, for the stats overlay. */
    count(): number {
      let total = 0;
      for (const pool of pools.values()) total += pool.views.length;
      return total;
    },
    destroy() {
      for (const kind of [...pools.keys()]) release(kind, module?.[kind]);
    },
  };
}

/**
 * Which candidates get a custom view when there are more than `cap`: the ones nearest the middle
 * of the view, where the viewer is looking. The rest are drawn as their shape this frame.
 */
export function nearestFirst<T extends { key: string; distance: number }>(candidates: readonly T[], cap: number): Set<string> {
  if (candidates.length <= cap) return new Set(candidates.map((c) => c.key));
  return new Set([...candidates].sort((a, b) => a.distance - b.distance).slice(0, cap).map((c) => c.key));
}
