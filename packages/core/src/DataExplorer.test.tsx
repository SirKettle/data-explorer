import "./test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { deepTree } from "../test/fixtures";
import type { ExplorerActivateEvent, ExplorerSceneEvent } from "./events";
import { FALLBACK_SURFACE_HEIGHT, DataExplorer } from "./DataExplorer";

afterEach(cleanup);

/**
 * US071 Step 2 / AC6 — the events that the keyboard path raises, through the real view. There is
 * no WebGL under happy-dom, so the canvas does not start and the outline is the whole surface:
 * exactly the keyboard route, with no pointer involved.
 */

async function mountAtRoot(props: Partial<Parameters<typeof DataExplorer<string>>[0]> = {}) {
  const view = render(<DataExplorer<string> source={deepTree()} focus={null} onSettle={() => {}} {...props} />);
  await waitFor(() => expect(view.container.querySelector("h2")?.textContent).toBe("/"));
  const link = Array.from(view.container.querySelectorAll<HTMLAnchorElement>("a[data-scene-outline-item]")).find((a) => a.textContent === "d1");
  if (!link) throw new Error("the outline has no entry for d1");
  return { ...view, link };
}

const PLAIN_PROTOTYPES = new Set([Object.prototype, Array.prototype, null]);

/** No class instances anywhere in a payload, so in particular no PixiJS object. */
function assertPlain(value: unknown, path = "event"): void {
  if (value === null || typeof value !== "object") return;
  expect({ path, plain: PLAIN_PROTOTYPES.has(Object.getPrototypeOf(value)) }).toEqual({ path, plain: true });
  for (const [key, child] of Object.entries(value)) assertPlain(child, `${path}.${key}`);
}

describe("DataExplorer events from the keyboard (US071 AC6)", () => {
  test("activating an outline entry raises onNodeActivate, then leaves the scene and enters the item", async () => {
    const log: string[] = [];
    let activated: ExplorerActivateEvent | null = null;
    const { link, container } = await mountAtRoot({
      onNodeActivate: (event) => {
        activated = event;
        log.push(`activate ${event.item.id} (${event.source})`);
      },
      onLeave: (event: ExplorerSceneEvent<string>) => log.push(`leave ${event.heading} (${event.direction})`),
      onEnter: (event: ExplorerSceneEvent<string>) => log.push(`enter ${event.heading} (${event.direction})`),
    });

    fireEvent.click(link, { button: 0 });
    await waitFor(() => expect(container.querySelector("h2")?.textContent).toBe("/d1"));

    expect(log).toEqual(["activate d1 (keyboard)", "leave / (in)", "enter /d1 (in)"]);
    expect(activated!.defaultPrevented).toBe(false);
    assertPlain(activated!.item, "event.item");
  });

  test("preventDefault stops the drill: no leave, no enter, and the scene stays where it was", async () => {
    const log: string[] = [];
    const { link, container } = await mountAtRoot({
      onNodeActivate: (event) => {
        event.preventDefault();
        log.push(`activate ${event.item.id}`);
      },
      onLeave: () => log.push("leave"),
      onEnter: () => log.push("enter"),
    });

    fireEvent.click(link, { button: 0 });
    // Longer than the enter's approach animation (500 ms), so an uncancelled drill would be done.
    await new Promise((resolve) => setTimeout(resolve, 900));

    expect(log).toEqual(["activate d1"]);
    expect(container.querySelector("h2")?.textContent).toBe("/");
  });

  test("scene event payloads are plain data", async () => {
    const events: ExplorerSceneEvent<string>[] = [];
    const { link, container } = await mountAtRoot({ onEnter: (event) => events.push(event), onLeave: (event) => events.push(event) });
    fireEvent.click(link, { button: 0 });
    await waitFor(() => expect(container.querySelector("h2")?.textContent).toBe("/d1"));
    expect(events.map((e) => e.focus)).toEqual([null, "/d1"]);
    events.forEach((event, i) => assertPlain(event, `events[${i}]`));
  });
});

describe("the renderers loader (US071 AC7/AC8)", () => {
  test("is called once when the canvas starts, not again on re-render", async () => {
    let calls = 0;
    const renderers = () => {
      calls++;
      return Promise.resolve({});
    };
    const { rerender } = await mountAtRoot({ renderers });
    rerender(<DataExplorer<string> source={deepTree()} focus={null} onSettle={() => {}} renderers={renderers} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toBe(1);
  });

  test("a module that fails to load leaves the outline working", async () => {
    const warn = console.warn;
    const warnings: unknown[] = [];
    console.warn = (...args: unknown[]) => void warnings.push(args[0]);
    try {
      const { container, link } = await mountAtRoot({ renderers: () => Promise.reject(new Error("offline")) });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(link).toBeDefined();
      expect(container.querySelector("h2")?.textContent).toBe("/");
      expect(warnings.some((w) => String(w).includes("renderers module failed"))).toBe(true);
    } finally {
      console.warn = warn;
    }
  });
});


describe("no consumer CSS needed (US072 Step 1 / AC2)", () => {
  test("the view gives itself the layout it needs inline, and a fallback height when nobody sized it", async () => {
    const { container } = await mountAtRoot();
    const wrapper = container.querySelector<HTMLElement>(".data-explorer")!;
    const surface = container.querySelector<HTMLElement>(".data-explorer__surface")!;
    const outline = container.querySelector<HTMLElement>("section[aria-label$='(list view)']")!;
    expect(wrapper.style.position).toBe("relative");
    expect([surface.style.width, surface.style.overflow, surface.style.touchAction]).toEqual(["100%", "hidden", "none"]);
    // happy-dom lays nothing out, so the surface measures 0 px tall: the fallback applies.
    expect(surface.style.height).toBe(FALLBACK_SURFACE_HEIGHT);
    expect([outline.style.position, outline.style.width, outline.style.overflow]).toEqual(["absolute", "1px", "hidden"]);
  });

  test("nothing in the package reads the page's URL", async () => {
    const offences: string[] = [];
    for await (const file of new Bun.Glob("**/*.{ts,tsx}").scan({ cwd: import.meta.dir, onlyFiles: true })) {
      if (file.includes(".test.")) continue;
      const code = await Bun.file(`${import.meta.dir}/${file}`).text();
      if (/\blocation\.(search|href|hash|pathname)|window\.location/.test(code)) offences.push(file);
    }
    expect(offences).toEqual([]);
  });
});

describe("onSettle is optional (US072 change 7)", () => {
  test("a view with no onSettle drills and settles without error", async () => {
    const view = render(<DataExplorer<string> source={deepTree()} focus={null} />);
    await waitFor(() => expect(view.container.querySelector("h2")?.textContent).toBe("/"));
    const link = Array.from(view.container.querySelectorAll<HTMLAnchorElement>("a[data-scene-outline-item]")).find((a) => a.textContent === "d1")!;
    fireEvent.click(link, { button: 0 });
    await waitFor(() => expect(view.container.querySelector("h2")?.textContent).toBe("/d1"));
    await new Promise((resolve) => setTimeout(resolve, 600)); // past the settle debounce (400 ms)
    expect(view.container.querySelector("h2")?.textContent).toBe("/d1");
  });
});

