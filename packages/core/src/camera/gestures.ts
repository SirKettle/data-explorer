// Pointer/wheel/touch input -> camera, including momentum physics.
//
// Ported from `continuous-zoom-spike/main.ts`'s interaction block (US036 Step 1b, refined
// against real hardware) with every constant and every hard-won guard carried over verbatim.
// The findings those guards encode are recorded in that spike's MEASUREMENTS.md § Step 1b; the
// short version is in the comments below, because each one is a bug that came back the moment
// it was simplified away.
//
// Renderer-agnostic on purpose: this file knows about a host element and a `CameraRig`, nothing
// else. Everything mobile-specific that isn't already unified by Pointer Events (pinch, iOS
// Safari's own gesture/page-zoom events, double-tap) is handled explicitly here.

import { scheduleFrame, type CameraRig, type ScreenPoint } from "./camera";

export interface GestureHooks {
  /** True while a scripted camera motion or a tier transition owns the camera. */
  isLocked(): boolean;
  /** Called after any user-driven zoom-in step — where semantic "zoom into this" lives. */
  onZoomIn(): void;
  /** Called after any user-driven zoom-out step — where "pull back out of this" lives. */
  onZoomOut(): void;
  /** Fires `DOUBLE_TAP_MS` after a still release, *only* if no matching second tap arrived in
   *  that window — a single click/tap, confirmed. Whatever it hit (or didn't) is this hook's own
   *  business to hit-test; the gesture layer no longer needs to know, since double-tap detection
   *  applies uniformly regardless of what a tap hits (see this file's own note on `pendingTapTimer`). */
  onTap(point: ScreenPoint): void;
  /** A second tap within `DOUBLE_TAP_MS` and `DOUBLE_TAP_SLOP_PX` of the first — supersedes the
   *  pending `onTap` outright (it never fires for this pair). */
  onDoubleTap(point: ScreenPoint): void;
  /**
   * US036 plan Step 3R.2 / D6 — a mouse-only hover, `null` when the pointer leaves the host or a
   * hover-eligible move is no longer possible (a gesture is now locked/mid-transition). Never
   * fires for touch (no hover state to report) and never for a pointer already captured by a drag
   * — that path never reaches this hook at all (see `attachGestures`'s own `pointermove` branch).
   * Throttled to at most once per animation frame regardless of how many raw `pointermove` events
   * arrive in that window.
   */
  onHover?(point: ScreenPoint | null): void;
  /** Optional diagnostics sink — the spike's HUD uses it to show why momentum did/didn't fire. */
  onDiagnostic?(info: Record<string, unknown>): void;
}

export interface GestureState {
  dragging: boolean;
  pinching: boolean;
  pointers: number;
  momentumSpeed: number;
  lastInput: string;
}

// ---- momentum tuning (all carried over from the DOM spike's real-hardware refinement) ------

const MOMENTUM_FRICTION_PER_16MS = 0.93;
const MOMENTUM_MIN_SPEED = 0.02; // px/ms — below this the glide stops
const MOMENTUM_LAUNCH_MIN_SPEED = 0.05; // px/ms — below this a release reads as a deliberate stop
// Scale momentum is a continuous log-rate (d(ln scale)/dt), not scale-per-ms: zoom reads
// exponentially, so decaying the rate of the *exponent* is what keeps deceleration feeling even
// at both high and low zoom.
const MOMENTUM_MIN_SCALE_RATE = 0.00005;
const MOMENTUM_LAUNCH_MIN_SCALE_RATE = 0.0002;
// Two fingers of a pinch rarely lift in unison; the brief single-finger tail is not a pan.
const MOMENTUM_MIN_SINGLE_FINGER_MS = 50;
// macOS three-finger-drag reports `pointerType: "mouse"` but releases its virtual button long
// after the fingers left the trackpad (measured: 838 ms and 2,405 ms). Gate momentum on time
// since the last actual movement, not on gesture duration.
const MOMENTUM_MAX_RELEASE_GAP_MS = 120;
// Real two-finger touch pinches land with more initial punch than a trackpad's; damped on touch
// only (`pointerType === "touch"` is unambiguous — one mouse can't produce two pointer IDs).
const PINCH_MOMENTUM_TOUCH_DAMPING = 0.5;

const WHEEL_ZOOM_SENSITIVITY = 0.0015;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 40;
const DRAG_SLOP_PX = 3; // a tap on a phone is never perfectly still

export function attachGestures(host: HTMLElement, rig: CameraRig, hooks: GestureHooks) {
  // US036 plan Step 3R.1 Step 3 — production components mount/unmount (leaving `/visual-explorer`,
  // switching context), unlike the spike's single-page app, so every listener below is registered
  // against one `AbortController` signal: `detach()` removes all of them in one call rather than
  // needing a second, easy-to-miss removal for each `addEventListener` call site.
  const abortController = new AbortController();
  const { signal } = abortController;

  let dragging = false;
  let dragMoved = false;
  let lastX = 0;
  let lastY = 0;
  let lastInput = "none";
  const activePointers = new Map<number, { x: number; y: number }>();

  let velocityX = 0;
  let velocityY = 0;
  let lastMoveTime = 0;
  let singleFingerSince = 0;
  let momentumToken = 0;
  let momentumSpeed = 0;

  let pinchActive = false;
  let pinchIsTouch = false;
  let pinchDistance = 0;
  let pinchMidpoint: ScreenPoint = { x: 0, y: 0 };
  let pinchLastMoveTime = 0;
  let pinchVelocityX = 0;
  let pinchVelocityY = 0;
  let pinchScaleLogRate = 0;
  let pinchEndVelocityX = 0;
  let pinchEndVelocityY = 0;
  let pinchEndScaleLogRate = 0;
  let pinchEndScreen: ScreenPoint = { x: 0, y: 0 };

  let lastTapTime = 0;
  let lastTapPoint: ScreenPoint = { x: 0, y: 0 };
  // US036 — click/double-click disambiguation. `onTap` used to fire immediately on every release,
  // with double-tap detection only ever applying to a genuine miss (hitting nothing); that made
  // "tap a node" and "double-tap a node" indistinguishable — a second tap on a node just re-ran
  // `onTap`, never `onDoubleTap`. Every tap (hit or miss) now waits out `DOUBLE_TAP_MS` before
  // committing to `onTap`, so a following second tap in the same spot can supersede it with
  // `onDoubleTap` instead — the standard click/dblclick pattern, applied uniformly rather than
  // only off the empty canvas.
  //
  // **Deliberately unresolved for touch specifically.** This delay applies identically to mouse
  // clicks and touch taps — Pointer Events don't distinguish here, and no touch-specific tuning
  // has been decided. A ~300ms wait before a tap's own effect lands is a standard desktop
  // click/dblclick pattern; whether that is the right feel on a touchscreen (versus, say, a
  // press-and-hold for "select" so a tap can stay instant) is an open product question, not
  // answered by this change.
  let pendingTapTimer: ReturnType<typeof setTimeout> | null = null;

  // D6 — one scheduled hover callback in flight at a time; a burst of raw `pointermove` events
  // between frames only ever updates `pendingHoverPoint`, never queues a second `scheduleFrame`.
  let hoverScheduled = false;
  let pendingHoverPoint: ScreenPoint | null = null;

  // Cached to keep `pointermove` off the layout-read path entirely. The host need not be fixed or
  // full-viewport, and the page around it can still be settling after attach (a header, fonts, an
  // image above it), so the rect is re-read at the start of every gesture — pointerdown, wheel and
  // pointerenter — and on resize and scroll, never trusted from attach time alone.
  let rect = host.getBoundingClientRect();
  const refreshRect = () => {
    rect = host.getBoundingClientRect();
  };

  const local = (clientX: number, clientY: number): ScreenPoint => ({ x: clientX - rect.left, y: clientY - rect.top });

  /** D6 — a `pointermove` with no active pointer at all (no button/finger down) is a hover, never
   *  a drag: mouse-only, and a no-op while a gesture is locked (mid-transition), since hit-testing
   *  against a scene that's about to be replaced would name the wrong thing. */
  function handleHoverMove(e: PointerEvent) {
    if (e.pointerType !== "mouse" || !hooks.onHover) return;
    if (hooks.isLocked()) return;
    pendingHoverPoint = local(e.clientX, e.clientY);
    if (hoverScheduled) return;
    hoverScheduled = true;
    scheduleFrame(() => {
      hoverScheduled = false;
      if (signal.aborted) return; // detached mid-flight — never call back into an unmounted caller
      hooks.onHover?.(pendingHoverPoint);
    });
  }

  function stopMomentum() {
    momentumToken++;
    momentumSpeed = 0;
  }

  /** Exponential-decay glide. Deliberately not built on the tween helper: momentum is
   *  open-ended and physics-driven (it decays until slow enough to stop), not a scripted A-to-B
   *  motion over a fixed duration. `scaleLogRate`/`scaleAnchor` are only supplied when a pinch
   *  itself ended, in which case the zoom keeps going too, anchored at a FIXED screen point
   *  (wherever the pinch's midpoint last was) so the maths matches the live handler's own
   *  zoom-to-pointer solve exactly. */
  function startMomentum(
    vx0: number,
    vy0: number,
    scaleLogRate0 = 0,
    scaleAnchor: ScreenPoint = { x: rig.viewport.width / 2, y: rig.viewport.height / 2 },
  ) {
    const hasPan = Math.hypot(vx0, vy0) >= MOMENTUM_LAUNCH_MIN_SPEED;
    const hasZoom = Math.abs(scaleLogRate0) >= MOMENTUM_LAUNCH_MIN_SCALE_RATE;
    if (!hasPan && !hasZoom) return;

    const token = ++momentumToken;
    let vx = vx0;
    let vy = vy0;
    let scaleLogRate = scaleLogRate0;
    let last = performance.now();

    function step(now: number) {
      if (token !== momentumToken) return; // superseded by a new gesture or a scripted motion
      if (hooks.isLocked() || dragging || activePointers.size > 0) {
        momentumSpeed = 0;
        return;
      }
      const dt = Math.min(64, now - last); // clamp a stalled-frame gap so it can't fling the camera
      last = now;
      const decay = Math.pow(MOMENTUM_FRICTION_PER_16MS, dt / 16);
      vx *= decay;
      vy *= decay;
      scaleLogRate *= decay;
      momentumSpeed = Math.hypot(vx, vy);

      rig.panByScreen(vx * dt, vy * dt);

      if (Math.abs(scaleLogRate) > MOMENTUM_MIN_SCALE_RATE) {
        const factor = Math.exp(scaleLogRate * dt);
        rig.zoomAtScreen(scaleAnchor, factor);
        if (factor > 1) hooks.onZoomIn();
        else hooks.onZoomOut();
      }

      if (Math.hypot(vx, vy) > MOMENTUM_MIN_SPEED || Math.abs(scaleLogRate) > MOMENTUM_MIN_SCALE_RATE) {
        scheduleFrame(step);
      } else {
        momentumSpeed = 0;
      }
    }
    scheduleFrame(step);
  }

  const distance = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a: ScreenPoint, b: ScreenPoint): ScreenPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  host.addEventListener("pointerdown", (e) => {
    if (hooks.isLocked()) return;
    stopMomentum(); // a new touch always takes over, exactly like native scrolling
    refreshRect();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastInput = e.pointerType;
    try {
      host.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic pointer events (browser automation) have no platform pointer session behind
      // them and throw here. Harmless to skip: capture only matters for a pointer leaving the
      // element's bounds, which synthetic dispatches don't exercise.
    }

    if (activePointers.size === 2) {
      dragging = false;
      pinchActive = true;
      pinchIsTouch = e.pointerType === "touch";
      const [a, b] = [...activePointers.values()] as [ScreenPoint, ScreenPoint];
      pinchDistance = distance(a, b);
      pinchMidpoint = midpoint(a, b);
      pinchVelocityX = 0;
      pinchVelocityY = 0;
      pinchScaleLogRate = 0;
      pinchLastMoveTime = performance.now();
    } else if (activePointers.size === 1 && !pinchActive) {
      dragging = true;
      dragMoved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      velocityX = 0;
      velocityY = 0;
      lastMoveTime = performance.now();
      singleFingerSince = lastMoveTime;
      host.classList.add("dragging");
    }
  }, { signal });

  host.addEventListener("pointermove", (e) => {
    if (!activePointers.has(e.pointerId)) {
      handleHoverMove(e);
      return;
    }
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size >= 2) {
      const [a, b] = [...activePointers.values()] as [ScreenPoint, ScreenPoint];
      const newMidpoint = midpoint(a, b);
      const newDistance = distance(a, b);

      // Two independent steps, never one combined formula. Recomputing "zoom to the current
      // midpoint" fresh each frame is algebraically a no-op for pure translation — with no
      // distance change, solving "keep the world point under the new midpoint fixed" reduces to
      // camera unchanged. That was the real cause of "it's one or the other": panning during a
      // two-finger gesture literally did nothing while the pinch distance stayed constant.
      // Step 1: translate by the midpoint's own screen delta, exactly like a one-finger pan.
      rig.panByScreen(newMidpoint.x - pinchMidpoint.x, newMidpoint.y - pinchMidpoint.y);
      // Step 2: zoom around the (now-panned) midpoint by the distance ratio.
      const zoomFactor = pinchDistance > 0 ? newDistance / pinchDistance : 1;
      const anchor = local(newMidpoint.x, newMidpoint.y);
      rig.zoomAtScreen(anchor, zoomFactor);

      const now = performance.now();
      const dt = now - pinchLastMoveTime;
      pinchLastMoveTime = now;
      if (dt > 0) {
        // Smoothed, not the raw last sample: one noisy delta at release would otherwise fling
        // momentum in a direction the gesture never intended.
        pinchVelocityX = pinchVelocityX * 0.7 + ((newMidpoint.x - pinchMidpoint.x) / dt) * 0.3;
        pinchVelocityY = pinchVelocityY * 0.7 + ((newMidpoint.y - pinchMidpoint.y) / dt) * 0.3;
        pinchScaleLogRate = pinchScaleLogRate * 0.7 + (Math.log(zoomFactor) / dt) * 0.3;
      }

      pinchDistance = newDistance;
      pinchMidpoint = newMidpoint;
      if (zoomFactor > 1) hooks.onZoomIn();
      else if (zoomFactor < 1) hooks.onZoomOut();
      return;
    }

    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (Math.abs(dx) > DRAG_SLOP_PX || Math.abs(dy) > DRAG_SLOP_PX) dragMoved = true;
    lastX = e.clientX;
    lastY = e.clientY;

    const now = performance.now();
    const dt = now - lastMoveTime;
    lastMoveTime = now;
    if (dt > 0) {
      velocityX = velocityX * 0.7 + (dx / dt) * 0.3;
      velocityY = velocityY * 0.7 + (dy / dt) * 0.3;
    }

    rig.panByScreen(dx, dy);
  }, { signal });

  function endPointer(e: PointerEvent) {
    activePointers.delete(e.pointerId);
    dragging = false;
    host.classList.remove("dragging");

    if (activePointers.size >= 1) {
      // A pinch just ended with a finger still down — not a tap. Snapshot the pinch's own
      // velocities and last screen position NOW, before that two-pointer state is gone: the
      // final release needs them if this turns out to be a pinch ending rather than a genuine
      // continued one-finger pan (`singleFingerSince` decides which, below). Resume panning
      // from where the remaining finger actually is, not a stale lastX/lastY.
      dragMoved = true;
      if (activePointers.size === 1) {
        const damping = pinchIsTouch ? PINCH_MOMENTUM_TOUCH_DAMPING : 1;
        pinchEndVelocityX = pinchVelocityX * damping;
        pinchEndVelocityY = pinchVelocityY * damping;
        pinchEndScaleLogRate = pinchScaleLogRate * damping;
        pinchEndScreen = local(pinchMidpoint.x, pinchMidpoint.y);

        const [p] = [...activePointers.values()] as [ScreenPoint];
        lastX = p.x;
        lastY = p.y;
        velocityX = 0;
        velocityY = 0;
        lastMoveTime = performance.now();
        singleFingerSince = lastMoveTime;
        dragging = true;
        host.classList.add("dragging");
      }
      return;
    }

    // The last finger lifted. Two distinct momentum sources, not one "was there a drag" check:
    //  - single-finger for long enough -> plain pan momentum (a pinch that continued as a
    //    deliberate one-finger pan counts, and is real and intentional);
    //  - single-finger for less than that -> the pinch's two fingers merely lifted a few ms
    //    apart, so use the PINCH's snapshotted velocity (position AND scale) instead, so a
    //    fling-while-zooming keeps zooming rather than losing that motion entirely.
    if (dragMoved) {
      const sinceSingleFinger = performance.now() - singleFingerSince;
      const sinceLastMove = performance.now() - lastMoveTime;
      const eligibleForPan = sinceSingleFinger >= MOMENTUM_MIN_SINGLE_FINGER_MS;
      const releaseWasPrompt = sinceLastMove <= MOMENTUM_MAX_RELEASE_GAP_MS;
      const usedPan = eligibleForPan && releaseWasPrompt;
      hooks.onDiagnostic?.({
        gesture: "release",
        pointerType: e.pointerType,
        sinceSingleFingerMs: Math.round(sinceSingleFinger),
        sinceLastMoveMs: Math.round(sinceLastMove),
        usedPan,
        pinchActiveAtRelease: pinchActive,
        panSpeed: Number(Math.hypot(velocityX, velocityY).toFixed(3)),
        pinchSpeed: Number(Math.hypot(pinchEndVelocityX, pinchEndVelocityY).toFixed(3)),
      });
      if (usedPan) startMomentum(velocityX, velocityY);
      else if (!eligibleForPan && pinchActive) {
        startMomentum(pinchEndVelocityX, pinchEndVelocityY, pinchEndScaleLogRate, pinchEndScreen);
      }
      pinchActive = false;
      return;
    }
    pinchActive = false;

    // A still release is a tap. Decided here rather than from a `click` listener: once
    // `setPointerCapture` is active the browser retargets the compatibility `click` to the
    // capturing element, so a listener anywhere below it never sees the tap at all.
    const point = local(e.clientX, e.clientY);
    const now = performance.now();

    if (now - lastTapTime <= DOUBLE_TAP_MS && distance(point, lastTapPoint) <= DOUBLE_TAP_SLOP_PX) {
      lastTapTime = 0;
      if (pendingTapTimer !== null) {
        clearTimeout(pendingTapTimer);
        pendingTapTimer = null;
      }
      hooks.onDoubleTap(point);
      return;
    }

    lastTapTime = now;
    lastTapPoint = point;
    if (pendingTapTimer !== null) clearTimeout(pendingTapTimer); // a stray third tap restarts the wait, it doesn't stack
    pendingTapTimer = setTimeout(() => {
      pendingTapTimer = null;
      hooks.onTap(point);
    }, DOUBLE_TAP_MS);
  }

  host.addEventListener("pointerup", endPointer, { signal });
  host.addEventListener("pointercancel", endPointer, { signal });

  // D6 — the pointer leaving the host entirely (not just going still) must clear whatever was
  // hovered; unlike `handleHoverMove` this is immediate, not throttled, since it fires at most
  // once per actual leave and a stale label lingering after the cursor is gone is worse than
  // one extra call.
  host.addEventListener("pointerenter", refreshRect, { signal });
  host.addEventListener(
    "pointerleave",
    (e) => {
      if (e.pointerType !== "mouse") return;
      pendingHoverPoint = null;
      hooks.onHover?.(null);
    },
    { signal },
  );

  host.addEventListener(
    "wheel",
    (e) => {
      // preventDefault unconditionally and BEFORE the lock check: returning early without it
      // let the browser's own scroll/pinch-zoom fire on top of the custom camera for every
      // wheel tick that arrived mid-transition, which is what the "flickering/jarring" report
      // traced back to — and real trackpad scrolling produces a lot of those.
      e.preventDefault();
      if (hooks.isLocked()) return;
      stopMomentum();
      lastInput = "wheel";
      refreshRect();
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      rig.zoomAtScreen(local(e.clientX, e.clientY), factor);
      if (factor > 1) hooks.onZoomIn();
      else if (factor < 1) hooks.onZoomOut();
    },
    { passive: false, signal },
  );

  // iOS Safari applies its own page pinch-zoom via non-standard gesture events, which
  // `touch-action: none` alone does not suppress; without this the whole page scales under the
  // canvas during a pinch. Long-press context menus and text selection are suppressed for the
  // same "this is a map surface, not a document" reason.
  const suppress = (e: Event) => e.preventDefault();
  for (const type of ["gesturestart", "gesturechange", "gestureend", "contextmenu", "dblclick", "selectstart"]) {
    host.addEventListener(type, suppress, { signal });
  }
  window.addEventListener("resize", refreshRect, { signal });
  window.addEventListener("orientationchange", refreshRect, { signal });
  // Capture phase so a scrolling ancestor, not only the window, moves the cached rect too.
  window.addEventListener("scroll", refreshRect, { capture: true, passive: true, signal });

  return {
    /** Removes every listener this call registered (host + window) in one shot — required now
     *  that this surface lives inside a mountable/unmountable React component rather than the
     *  spike's page-lifetime script. */
    detach() {
      abortController.abort();
      if (pendingTapTimer !== null) clearTimeout(pendingTapTimer); // a tap awaiting its double-tap window must not fire onTap after unmount
    },
    stopMomentum,
    /** Programmatic zoom used by the on-screen +/- buttons (mobile has no wheel). */
    zoomStep(factor: number) {
      stopMomentum();
      const vp = rig.viewport;
      rig.zoomAtScreen({ x: vp.width / 2, y: vp.height / 2 }, factor);
      if (factor > 1) hooks.onZoomIn();
      else hooks.onZoomOut();
    },
    zoomAt(point: ScreenPoint, factor: number) {
      rig.zoomAtScreen(point, factor);
    },
    state(): GestureState {
      return {
        dragging,
        pinching: pinchActive,
        pointers: activePointers.size,
        momentumSpeed,
        lastInput,
      };
    },
  };
}

export type GestureHandle = ReturnType<typeof attachGestures>;
