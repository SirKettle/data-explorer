/**
 * The size budget: what each entry costs a page up front (the entry and every chunk it imports
 * statically), and what the PixiJS renderer adds on first mount, gzipped, PixiJS and React not
 * included. A budget is a tripwire, not a target: raise it deliberately, in the same change that
 * needs it, and say why.
 *
 *   bun run build && bun run check:size
 */
import { join } from "node:path";
import { gzipSync } from "node:zlib";

/** KB gzipped. Set 2026-10-12 with about 20% headroom over the 0.1.0 build; `headless` raised
 *  2026-10-26 from 17 to 20 when fixed layouts and regions used up its headroom. */
const BUDGET = { index: 28, headless: 20, pixi: 1, renderer: 14 };

const dist = join(import.meta.dir, "../dist");
const read = (file: string) => Bun.file(join(dist, file)).text();
const STATIC = /(?:^|[;}\n])\s*(?:import|export)\s*(?:[^"'();]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g;

async function closure(entry: string): Promise<Set<string>> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of (await read(file)).matchAll(STATIC)) queue.push(match[1]!);
  }
  return seen;
}
async function gzipped(files: Iterable<string>): Promise<number> {
  let bytes = 0;
  for (const file of files) bytes += gzipSync(await Bun.file(join(dist, file)).bytes()).length;
  return bytes / 1024;
}

if (!(await Bun.file(join(dist, "index.js")).exists())) {
  console.error("check:size: no dist/; run `bun run build` first");
  process.exit(1);
}
const sizes: Record<keyof typeof BUDGET, number> = { index: 0, headless: 0, pixi: 0, renderer: 0 };
const upFront = await closure("index.js");
sizes.index = await gzipped(upFront);
sizes.headless = await gzipped(await closure("headless.js"));
sizes.pixi = await gzipped(await closure("pixi.js"));
const lazy = [...(await read("index.js")).matchAll(/import\(\s*["']\.\/([^"']+\.js)["']\s*\)/g)].map((m) => m[1]!);
if (lazy.length === 0) {
  console.error("check:size: the main entry has no lazy chunk: the PixiJS renderer is no longer lazy");
  process.exit(1);
}
const renderer = new Set<string>();
for (const chunk of lazy) for (const file of await closure(chunk)) if (!upFront.has(file)) renderer.add(file);
sizes.renderer = await gzipped(renderer);

let over = false;
for (const key of Object.keys(BUDGET) as (keyof typeof BUDGET)[]) {
  const ok = sizes[key] <= BUDGET[key];
  over ||= !ok;
  console.log(`${ok ? "ok  " : "OVER"} ${key.padEnd(9)} ${sizes[key].toFixed(1).padStart(5)} KB of ${BUDGET[key]} KB gzipped`);
}
if (over) process.exit(1);
