import { describe, expect, test } from "bun:test";
import type { ExplorerCluster, ExplorerNode } from "./types";
import { windowed } from "./types";

/**
 * Step 3's scene invariants. `ExplorerNode.href` being mandatory and `ExplorerCluster.truncated`
 * being a mandatory key are compile-time guarantees (a TypeScript object literal missing either
 * fails to typecheck) — this file tests the one runtime behaviour the model provides, `windowed`,
 * which is what every adapter level uses to populate `truncated` honestly.
 */
describe("windowed (US032 Step 3 / ADR-016 Decision 3)", () => {
  test("fewer items than the limit: truncated is null, nothing is dropped", () => {
    const result = windowed([1, 2, 3], 50);
    expect(result.shown).toEqual([1, 2, 3]);
    expect(result.truncated).toBeNull();
  });

  test("exactly the limit: still not truncated — the boundary is inclusive", () => {
    const result = windowed([1, 2, 3], 3);
    expect(result.shown).toEqual([1, 2, 3]);
    expect(result.truncated).toBeNull();
  });

  test("more items than the limit: truncated states exactly what was shown versus the total", () => {
    const items = Array.from({ length: 1078 }, (_, i) => i);
    const result = windowed(items, 50);
    expect(result.shown.length).toBe(50);
    expect(result.truncated).toEqual({ shown: 50, total: 1078 });
  });

  test("preserves the caller's order — it windows, it does not re-sort", () => {
    const result = windowed(["z", "a", "m"], 2);
    expect(result.shown).toEqual(["z", "a"]);
  });

  test("an empty input windows to an empty, non-truncated result", () => {
    const result = windowed([], 10);
    expect(result.shown).toEqual([]);
    expect(result.truncated).toBeNull();
  });
});

describe("scene type shape (US032 Step 3 / ADR-016 Decision 3)", () => {
  test("a node cannot be constructed without an href — compile-time, exercised here as a smoke test", () => {
    const node: ExplorerNode = { id: "n1", label: "Example item", weight: 7541, marks: [], href: "/items/abc123", drillsInto: null, shape: "disc" as const };
    expect(node.href).toBe("/items/abc123");
  });

  test("a non-navigable aggregate cluster carries href: null and a truthy truncated — the 'Other (N groups)' shape", () => {
    const other: ExplorerCluster = {
      id: "other",
      label: "Other",
      weight: 42,
      marks: [],
      href: null, drillsInto: null, shape: "disc" as const,
      truncated: { shown: 10, total: 52 },
    };
    expect(other.href).toBeNull();
    expect(other.truncated).not.toBeNull();
  });

  test("a real group cluster carries both an href and a null truncated when nothing was windowed", () => {
    const group: ExplorerCluster = {
      id: "group-1",
      label: "Space",
      weight: 120,
      marks: [],
      href: "/groups/space-abc123", drillsInto: null, shape: "disc" as const,
      truncated: null,
    };
    expect(group.href).not.toBeNull();
    expect(group.truncated).toBeNull();
  });
});
