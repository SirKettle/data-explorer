/**
 * US071 AC8 — builds the solar-system example with code splitting and asserts that nothing the
 * page loads up front holds PixiJS or the custom renderers module: both must be reached only
 * through dynamic imports. "Up front" is the entry chunk **and every chunk it imports statically**:
 * a module imported statically from the page can land in a chunk of its own that the entry loads
 * eagerly, so checking the entry file alone would miss it (it did, until this was fixed). The
 * assertion runs on an unminified build, where names survive to be looked for; the sizes printed
 * for the record come from a minified one.
 *
 *   bun run check:bundle            # the package from src/
 *   bun run check:bundle --built    # the package as published, from dist/ (run `build` first)
 */
import type { BunPlugin } from "bun";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** `autoDetectRenderer` is a PixiJS export (present in every PixiJS 8 build). */
const PIXI = "autoDetectRenderer";
/** Function names only `solar-system/planet-renderers.ts` defines. */
const RENDERERS = ["nightSide", "ringHalf"];

/** US072 Step 4: `--built` resolves the package to its built `dist/`, so the check covers what
 *  consumers install rather than the source. */
const BUILT = process.argv.includes("--built");
const distDir = join(import.meta.dir, "../dist");
if (BUILT && !(await Bun.file(join(distDir, "index.js")).exists())) {
  console.error("check:bundle --built: no dist/; run `bun run build` first");
  process.exit(1);
}
let resolvedFromDist = 0;
const useBuilt: BunPlugin = {
  name: "data-explorer-built",
  setup(build) {
    build.onResolve({ filter: /^@thirkettle\/data-explorer(\/(headless|pixi))?$/ }, (args) => {
      const sub = args.path.split("/")[2] ?? "index";
      resolvedFromDist++;
      return { path: join(distDir, `${sub}.js`) };
    });
  },
};

async function build(minify: boolean) {
  const outdir = await mkdtemp(join(tmpdir(), "data-explorer-bundle-"));
  const result = await Bun.build({ entrypoints: [join(import.meta.dir, "solar-system/index.html")], outdir, splitting: true, minify, plugins: BUILT ? [useBuilt] : [] });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  const html = await Bun.file(join(outdir, "index.html")).text();
  const entry = /<script[^>]+src="\.?\/?([^"]+\.js)"/.exec(html)?.[1];
  if (!entry) throw new Error("no entry script in the built index.html");
  const files = (await readdir(outdir)).filter((f) => f.endsWith(".js")).sort();
  return { outdir, entry, files };
}

const plain = await build(false);
const sized = await build(true);
try {
  const read = (file: string) => Bun.file(join(plain.outdir, file)).text();
  const offences: string[] = [];

  // The static import closure of the entry: `import … from "./x.js"`, `import "./x.js"` and
  // `export … from "./x.js"`, but never `import("./x.js")`.
  const STATIC = /(?:^|[;}\n])\s*(?:import|export)\s*(?:[^"'();]*?\bfrom\s*)?["']\.\/([^"']+\.js)["']/g;
  const upFront = new Set<string>();
  const queue = [plain.entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (upFront.has(file)) continue;
    upFront.add(file);
    for (const match of (await read(file)).matchAll(STATIC)) queue.push(match[1]!);
  }
  const upFrontCode = (await Promise.all([...upFront].map(read))).join("\n");
  if (!(await read(plain.entry)).includes("createRoot")) offences.push("the entry chunk does not mount the page (no createRoot)");
  if (upFrontCode.includes(PIXI)) offences.push("PixiJS is loaded up front");
  if (RENDERERS.some((name) => upFrontCode.includes(`function ${name}`))) offences.push("the renderers module is loaded up front");

  // Every chunk's role, from the readable build. Sizes come from the minified build, as totals.
  const roles: string[] = [];
  for (const file of plain.files) {
    const code = await read(file);
    roles.push(file === plain.entry ? "entry" : upFront.has(file) ? "up-front" : code.includes(PIXI) ? "pixi" : RENDERERS.some((n) => code.includes(`function ${n}`)) ? "renderers" : "other");
  }
  // Sanity: the markers must be found somewhere, or the check is not looking at what it thinks.
  const allCode = (await Promise.all(plain.files.map(read))).join("\n");
  if (!allCode.includes(PIXI)) offences.push("no chunk holds PixiJS: the marker is stale");
  if (!RENDERERS.some((name) => allCode.includes(`function ${name}`))) offences.push("no chunk holds the renderers module: the marker is stale");
  console.log(roles.map((role, i) => `${role.padEnd(9)} ${plain.files[i]}`).join("\n"));
  let total = 0;
  for (const file of sized.files) total += (await stat(join(sized.outdir, file))).size;
  const entrySize = (await stat(join(sized.outdir, sized.entry))).size;
  console.log(`minified: entry ${Math.round(entrySize / 1024)} KB, all chunks ${Math.round(total / 1024)} KB`);

  if (offences.length > 0) {
    for (const offence of offences) console.error(`check:bundle: ${offence}`);
    process.exit(1);
  }
  if (BUILT && resolvedFromDist === 0) offences.push("--built: no import of the package was resolved to dist");
  console.log(`check:bundle${BUILT ? " (built package)" : ""}: the ${upFront.size} chunk(s) loaded up front hold neither PixiJS nor the renderers module`);
} finally {
  await rm(plain.outdir, { recursive: true, force: true });
  await rm(sized.outdir, { recursive: true, force: true });
}
