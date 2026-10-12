import "../test-setup";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ExplorerScene } from "../scene/types";
import { SceneOutline } from "./SceneOutline";

afterEach(cleanup);

/**
 * US036 plan Step 3R.1 Step 4 / ADR-016 A13 — checked against D4's own parity list, point by
 * point, the same shape `SceneView.test.tsx` already uses for the discrete surface.
 */
function buildScene(): ExplorerScene {
  return {
    id: "scene-1",
    heading: "The whole catalogue",
    clusters: [
      { id: "group-1", label: "Space", sublabel: null, weight: 120, marks: [], href: "/groups/space-abc", drillsInto: null, shape: "disc" as const, truncated: null },
      { id: "other", label: "Other groups", sublabel: null, weight: 8, marks: [], href: null, drillsInto: null, shape: "disc" as const, truncated: { shown: 10, total: 52 } },
    ],
    nodes: [{ id: "item-1", label: "Rocket", sublabel: "R-1", weight: 500, marks: [], href: "/items/rocket-def", drillsInto: null, shape: "disc" as const }],
    edges: [],
  };
}

describe("SceneOutline (US036 plan D3/D4)", () => {
  test("D4.1 — a navigable cluster/node renders as a real <a href>; a non-navigable aggregate renders as a real <button>", () => {
    const { container } = render(<SceneOutline scene={buildScene()} onActivate={() => {}} />);

    const groupLink = container.querySelector('a[href="/groups/space-abc"]');
    expect(groupLink).not.toBeNull();
    expect(groupLink?.textContent).toContain("Space");

    const setLink = container.querySelector('a[href="/items/rocket-def"]');
    expect(setLink).not.toBeNull();
    expect(setLink?.textContent).toContain("Rocket");

    const buttons = Array.from(container.querySelectorAll("button[data-scene-outline-item]"));
    expect(buttons.some((b) => b.textContent?.includes("Other groups"))).toBe(true);
    expect(container.querySelector('a[href="null"]')).toBeNull();
  });

  test("D4.4 — a windowed cluster still says shown of total, never silently truncated", () => {
    const { container } = render(<SceneOutline scene={buildScene()} onActivate={() => {}} />);
    expect(container.textContent).toContain("showing 10 of 52");
  });

  test("D4's activation: a plain click on a link intercepts and calls onActivate instead of navigating", () => {
    const onActivate = mock(() => {});
    const { container } = render(<SceneOutline scene={buildScene()} onActivate={onActivate} />);
    const link = container.querySelector('a[href="/groups/space-abc"]') as HTMLAnchorElement;
    fireEvent.click(link, { button: 0 });
    expect(onActivate).toHaveBeenCalledWith("group-1");
  });

  test("a modified click is left alone — the same 'open in a new tab still works' rule NodeView/RouteLink use", () => {
    const onActivate = mock(() => {});
    const { container } = render(<SceneOutline scene={buildScene()} onActivate={onActivate} />);
    const link = container.querySelector('a[href="/groups/space-abc"]') as HTMLAnchorElement;
    fireEvent.click(link, { button: 0, metaKey: true });
    expect(onActivate).not.toHaveBeenCalled();
  });

  test("D4.3 — focus moves to the heading and a polite live region announces it whenever scene.id changes", () => {
    const first = buildScene();
    const { container, rerender } = render(<SceneOutline scene={first} onActivate={() => {}} />);
    const heading = container.querySelector("h2")!;
    expect(document.activeElement).toBe(heading);

    const second: ExplorerScene = { ...first, id: "scene-2", heading: "Space" };
    rerender(<SceneOutline scene={second} onActivate={() => {}} />);
    const newHeading = container.querySelector("h2")!;
    expect(newHeading.textContent).toBe("Space");
    expect(document.activeElement).toBe(newHeading);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe("Space");
  });

  test("D4.2 — arrow keys traverse siblings in list order, wrapping at both ends", () => {
    const { container } = render(<SceneOutline scene={buildScene()} onActivate={() => {}} />);
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-scene-outline-item]"));
    expect(items.length).toBe(3);
    items[0]!.focus();
    fireEvent.keyDown(container.querySelector("ul")!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(container.querySelector("ul")!, { key: "ArrowLeft" });
    fireEvent.keyDown(container.querySelector("ul")!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(items[items.length - 1]); // wraps backwards past the first item
  });

  test("is presentational: imports nothing from api/, AuthContext or Clerk (US027's own view rule)", async () => {
    const source = await Bun.file(`${import.meta.dir}/SceneOutline.tsx`).text();
    for (const forbidden of ["/api/", "apiFetch", "AuthContext", "useSession", "@clerk/"]) {
      expect(source.includes(forbidden)).toBe(false);
    }
  });

  describe("relationships (US071 Step 4 / AC2)", () => {
    const radial = (): ExplorerScene => ({
      id: "focus-scene",
      heading: "Store",
      focusId: "store",
      clusters: [],
      nodes: [
        { id: "store", label: "store", weight: 1, marks: [], href: "/m/store", drillsInto: null, shape: "disc" as const },
        { id: "http", label: "http", weight: 1, marks: [], href: "/m/http", drillsInto: null, shape: "disc" as const },
        { id: "app", label: "app", weight: 1, marks: [], href: "/m/app", drillsInto: null, shape: "square" as const },
      ],
      edges: [],
    });
    const drawn = [
      { id: "e1", kind: "imports", sourceId: "store", targetId: "http" },
      { id: "e2", kind: "imported-by", sourceId: "app", targetId: "store" },
    ];

    test("each drawn edge is a link to its far end, the end that is not the focus", () => {
      const activated: string[] = [];
      const { container } = render(<SceneOutline scene={radial()} onActivate={(id) => activated.push(id)} edges={{ drawn, omitted: 0 }} />);
      const links = Array.from(container.querySelectorAll("h3 ~ ul a")).map((a) => [a.textContent, a.getAttribute("href")]);
      expect(links).toEqual([
        ["store — imports — http", "/m/http"],
        ["store — imported-by — app", "/m/app"],
      ]);
      fireEvent.click(container.querySelector('h3 ~ ul a[href="/m/app"]')!, { button: 0 });
      expect(activated).toEqual(["app"]);
      expect(container.textContent).not.toContain("Showing");
    });

    test("a capped scene says how many relationships it left out", () => {
      const { container } = render(<SceneOutline scene={radial()} onActivate={() => {}} edges={{ drawn: drawn.slice(0, 1), omitted: 7 }} />);
      expect(container.textContent).toContain("Showing 1 of 8 relationships");
    });

    test("with edges off, nothing is listed", () => {
      const { container } = render(<SceneOutline scene={radial()} onActivate={() => {}} edges={null} />);
      expect(container.querySelector("h3")).toBeNull();
    });
  });
});
