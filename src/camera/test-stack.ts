// `createTestStack` — US072 review change 4.
//
// Driving the scene stack from a test used to mean assembling a camera rig, loading the first
// scene yourself, and knowing that `enter` animates (so needs `requestAnimationFrame`, which Bun
// and Node do not have). The cold-start test spent three quarters of its effort there. This does
// the assembly, and every move it offers skips the animation, so a test needs no DOM and no clock.

import type { SceneSource } from "../scene/source";
import { CameraRig, type Viewport } from "./camera";
import { createSceneStack, type StackedScene } from "./scene-stack";

/** Where `createTestStack` starts, and the pretend screen it frames scenes in. */
export interface TestStackOptions<F> {
  /** Where to start; `null` (the top) by default. */
  focus?: F | null;
  /** The pretend screen the camera frames scenes in; 800 × 600 by default. */
  viewport?: Viewport;
}

/** A scene stack for tests and tooling: the same navigation the explorer does, without animation. */
export interface TestStack<F> {
  /** The scene the viewer is in: its `focus`, `heading`, laid-out `renderNodes` and the `scene` your source returned. */
  readonly current: StackedScene<F>;
  /** How many scenes deep the viewer is from where they started. */
  readonly depth: number;
  /** Enters the item `itemId` of the current scene, as a double-click would. A non-drillable item, or a failed load, leaves the stack where it was. */
  enter(itemId: string): Promise<StackedScene<F>>;
  /** Leaves the current scene the way it was entered; at the starting scene, asks your source's `parentOf`, as zooming out would. */
  zoomOut(): Promise<StackedScene<F>>;
  /** Moves sideways into a sibling of the current scene, as panning across into it would. */
  enterSibling(itemId: string): Promise<StackedScene<F>>;
  /** Jumps straight to a focus, as Back/Forward or a deep link would. */
  jumpTo(focus: F | null): Promise<StackedScene<F>>;
  /** The headings from the starting scene to the current one. */
  breadcrumb(): string[];
  /** The underlying stack and camera, for anything not covered above. */
  readonly stack: ReturnType<typeof createSceneStack<F>>;
  /** The camera. */
  readonly rig: CameraRig;
}

/**
 * A scene stack for tests and tooling, ready to drive: it loads the first scene, and every move
 * (`enter`, `zoomOut`, `enterSibling`, `jumpTo`) skips the animation, so it runs with no DOM and no
 * `requestAnimationFrame`.
 */
export async function createTestStack<F>(source: SceneSource<F>, options: TestStackOptions<F> = {}): Promise<TestStack<F>> {
  const viewport = options.viewport ?? { width: 800, height: 600 };
  const rig = new CameraRig(() => viewport, { x: 0, y: 0, scale: 1 });
  const focus = options.focus ?? null;
  const stack = createSceneStack<F>({ rig, source, initialFocus: focus, initialScene: await source.loadScene(focus), applyScene: () => {} });

  return {
    get current() {
      return stack.current;
    },
    get depth() {
      return stack.depth;
    },
    async enter(itemId) {
      await stack.enter(itemId, { approach: false });
      return stack.current;
    },
    async zoomOut() {
      if (stack.depth === 0) await stack.climbToParent();
      if (stack.depth > 0) await stack.leave(false);
      return stack.current;
    },
    async enterSibling(itemId) {
      await stack.enterSibling(itemId, { approach: false });
      return stack.current;
    },
    async jumpTo(target) {
      await stack.jumpTo(target);
      return stack.current;
    },
    breadcrumb: () => stack.breadcrumb().map((step) => step.heading),
    stack,
    rig,
  };
}
