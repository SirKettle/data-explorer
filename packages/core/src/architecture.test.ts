import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * ADR-016 Decision 2 as amended by A24, enforced at the package boundary (US070 AC2/AC3). These
 * rules used to live in the PicaBase app's own `architecture.test.ts`, by folder path; they moved
 * here with the code. Each was seen failing first (a forbidden import or word added, the test
 * watched to go red, then removed) before being trusted.
 */

const SRC = import.meta.dir;

async function files(): Promise<string[]> {
  const found: string[] = [];
  for await (const file of new Glob("**/*.{ts,tsx}").scan({ cwd: SRC, onlyFiles: true })) found.push(file);
  return found.sort();
}

const read = (path: string) => Bun.file(`${SRC}/${path}`).text();

/** US072 Step 1 — test support code lives outside `src/` (`../test`) so it never ships; it is held
 *  to the same vocabulary rule as everything inside. */
const TEST_DIR = `${SRC}/../test`;
async function testSupportFiles(): Promise<string[]> {
  const found: string[] = [];
  for await (const file of new Glob("**/*.{ts,tsx}").scan({ cwd: TEST_DIR, onlyFiles: true })) found.push(file);
  return found.sort();
}
const isTest = (path: string) => path.includes(".test.");
const importLines = (source: string) => source.split("\n").filter((line) => /^\s*(import|export)\b.*\bfrom\s+["']/.test(line) || /\bimport\(\s*["']/.test(line));

describe("the data-explorer package boundary (ADR-016 A24)", () => {
  test("the tree being checked is not empty", async () => {
    const all = await files();
    expect(all.filter((p) => !isTest(p)).length).toBeGreaterThan(8);
  });

  test("nothing imports a consumer: no app code, no PicaBase packages, no query client, auth or analytics", async () => {
    const forbidden = [/["'](\.\.\/)+\.\.\/(apps|packages)\//, /["']@picabase\//, /["']@tanstack\//, /["']@clerk\//, /["']posthog-js["']/, /\/analytics["'/]/];
    const offences: string[] = [];
    for (const path of await files()) {
      for (const line of importLines(await read(path))) {
        if (forbidden.some((pattern) => pattern.test(line))) offences.push(`${path}: ${line.trim()}`);
      }
    }
    expect(offences).toEqual([]);
  });

  // US071 / A25 clause 5 — each Pixi-importing file is named here, each addition seen failing first.
  const PIXI_FILES = new Set(["renderer-pixi/renderer.ts", "renderer-pixi/edges.ts", "renderer-pixi/textures.ts", "renderer-pixi/custom.ts"]);

  test("only the named renderer-pixi files import pixi.js; the pure tint module does not", async () => {
    const offences: string[] = [];
    for (const path of await files()) {
      if (PIXI_FILES.has(path) || path === "pixi.ts" || isTest(path)) continue;
      for (const line of importLines(await read(path))) {
        if (/["']pixi\.js["']/.test(line)) offences.push(`${path}: ${line.trim()}`);
      }
    }
    expect(offences).toEqual([]);
  });

  test("the renderer is reached only by the view's one dynamic import, never statically (ADR-016 A19, US047's lazy boundary)", async () => {
    const offences: string[] = [];
    for (const path of await files()) {
      if (path.startsWith("renderer-pixi/") || isTest(path)) continue;
      for (const line of importLines(await read(path))) {
        if (!/renderer-pixi\/(renderer|edges|textures|custom)["']/.test(line)) continue;
        const typeOnly = /^\s*import\s+type\b/.test(line);
        const dynamicInView = path === "DataExplorer.tsx" && /\bimport\(\s*["']\.\/renderer-pixi\/renderer["']\s*\)/.test(line);
        if (!typeOnly && !dynamicInView) offences.push(`${path}: ${line.trim()}`);
      }
    }
    expect(offences).toEqual([]);
  });

  /** US071 / A25 clause 2 — `./pixi` is for consumers' renderer modules only. It may name PixiJS
   *  types, never load PixiJS, and nothing in the package imports it, so the main and `./headless`
   *  entries can never reach it. */
  test("the ./pixi entry imports pixi.js only as types, and nothing in the package imports it", async () => {
    const offences: string[] = [];
    for (const line of importLines(await read("pixi.ts"))) {
      if (/["']pixi\.js["']/.test(line) && !/^\s*import\s+type\b/.test(line)) offences.push(`pixi.ts: ${line.trim()}`);
    }
    for (const path of await files()) {
      if (path === "pixi.ts" || isTest(path)) continue;
      for (const line of importLines(await read(path))) {
        if (/["'](\.\.?\/)+pixi["']/.test(line)) offences.push(`${path}: ${line.trim()}`);
      }
    }
    expect(offences).toEqual([]);
  });

  test("scene/ imports only its own siblings", async () => {
    const offences: string[] = [];
    for (const path of (await files()).filter((p) => p.startsWith("scene/") && !isTest(p))) {
      for (const line of importLines(await read(path))) {
        if (!/from\s+["']\.\/[^./]/.test(line)) offences.push(`${path}: ${line.trim()}`);
      }
    }
    expect(offences).toEqual([]);
  });

  /**
   * US070 AC2 / A24 clause 2 — no LEGO or PicaBase vocabulary in code or strings, in source and
   * tests alike (AC4: no LEGO fixture anywhere in the package). Comments are prose and are
   * stripped first. The exact quoted kind strings are banned too, since `set` is too common a word
   * to ban outright.
   */
  test("no LEGO or PicaBase vocabulary in code or strings", async () => {
    const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const offences: string[] = [];
    for (const path of await files()) {
      if (path === "architecture.test.ts") continue; // this file names the words it bans
      stripComments(await read(path))
        .split("\n")
        .forEach((line, i) => {
          if (/theme|minifig|lego|rebrickable|picabase/i.test(line) || /["'`](theme|set|minifigure)["'`]/.test(line)) offences.push(`${path}:${i + 1}: ${line.trim()}`);
        });
    }
    for (const path of await testSupportFiles()) {
      stripComments(await Bun.file(`${TEST_DIR}/${path}`).text())
        .split("\n")
        .forEach((line, i) => {
          if (/theme|minifig|lego|rebrickable|picabase/i.test(line) || /["'`](theme|set|minifigure)["'`]/.test(line)) offences.push(`test/${path}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offences).toEqual([]);
  });
});
