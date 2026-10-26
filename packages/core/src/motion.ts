// Motion preferences and the animated effects' timing — US071 Step 5 (ADR-016 A25 clause 7).
//
// Pure apart from one `matchMedia` read. The renderer draws on demand (no ticker), so an animated
// effect only keeps drawing while `wantsNextFrame` says so, and never under reduced motion.

/** The viewer asked the system for less motion. Read on each call, so a change applies at once. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** A pulse's level at `timeMs`, from 0 to 1 and back once per `periodMs`: a smooth breath, not a blink. */
export function pulseLevel(timeMs: number, periodMs: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * timeMs) / periodMs);
}

/** Whether the frame just drawn needs another: only while something on screen is still moving. */
export function wantsNextFrame(state: { growing: boolean; pulsingOnScreen: boolean; reducedMotion: boolean }): boolean {
  if (state.reducedMotion) return false;
  return state.growing || state.pulsingOnScreen;
}
