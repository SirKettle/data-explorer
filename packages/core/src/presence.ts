// Presence: how much of an item is "there", from 0 to 1, without moving it. The layout is computed
// from `weight` once per scene; presence only scales and fades what is drawn, so a host can change
// it on every frame (a time slider, a filter) while every item keeps its place.

/**
 * An item's presence by its id, from 0 to 1. `undefined` means 1, fully present. Read on every
 * draw: pass a new function to the explorer when the answer changes, and items ease to it.
 */
export type ExplorerPresence = (id: string) => number | undefined;

/** How an absent item (presence 0) is drawn: small and faint, but still there and still reachable.
 *  Its opacity sits under the renderer's label threshold (0.15), so a ghost is never labelled. */
export const PRESENCE_GHOST = { scale: 0.4, alpha: 0.14 } as const;

/** How long a change of presence takes to settle, in ms (an exponential approach's time constant). */
export const PRESENCE_EASE_MS = 140;

/** The longest frame the easing will credit, so a change after the canvas sat idle still eases. */
export const MAX_PRESENCE_FRAME_MS = 34;

/**
 * The size and opacity multipliers for a presence. Size follows the square root, so an item's
 * **area** is proportional to its presence, the same rule weight uses for layout. Never smaller
 * than the ghost, so a nearly absent item does not vanish into a dot.
 */
export function presenceLook(presence: number): { scale: number; alpha: number } {
  const p = clampPresence(presence);
  if (p === 0) return { ...PRESENCE_GHOST };
  return {
    scale: Math.max(PRESENCE_GHOST.scale, Math.sqrt(p)),
    alpha: 0.55 + 0.45 * p,
  };
}

/** A host's presence answer made safe to draw: `undefined` and `NaN` are 1, and the rest is held to 0-1. */
export function clampPresence(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/**
 * One frame of easing from the presence on screen towards the target. Snaps when close, and at
 * once under reduced motion, so a still screen stops asking for frames.
 */
export function easePresence(shown: number, target: number, elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion || Math.abs(target - shown) < 0.01) return target;
  const step = 1 - Math.exp(-Math.max(0, elapsedMs) / PRESENCE_EASE_MS);
  return shown + (target - shown) * step;
}
