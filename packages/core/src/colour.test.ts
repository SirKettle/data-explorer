import { describe, expect, test } from "bun:test";
import { parseColour, resolvePalette } from "./colour";
import { FALLBACK_PALETTE } from "./renderer-pixi/tint";

describe("parseColour (US071 Q3: numbers and CSS strings)", () => {
  test("numbers pass through when they are a 24-bit integer", () => {
    expect(parseColour(0x12ab34)).toBe(0x12ab34);
    expect(parseColour(0)).toBe(0);
    expect(parseColour(0xffffff)).toBe(0xffffff);
    expect(parseColour(0x1000000)).toBeNull();
    expect(parseColour(-1)).toBeNull();
    expect(parseColour(1.5)).toBeNull();
  });

  test("hex, short hex, rgb() and hsl(), in either separator style", () => {
    expect(parseColour("#12AB34")).toBe(0x12ab34);
    expect(parseColour(" #fa0 ")).toBe(0xffaa00);
    expect(parseColour("rgb(255, 128, 0)")).toBe(0xff8000);
    expect(parseColour("rgb(255 128 0 / 50%)")).toBe(0xff8000);
    expect(parseColour("rgba(100%, 0%, 0%, 0.2)")).toBe(0xff0000);
    expect(parseColour("hsl(0, 100%, 50%)")).toBe(0xff0000);
    expect(parseColour("hsl(240deg 100% 50%)")).toBe(0x0000ff);
    expect(parseColour("hsla(120, 100%, 25%, 0.5)")).toBe(0x008000);
  });

  test("anything else is not a colour", () => {
    for (const value of ["", "tomato", "#12", "#1234567", "rgb(1, 2)", "rgb(a, b, c)", "hsl(x, 1%, 1%)", "url(x)"]) expect(parseColour(value)).toBeNull();
    expect(parseColour(null)).toBeNull();
    expect(parseColour(undefined)).toBeNull();
  });
});

describe("resolvePalette (US072 change 5: palette colours as numbers or CSS strings)", () => {
  test("each colour may be a number or a CSS string; one that does not parse takes the fallback's", () => {
    const resolved = resolvePalette({ ...FALLBACK_PALETTE, background: "#102030", label: "rgb(255, 0, 0)", hover: "not a colour" });
    expect(resolved.background).toBe(0x102030);
    expect(resolved.label).toBe(0xff0000);
    expect(resolved.hover).toBe(FALLBACK_PALETTE.hover);
    expect(resolved.grid).toBe(FALLBACK_PALETTE.grid);
    expect(resolvePalette(FALLBACK_PALETTE)).toEqual(FALLBACK_PALETTE);
  });
});

