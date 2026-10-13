import { describe, expect, test } from "bun:test";
import { DEFAULT_OPTIONS, edgeStyleFor, optionsKey, resolveOptions } from "./options";

describe("resolveOptions (US071 AC1: defaults are what the renderer drew before options)", () => {
  test("pins every default to the constant it replaced in renderer.ts", () => {
    expect(resolveOptions()).toEqual({
      background: { color: null, gradient: null, image: null, grid: { visible: true, alpha: 0.22, color: null, step: 160, zoom: "snap", minScreenStep: 8, tile: null } },
      effects: {
        growIn: { enabled: true, durationMs: 420, staggerMs: 320, startScale: 0.1 },
        halo: { enabled: true, scale: 1.7, alpha: 0.3 },
        ring: { scale: 1.24 },
        hoverRing: { enabled: true, scale: 1.15, alpha: 0.55 },
        selectionRing: { enabled: true, scale: 1.34 },
        glow: { enabled: true, scale: 2.4, alpha: 0.7 },
        pulse: { enabled: true, periodMs: 1800, scaleBy: 0.3, alphaFloor: 0.45 },
      },
      edges: {
        visible: false,
        max: 500,
        style: { color: null, width: 1.5, alpha: 0.5, dash: null, arrow: "none", curve: 0 },
        styles: {},
      },
      textures: { minDiameterPx: 48, budget: 128 },
      customViews: { max: 200 },
    });
    expect(resolveOptions({})).toEqual(DEFAULT_OPTIONS);
    expect(resolveOptions({ background: {}, effects: {} })).toEqual(DEFAULT_OPTIONS);
  });

  test("returns a copy, so a resolved value can never alter the defaults", () => {
    const resolved = resolveOptions();
    resolved.effects.halo.alpha = 1;
    resolved.background.grid.visible = false;
    expect(DEFAULT_OPTIONS.effects.halo.alpha).toBe(0.3);
    expect(DEFAULT_OPTIONS.background.grid.visible).toBe(true);
  });

  test("the grid can be hidden or restyled", () => {
    expect(resolveOptions({ background: { grid: false } }).background.grid).toEqual({ ...DEFAULT_OPTIONS.background.grid, visible: false });
    expect(resolveOptions({ background: { grid: true } }).background.grid).toEqual(DEFAULT_OPTIONS.background.grid);
    expect(resolveOptions({ background: { grid: { alpha: 0.5 } } }).background.grid).toEqual({ ...DEFAULT_OPTIONS.background.grid, alpha: 0.5 });
    expect(resolveOptions({ background: { grid: {} } }).background.grid).toEqual(DEFAULT_OPTIONS.background.grid);
  });

  test("a grid alpha outside 0-1 is clamped, and a non-number falls back to the default", () => {
    expect(resolveOptions({ background: { grid: { alpha: 3 } } }).background.grid.alpha).toBe(1);
    expect(resolveOptions({ background: { grid: { alpha: -1 } } }).background.grid.alpha).toBe(0);
    expect(resolveOptions({ background: { grid: { alpha: Number.NaN } } }).background.grid.alpha).toBe(0.22);
  });

  test("each effect switches off on its own and keeps its geometry", () => {
    const off = resolveOptions({ effects: { growIn: false, halo: false, hoverRing: false, selectionRing: false } }).effects;
    expect(off.growIn).toEqual({ ...DEFAULT_OPTIONS.effects.growIn, enabled: false });
    expect(off.halo).toEqual({ ...DEFAULT_OPTIONS.effects.halo, enabled: false });
    expect(off.hoverRing).toEqual({ ...DEFAULT_OPTIONS.effects.hoverRing, enabled: false });
    expect(off.selectionRing).toEqual({ ...DEFAULT_OPTIONS.effects.selectionRing, enabled: false });
    expect(off.ring).toEqual(DEFAULT_OPTIONS.effects.ring);

    const onlyHalo = resolveOptions({ effects: { halo: false } }).effects;
    expect([onlyHalo.growIn.enabled, onlyHalo.halo.enabled, onlyHalo.hoverRing.enabled, onlyHalo.selectionRing.enabled]).toEqual([true, false, true, true]);
  });

  test("optionsKey is equal for equal resolved options, whatever objects they came from", () => {
    expect(optionsKey(resolveOptions({ effects: { halo: true } }))).toBe(optionsKey(resolveOptions()));
    expect(optionsKey(resolveOptions({ background: { grid: { alpha: 0.22 } } }))).toBe(optionsKey(resolveOptions()));
    expect(optionsKey(resolveOptions({ effects: { halo: false } }))).not.toBe(optionsKey(resolveOptions()));
  });

  test("background colour, gradient and image resolve, and anything unparseable is left out", () => {
    const resolved = resolveOptions({
      background: {
        color: "#102030",
        gradient: { from: "rgb(255, 0, 0)", to: 0x0000ff, angle: -90 },
        image: "/stars.png",
        grid: { color: "hsl(120, 100%, 25%)" },
      },
    }).background;
    expect(resolved.color).toBe(0x102030);
    expect(resolved.gradient).toEqual({ from: 0xff0000, to: 0x0000ff, angle: 270 });
    expect(resolved.image).toEqual({ url: "/stars.png", fit: "cover", alpha: 1 });
    expect(resolved.grid).toEqual({ ...DEFAULT_OPTIONS.background.grid, color: 0x008000 });

    expect(resolveOptions({ background: { gradient: { from: "#fff", to: "#000" } } }).background.gradient).toEqual({ from: 0xffffff, to: 0, angle: 180 });
    expect(resolveOptions({ background: { image: { url: "/t.png", fit: "tile", alpha: 2 } } }).background.image).toEqual({ url: "/t.png", fit: "tile", alpha: 1 });

    const junk = resolveOptions({ background: { color: "tomato", gradient: { from: "#fff", to: "nope" }, image: { url: "" }, grid: { color: "#12" } } }).background;
    expect(junk.color).toBeNull();
    expect(junk.gradient).toBeNull();
    expect(junk.image).toBeNull();
    expect(junk.grid.color).toBeNull();
  });

  test("edges: off by default; a kind's style is merged over the base style; junk falls back", () => {
    const edges = resolveOptions({
      edges: {
        visible: true,
        style: { color: "#fff", width: 2 },
        styles: { imports: { arrow: "end", curve: 0.2 }, "imported-by": { dash: [4, 3], color: "nope", width: -1, alpha: 5, curve: 9 } },
        max: 12.7,
      },
    }).edges;
    expect(edges.visible).toBe(true);
    expect(edges.max).toBe(12);
    expect(edges.style).toEqual({ color: 0xffffff, width: 2, alpha: 0.5, dash: null, arrow: "none", curve: 0 });
    expect(edgeStyleFor(edges, "imports")).toEqual({ color: 0xffffff, width: 2, alpha: 0.5, dash: null, arrow: "end", curve: 0.2 });
    expect(edgeStyleFor(edges, "imported-by")).toEqual({ color: 0xffffff, width: 2, alpha: 1, dash: [4, 3], arrow: "none", curve: 1 });
    expect(edgeStyleFor(edges, "unknown-kind")).toBe(edges.style);
    expect(resolveOptions({ edges: { max: -3 } }).edges.max).toBe(0);
  });

  test("textures: a minimum size and a budget, with junk falling back to the defaults", () => {
    expect(resolveOptions({ textures: { minDiameterPx: 80, budget: 12.9 } }).textures).toEqual({ minDiameterPx: 80, budget: 12 });
    expect(resolveOptions({ textures: { minDiameterPx: -5, budget: Number.NaN } }).textures).toEqual({ minDiameterPx: 48, budget: 128 });
    expect(resolveOptions({ textures: { budget: -1 } }).textures.budget).toBe(0);
  });

  test("a custom grid: step, zoom and a tile loader", () => {
    const tile = async () => ({ size: 64, draw: () => ({}) });
    const grid = resolveOptions({ background: { grid: { step: 32, zoom: "continuous", minScreenStep: 12, tile } } }).background.grid;
    expect(grid).toEqual({ ...DEFAULT_OPTIONS.background.grid, step: 32, zoom: "continuous", minScreenStep: 12, tile });
  });

  test("a bad step, zoom or tile falls back to the defaults", () => {
    // @ts-expect-error — deliberately wrong
    const grid = resolveOptions({ background: { grid: { step: -4, minScreenStep: Number.NaN, zoom: "nope", tile: "x" } } }).background.grid;
    expect(grid).toEqual(DEFAULT_OPTIONS.background.grid);
  });

  test("the key tells one tile loader from another, and the same loader from itself", () => {
    const a = async () => ({ size: 64, draw: () => ({}) });
    const b = async () => ({ size: 64, draw: () => ({}) });
    const key = (tile: typeof a) => optionsKey(resolveOptions({ background: { grid: { tile } } }));
    expect(key(a)).toBe(key(a));
    expect(key(a)).not.toBe(key(b));
    expect(key(a)).not.toBe(optionsKey(resolveOptions()));
  });
});
