/**
 * Builds every example as static pages into `site/public/live/`, so the docs site's gallery
 * can show each one running in a frame beside the source files it was built from. Same bundler as
 * `bun run examples`, so what the gallery runs is what the examples server serves.
 *
 *   bun run scripts/build-examples.ts
 */
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const examples = join(import.meta.dir, "../examples");
const outdir = join(import.meta.dir, "../site/public/live");
/** Where the site serves `public/live/`: its base path (astro.config.mjs) plus `/live`. */
const BASE = "/data-explorer/live";
const pages = [join(examples, "index.html")];
for (const entry of await readdir(examples, { withFileTypes: true })) {
  if (entry.isDirectory() && (await Bun.file(join(examples, entry.name, "index.html")).exists())) pages.push(join(examples, entry.name, "index.html"));
}

await rm(outdir, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: pages,
  outdir,
  root: examples,
  splitting: true,
  minify: true,
  // Absolute, so an asset imported by any page resolves the same way. A relative publicPath
  // resolves an imported SVG against the page's own folder, where it is not (every texture 404'd).
  publicPath: `${BASE}/`,
  define: { "process.env.NODE_ENV": '"production"' },
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
// Bun joins publicPath to each page's *relative* chunk path, so a page in a sub-folder refers to
// `${BASE}/../chunk-….js`, which resolves outside `live/`. The chunks are at the root of `live/`.
for (const output of result.outputs) {
  if (!output.path.endsWith(".html")) continue;
  const html = await Bun.file(output.path).text();
  await Bun.write(output.path, html.replaceAll(`${BASE}/../`, `${BASE}/`));
}
console.log(`build-examples: ${pages.length} pages into site/public/live`);
