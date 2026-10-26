/**
 * Builds every example as static pages into `site/public/live/`, so the docs site's gallery
 * can show each one running in a frame beside the source files it was built from. Same bundler as
 * `bun run examples`, so what the gallery runs is what the examples server serves. The core
 * package's examples are built together, sharing chunks; each app in `apps/` is built on its own,
 * into `live/<name>/`.
 *
 *   bun run scripts/build-examples.ts
 */
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const examples = join(import.meta.dir, "../packages/core/examples");
/** Apps shown in the gallery: the folder under `apps/`, and the gallery name it is served as. */
const APPS = { world: "world-map" };
const outdir = join(import.meta.dir, "../site/public/live");
/** Where the site serves `public/live/`: its base path (astro.config.mjs) plus `/live`. */
const BASE = "/data-xplorer/live";
const pages = [join(examples, "index.html")];
for (const entry of await readdir(examples, { withFileTypes: true })) {
  if (entry.isDirectory() && (await Bun.file(join(examples, entry.name, "index.html")).exists())) pages.push(join(examples, entry.name, "index.html"));
}

async function build(entrypoints: string[], root: string, out: string, base: string) {
  const result = await Bun.build({
    entrypoints,
    outdir: out,
    root,
    splitting: true,
    minify: true,
    // Absolute, so an asset imported by any page resolves the same way. A relative publicPath
    // resolves an imported SVG against the page's own folder, where it is not (every texture 404'd).
    publicPath: `${base}/`,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  // Bun joins publicPath to each page's *relative* chunk path, so a page in a sub-folder refers to
  // `${base}/../chunk-….js`, which resolves outside `live/`. The chunks are at the root of `live/`.
  for (const output of result.outputs) {
    if (!output.path.endsWith(".html")) continue;
    const html = await Bun.file(output.path).text();
    await Bun.write(output.path, html.replaceAll(`${base}/../`, `${base}/`));
  }
}

await rm(outdir, { recursive: true, force: true });
await build(pages, examples, outdir, BASE);
for (const [app, name] of Object.entries(APPS)) {
  const src = join(import.meta.dir, "../apps", app, "src");
  await build([join(src, "index.html")], src, join(outdir, name), `${BASE}/${name}`);
}
console.log(`build-examples: ${pages.length} pages and ${Object.keys(APPS).length} app(s) into site/public/live`);
