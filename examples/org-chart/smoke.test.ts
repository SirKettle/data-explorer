import { describe, expect, test } from "bun:test";
import { createTestStack } from "@thirkettle/data-explorer/headless";
import { CEO_ID, DEPARTMENTS, TEAMS } from "./data";
import { itemId, orgChartSource } from "./source";

/**
 * Drives the explorer's scene stack without a canvas: enter a department, a team, then a person,
 * and check where the stack is each time. Written first, in US072's cold-start test, against
 * `createSceneStack` with a hand-made `requestAnimationFrame` polyfill; `createTestStack` (US072
 * change 4) made both unnecessary.
 */
const mount = () => createTestStack(orgChartSource(), { viewport: { width: 1000, height: 700 } });

describe("org chart, headless", () => {
  test("enters a department, a team, then a person", async () => {
    const stack = await mount();
    expect(stack.current.focus).toBeNull();
    expect(stack.current.heading).toBe("Rosa & Co.");

    const engineering = DEPARTMENTS.get("engineering")!;
    await stack.enter(itemId.department(engineering.id));
    expect(stack.current.focus).toEqual({ kind: "department", id: "engineering" });
    expect(stack.current.heading).toBe("Engineering");
    expect(stack.depth).toBe(1);

    const platform = TEAMS.get(engineering.teamIds[0]!)!;
    await stack.enter(itemId.team(platform.id));
    expect(stack.current.focus).toEqual({ kind: "team", id: platform.id });
    expect(stack.current.heading).toBe("Platform");

    await stack.enter(itemId.person(platform.leadId));
    expect(stack.current.focus).toEqual({ kind: "person", id: platform.leadId });
    // Radial: the lead in the middle, their head above and their team below.
    expect(stack.current.scene.focusId).toBe(itemId.person(platform.leadId));
    expect(stack.current.scene.edges.map((e) => e.kind).sort()).toEqual([
      ...Array(platform.memberIds.length - 1).fill("manages"),
      "reports-to",
    ]);

    // Walk up to the manager, then zoom out: back the way we came.
    await stack.enter(itemId.person(engineering.headId));
    expect(stack.current.focus).toEqual({ kind: "person", id: engineering.headId });
    await stack.zoomOut();
    expect(stack.current.focus).toEqual({ kind: "person", id: platform.leadId });
  });

  test("the CEO has no manager edge", async () => {
    const stack = await mount();
    await stack.enter(itemId.person(CEO_ID));
    expect(stack.current.scene.edges.every((e) => e.kind === "manages")).toBe(true);
  });
});
