/**
 * Installs the packed package into a fresh npm project, as a consumer would, and
 * proves it works there: type-checked under `bundler` and `node16` resolution, then run under
 * plain Node (server render of `DataExplorer`, navigation with `createTestStack`). The peer
 * versions are arguments, so CI runs it as a matrix.
 *
 *   bun run build && bun run scripts/check-consumer.ts [react-version] [pixi-version]
 *   e.g. bun run scripts/check-consumer.ts 18 8.13.2
 */
import { $ } from "bun";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [react = "19", pixi = "8"] = process.argv.slice(2);
const root = join(import.meta.dir, "..");
const pkgDir = root;
if (!(await Bun.file(join(root, "dist/index.js")).exists())) {
  console.error("check-consumer: no dist/; run `bun run build` first");
  process.exit(1);
}

const app = await mkdtemp(join(tmpdir(), "data-explorer-consumer-"));
try {
  const tarball = (await $`npm pack --pack-destination ${app} --silent`.cwd(pkgDir).text()).trim().split("\n").pop()!;
  await Bun.write(join(app, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  await $`npm install --silent --no-audit --no-fund ${join(app, tarball)} react@${react} react-dom@${react} pixi.js@${pixi} @types/react@${react} @types/react-dom@${react} typescript@5`.cwd(app);
  await cp(join(import.meta.dir, "consumer/consumer.ts"), join(app, "consumer.ts"));

  const common = { target: "ES2022", strict: true, skipLibCheck: false, lib: ["ES2022", "DOM"], types: [] };
  for (const resolution of ["bundler", "node16"]) {
    const module = resolution === "bundler" ? "ESNext" : "Node16";
    await Bun.write(join(app, `tsconfig.${resolution}.json`), JSON.stringify({ compilerOptions: { ...common, module, moduleResolution: resolution, outDir: `out-${resolution}` }, files: ["consumer.ts"] }));
    // `skipLibCheck: false`, so this package's own declarations are checked, but only errors in
    // them or in the consumer fail: a peer's declarations are its own business (PixiJS 8's
    // have errors of their own under node16).
    const output = await $`npx tsc -p tsconfig.${resolution}.json`.cwd(app).nothrow().text();
    const ours = output.split("\n").filter((line) => /^(consumer\.ts|node_modules\/@thirkettle\/)/.test(line));
    if (ours.length > 0) {
      console.error(`check-consumer: type errors under ${resolution} resolution:\n${ours.join("\n")}`);
      process.exit(1);
    }
    await $`npx tsc -p tsconfig.${resolution}.json --noCheck`.cwd(app).quiet(); // emit regardless
  }
  const versions = await $`node -p "['react', 'pixi.js'].map((p) => p + '@' + require('./node_modules/' + p + '/package.json').version).join(' ')"`.cwd(app).text();
  await $`node out-node16/consumer.js`.cwd(app);
  console.log(`check-consumer: passed with ${versions.trim()}`);
} finally {
  await rm(app, { recursive: true, force: true });
}
