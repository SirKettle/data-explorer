/**
 * Builds the package into `dist/`, which is what `package.json` exports and `npm pack` ships.
 *
 * - **JavaScript:** one ESM file per entry, plus shared chunks. The PixiJS renderer stays behind
 *   its dynamic import as a chunk of its own; `react` and `pixi.js` are peers, never bundled.
 * - **Types:** one rolled-up `.d.ts` per entry, from api-extractor, so no declaration imports an
 *   extensionless relative path (which Node's ESM resolution would reject). api-extractor runs
 *   without `--local`, so the build **fails** if the public API differs from `api/*.api.md`:
 *   run `bun run api:report` and commit the report when a change is meant.
 *
 *   bun run build
 */
import { $ } from "bun";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
const ENTRIES = ["index", "headless", "pixi"] as const;
const PEERS = ["react", "react/jsx-runtime", "react-dom", "pixi.js"];

await rm(dist, { recursive: true, force: true });
await rm(join(root, "temp"), { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// Types, checked against the API report.
await $`bunx tsc -p tsconfig.api.json`.cwd(root);
for (const entry of ENTRIES) {
  await $`bunx api-extractor run -c api-extractor.${entry}.json`.cwd(root).quiet();
  await cp(join(root, `temp/rollup/${entry}.d.ts`), join(dist, `${entry}.d.ts`));
}

// JavaScript.
const result = await Bun.build({
  entrypoints: ENTRIES.map((entry) => join(root, `src/${entry}.ts`)),
  outdir: dist,
  root: join(root, "src"),
  format: "esm",
  target: "browser",
  splitting: true,
  external: PEERS,
  naming: { entry: "[name].js", chunk: "chunk-[hash].js" },
  define: { "process.env.NODE_ENV": '"production"' },
  sourcemap: "linked",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const { name, version } = await Bun.file(join(root, "package.json")).json();
console.log(`build: ${name}@${version} in dist/`);
