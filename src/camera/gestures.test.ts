import "../test-setup";
import { describe, expect, mock, test } from "bun:test";
import { CameraRig, type ScreenPoint } from "./camera";
import { attachGestures, type GestureHooks } from "./gestures";

/**
 * US036 plan Step 3R.2 / D6 — hover, the one behaviour this file didn't already have coverage for
 * (`gestures.ts` itself had no test file before this step; pan/pinch/momentum stay covered by the
 * spike's own real-hardware tuning and this story's live verification, not retrofitted here).
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeHooks(overrides: Partial<GestureHooks> = {}) {
  const onHover = mock((_point: ScreenPoint | null) => {});
  const hooks: GestureHooks = {
    isLocked: () => false,
    onZoomIn: () => {},
    onZoomOut: () => {},
    onTap: () => {},
    onDoubleTap: () => {},
    onHover,
    ...overrides,
  };
  return { hooks, onHover };
}

function pointerMove(pointerId: number, x: number, y: number, pointerType = "mouse"): PointerEvent {
  return new PointerEvent("pointermove", { pointerId, clientX: x, clientY: y, pointerType, bubbles: true });
}

function pointerDown(pointerId: number, x: number, y: number, pointerType = "mouse"): PointerEvent {
  return new PointerEvent("pointerdown", { pointerId, clientX: x, clientY: y, pointerType, bubbles: true });
}

const viewport = { width: 800, height: 600 };

function setup(hooks: GestureHooks) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const rig = new CameraRig(() => viewport, { x: 0, y: 0, scale: 1 });
  const gestures = attachGestures(host, rig, hooks);
  return { host, rig, gestures };
}

describe("attachGestures hover (US036 plan Step 3R.2 / D6)", () => {
  test("a mouse pointermove with no pointer down fires onHover, throttled to once per frame regardless of how many moves arrive", async () => {
    const { hooks, onHover } = makeHooks();
    const { host } = setup(hooks);

    host.dispatchEvent(pointerMove(1, 10, 10));
    host.dispatchEvent(pointerMove(1, 20, 20));
    host.dispatchEvent(pointerMove(1, 30, 30));
    await sleep(30);

    expect(onHover).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledWith({ x: 30, y: 30 });
  });

  test("never fires for touch", async () => {
    const { hooks, onHover } = makeHooks();
    const { host } = setup(hooks);

    host.dispatchEvent(pointerMove(1, 10, 10, "touch"));
    await sleep(30);

    expect(onHover).not.toHaveBeenCalled();
  });

  test("a pointermove for a pointer that's already down (a drag) is not a hover", async () => {
    const { hooks, onHover } = makeHooks();
    const { host } = setup(hooks);

    host.dispatchEvent(pointerDown(1, 0, 0));
    host.dispatchEvent(pointerMove(1, 50, 50));
    await sleep(30);

    expect(onHover).not.toHaveBeenCalled();
  });

  test("a locked gesture surface reports no hover", async () => {
    const { hooks, onHover } = makeHooks({ isLocked: () => true });
    const { host } = setup(hooks);

    host.dispatchEvent(pointerMove(1, 10, 10));
    await sleep(30);

    expect(onHover).not.toHaveBeenCalled();
  });

  test("the pointer leaving the host clears the hover immediately, not throttled", () => {
    const { hooks, onHover } = makeHooks();
    const { host } = setup(hooks);

    host.dispatchEvent(new PointerEvent("pointerleave", { pointerType: "mouse", bubbles: true }));

    expect(onHover).toHaveBeenCalledTimes(1);
    expect(onHover).toHaveBeenCalledWith(null);
  });

  test("detach stops any in-flight hover callback from ever firing", async () => {
    const { hooks, onHover } = makeHooks();
    const { host, gestures } = setup(hooks);

    host.dispatchEvent(pointerMove(1, 10, 10));
    gestures.detach();
    await sleep(30);

    expect(onHover).not.toHaveBeenCalled();
  });
});
