import { describe, expect, test } from "bun:test";
import { cameraReporter, createActivateEvent } from "./events";

describe("event helpers (US071 AC6)", () => {
  test("an activate event starts allowed and stays prevented once preventDefault is called", () => {
    const event = createActivateEvent({ id: "a", label: "A", weight: 1, href: "/a", drillsInto: null, shape: "disc" }, "pointer");
    expect(event.defaultPrevented).toBe(false);
    event.preventDefault();
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);
    expect(event.source).toBe("pointer");
  });

  test("the camera reporter fires on a change only, with a copy of the camera", () => {
    const seen: { x: number; y: number; scale: number }[] = [];
    const report = cameraReporter((camera) => seen.push(camera));
    const camera = { x: 1, y: 2, scale: 1 };
    report(camera);
    report({ ...camera });
    camera.scale = 2;
    report(camera);
    report({ x: 1, y: 3, scale: 2 });
    expect(seen).toEqual([
      { x: 1, y: 2, scale: 1 },
      { x: 1, y: 2, scale: 2 },
      { x: 1, y: 3, scale: 2 },
    ]);
    seen[0]!.x = 99;
    report({ x: 1, y: 3, scale: 2 });
    expect(seen).toHaveLength(3);
  });
});
