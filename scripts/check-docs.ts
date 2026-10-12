/**
 * The docs site's "the code shown is the code that runs" rule. Fails when a page:
 *
 * - shows TypeScript or JavaScript in a fenced code block (code is shown only through `<Demo>`,
 *   `<Code>` or `<ExampleFrame>`, from a file imported `?raw`);
 * - gives `<Demo>` a `file` that is not the file its `code` was imported from, or renders a demo
 *   component imported from a different file;
 * - imports a demo that does not exist; or when a file in `site/src/demos/` is shown on no page.
 *
 * The generated API reference is exempt. Run before `astro build` (CI runs both).
 *
 *   bun run scripts/check-docs.ts
 */
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const site = join(import.meta.dir, "../site");
const docs = join(site, "src/content/docs");
const demos = join(site, "src/demos");
const problems: string[] = [];

async function pages(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (relative(docs, path) !== "reference") out.push(...(await pages(path)));
    } else if (/\.mdx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

const shown = new Set<string>();
for (const page of await pages(docs)) {
  const name = relative(docs, page);
  const text = await Bun.file(page).text();

  for (const match of text.matchAll(/^```(\w+)/gm)) {
    if (/^(ts|tsx|js|jsx|typescript|javascript)$/i.test(match[1]!)) problems.push(`${name}: a \`\`\`${match[1]} block; show code through <Demo> from a file that runs`);
  }

  // `import x from ".../demos/<file>?raw"` and `import X from ".../demos/<file>"`.
  const raw = new Map<string, string>();
  const component = new Map<string, string>();
  for (const match of text.matchAll(/^import (\w+) from "[^"]*\/demos\/([^"?]+)(\?raw)?";/gm)) {
    const [, binding, file, isRaw] = match;
    if (!(await Bun.file(join(demos, file!)).exists())) problems.push(`${name}: imports demos/${file}, which does not exist`);
    (isRaw ? raw : component).set(binding!, file!);
    if (isRaw) shown.add(file!);
  }
  for (const match of text.matchAll(/<Demo code=\{(\w+)\} file="([^"]+)"[^>]*>\s*<(\w+)/g)) {
    const [, code, file, rendered] = match;
    if (raw.get(code!) !== file) problems.push(`${name}: <Demo file="${file}"> shows ${raw.get(code!) ?? `an unknown {${code}}`}`);
    if (component.get(rendered!) !== file) problems.push(`${name}: <Demo file="${file}"> runs <${rendered}>, imported from ${component.get(rendered!) ?? "elsewhere"}`);
  }
}

for (const file of await readdir(demos)) {
  if (/\.(tsx?|ts)$/.test(file) && !shown.has(file)) problems.push(`demos/${file} is shown on no page`);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`check-docs: ${problem}`);
  process.exit(1);
}
console.log(`check-docs: every demo shown is the file that runs (${shown.size} demo files)`);
