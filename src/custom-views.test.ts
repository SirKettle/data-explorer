import { describe, expect, test } from "bun:test";
import { createViewPools, nearestFirst, type ItemFrame, type ItemRenderer } from "./custom-views";

/** US071 Step 7 / AC7 — the lifecycle, pooling and fallbacks, with plain objects for views. */

interface FakeView {
  id: number;
  drew: string[];
}

const frame = (overrides: Partial<ItemFrame> = {}): ItemFrame => ({
  size: 10,
  screenSize: 40,
  opacity: 1,
  hovered: false,
  selected: false,
  timeMs: 0,
  tint: null,
  texture: null,
  reducedMotion: false,
  ...overrides,
});

function setup(renderers: Record<string, ItemRenderer<FakeView, string>>) {
  const log: string[] = [];
  const warnings: string[] = [];
  let next = 0;
  const pools = createViewPools<FakeView, string>(
    {
      attach: (v) => log.push(`attach ${v.id}`),
      detach: (v) => log.push(`detach ${v.id}`),
      show: (v, visible) => log.push(`${visible ? "show" : "hide"} ${v.id}`),
    },
    (message) => warnings.push(message),
  );
  const planet: ItemRenderer<FakeView, string> = {
    create: () => {
      log.push(`create ${next}`);
      return { id: next++, drew: [] };
    },
    update: (view, item) => view.drew.push(item),
    destroy: (view) => log.push(`destroy ${view.id}`),
  };
  pools.setModule({ planet, ...renderers });
  return { pools, log, warnings };
}

describe("custom view pools (US071 AC7)", () => {
  test("a view is created once, reused next frame, and hidden when not needed", () => {
    const { pools, log } = setup({});
    pools.begin();
    expect(pools.draw("planet", "earth", frame(), () => {})).toBe(true);
    expect(pools.draw("planet", "mars", frame(), () => {})).toBe(true);
    pools.end();
    expect(log).toEqual(["create 0", "attach 0", "show 0", "create 1", "attach 1", "show 1"]);

    log.length = 0;
    pools.begin();
    pools.draw("planet", "venus", frame(), () => {});
    pools.end();
    expect(log).toEqual(["show 0", "hide 1"]); // reused, not recreated; the spare is hidden, not destroyed
    expect(pools.count()).toBe(2);
  });

  test("the package places each view after the renderer updates it", () => {
    const { pools } = setup({});
    const placed: string[] = [];
    pools.begin();
    pools.draw("planet", "earth", frame(), (view) => placed.push(`${view.id}:${view.drew.at(-1)}`));
    expect(placed).toEqual(["0:earth"]);
  });

  test("spares beyond a margin are destroyed when a scene needs far fewer views", () => {
    const { pools, log } = setup({});
    pools.begin();
    for (let i = 0; i < 30; i++) pools.draw("planet", `p${i}`, frame(), () => {});
    pools.end();
    log.length = 0;
    pools.begin();
    pools.draw("planet", "one", frame(), () => {});
    pools.end();
    expect(pools.count()).toBe(17); // one used, sixteen spare
    expect(log.filter((l) => l.startsWith("destroy"))).toHaveLength(13);
  });

  test("a kind with no renderer falls back, warning once", () => {
    const { pools, warnings } = setup({});
    expect(pools.has("comet")).toBe(false);
    expect(pools.has("comet")).toBe(false);
    expect(pools.draw("comet", "x", frame(), () => {})).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('"comet"');
  });

  test("a renderer that throws is disabled for good, its views released, and reported once", () => {
    let calls = 0;
    const { pools, log, warnings } = setup({
      fragile: {
        create: () => ({ id: 99, drew: [] }),
        update: () => {
          if (++calls === 2) throw new Error("boom");
        },
        destroy: (view) => log.push(`destroy ${view.id}`),
      },
    });
    pools.begin();
    expect(pools.draw("fragile", "a", frame(), () => {})).toBe(true);
    expect(pools.draw("fragile", "b", frame(), () => {})).toBe(false);
    expect(pools.has("fragile")).toBe(false);
    expect(pools.draw("fragile", "c", frame(), () => {})).toBe(false);
    expect(log).toContain("detach 99");
    expect(log).toContain("destroy 99");
    expect(warnings).toEqual([expect.stringContaining("boom")]);
    // Other kinds are unaffected.
    expect(pools.draw("planet", "earth", frame(), () => {})).toBe(true);
  });

  test("create is handed the host's kit, so a renderers module need not import the renderer library", () => {
    const kit = { Thing: class {} };
    const given: unknown[] = [];
    const pools = createViewPools<FakeView, string, unknown, typeof kit>({ attach: () => {}, detach: () => {}, show: () => {} }, () => {}, kit);
    pools.setModule({ k: { create: (k) => (given.push(k), { id: 1, drew: [] }), update: () => {} } });
    pools.begin();
    pools.draw("k", "item", frame(), () => {});
    pools.end();
    expect(given).toEqual([kit]);
  });

  test("nothing draws before the module has loaded", () => {
    const pools = createViewPools<FakeView, string>({ attach() {}, detach() {}, show() {} }, () => {});
    expect(pools.has("planet")).toBe(false);
    expect(pools.draw("planet", "x", frame(), () => {})).toBe(false);
  });

  test("an animated renderer on screen asks for frames, except under reduced motion", () => {
    const { pools } = setup({ spinner: { create: () => ({ id: 1, drew: [] }), update() {}, animated: true } });
    pools.begin();
    pools.draw("planet", "a", frame(), () => {});
    expect(pools.animatedOnScreen()).toBe(false);
    pools.draw("spinner", "b", frame(), () => {});
    expect(pools.animatedOnScreen()).toBe(true);
    pools.begin();
    pools.draw("spinner", "b", frame({ reducedMotion: true }), () => {});
    expect(pools.animatedOnScreen()).toBe(false);
  });

  test("destroy releases every view of every kind", () => {
    const { pools, log } = setup({});
    pools.begin();
    pools.draw("planet", "a", frame(), () => {});
    pools.end();
    pools.destroy();
    expect(log.slice(-2)).toEqual(["detach 0", "destroy 0"]);
    expect(pools.count()).toBe(0);
  });
});

describe("nearestFirst (US071 AC9)", () => {
  test("under the cap everyone gets a view; over it, the nearest to the middle", () => {
    const candidates = [
      { key: "far", distance: 90 },
      { key: "near", distance: 5 },
      { key: "mid", distance: 40 },
    ];
    expect(nearestFirst(candidates, 3)).toEqual(new Set(["far", "near", "mid"]));
    expect(nearestFirst(candidates, 2)).toEqual(new Set(["near", "mid"]));
    expect(nearestFirst(candidates, 0)).toEqual(new Set());
  });
});
