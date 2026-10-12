# History

How this package came to be, from the delivery log of the application it was built in (PicaBase,
a collectibles catalogue, whose repository is private). It was extracted into this repository on
2026-10-12 from PicaBase commit `127c501`, with a fresh history. References to that repository's
stories (US070-US072), architecture decisions (ADR-016, ADR-022) and files are kept as plain text.

It is kept for the reasoning: measurements, reversals, and traps found the hard way. The package
was named `@sirkettle/data-explorer` until it was renamed `@thirkettle/data-explorer` before its
first release.

## 2026-10-09 — US070 Visual Explorer package (`@sirkettle/data-explorer`)

US070 (plan),
an owner request the same day, sequenced "now" (Q1). The owner named the package
`@sirkettle/data-explorer` (Q2) and took the recommendations on a mandatory `href` (Q3) and the
`VisualExplorer` name (Q4). ADR-016 amendment A24 was proposed, checked with `architecture-check`
(proceed with changes, six folded in) and accepted before any code moved.

- **What it is now.** `packages/data-explorer` is a private, MIT-licensed workspace package holding:
  - the scene model and layouts;
  - the camera, gestures and scene stack;
  - the Pixi renderer;
  - the accessible outline;
  - the view, renamed `VisualExplorer`.

  PicaBase consumes it via `workspace:*` and keeps its LEGO adapter, the TanStack loader, the
  connector, the detail modal and the legend. The package has two entry points: `.` (the view, the
  `SceneSource` contract, the scene types, `windowed`, and palette and ramp) and `./headless` (the
  stack, the camera and the pure tint, for canvas-free use).
- **The contract that makes it generic** (A24):
  - a focus is opaque, and the consumer supplies `keyOf`, `loadScene`, `isCached` and
    `parentOf` (anchored, unanchored or none), with optional streaming, refresh and invalidation;
  - items declare `drillsInto`, a `shape` (`cloud`, `disc` or `square`), an optional `ramp`
    position and an optional `ring` emphasis.

  The core no longer parses an `href`, switches on theme/set/minifigure, holds the catalogue's
  release years, or matches mark text.
- **How behaviour was held still.** Before anything moved, `characterisation.test.ts` recorded the
  LEGO surface end to end. It ran 11 scenarios through the real loader, adapter, scene stack and
  tint, plus climbs and settle URLs. Its snapshot changed twice, each in its own commit:
  - Step 3's rename to the declared fields. A script checked all 30 node lines map one-to-one onto
    the old values;
  - the "0 owned" fix: exactly one line.
- **Found the hard way.**
  - **The domain-free core had drifted.** Six LEGO dependencies had crept into `camera/` and the
    renderer while the "no LEGO vocabulary" rule was only a review commitment, and the
    `renderer/**` boundary rule had matched nothing since the folder was renamed `renderer-pixi/`.
    Both are now tests in the package.
  - **A collection theme with 0 owned sets drew the ownership ring.** Its mark text, `"0 owned"`,
    matched the renderer's `/\bowned$/`. This was pinned by the characterisation test, then fixed
    on the owner's agreement: the ring is declared only when `ownedSetCount > 0`.
  - **A falsy focus broke the stack.** The scene stack tested a focus by truthiness, so a consumer
    whose focus is `0` could neither drill into it nor climb from it. The numeric fixture found
    this. The tests fail against the old stack and pass now.
  - **A long-running dev server keeps its module graph.** After the move, the dev server already on
    port 3000 reported the old paths as unresolvable. A fresh one on 3002 was used for the browser
    pass. Restart a dev server after moving files.
  - **`git add -A` picked up an unrelated untracked file** (`studopus.svg`, from another worktree's
    work). The commit was amended, and every later commit staged explicit paths.
- **Evidence.**
  - 2,209 tests pass across 211 files, the leak check is clean, and typecheck is clean in all 11
    workspaces.
  - The package's own tests include a 7-level tree with a 600-file folder, a DAG, 50 laps of an
    A → B → C → A cycle (each scene loads once) and a numeric focus starting at `0`.
  - Every new boundary rule was seen failing on a deliberate violation.
  - Bundle: entry +0.28%, lazy renderer −3.9%, all JS +0.12% against `main`. About 2 KB of pure
    colour code moved into the entry. CI now fails if PixiJS appears in the page entry.
  - Real browser, desktop at 1,710 × 981, signed in, against a local API and the seeded
    development database, on this branch:
    - drilling to a theme (1,049 sets streamed) and to a set;
    - anchored climb from a deep-linked set and unanchored climb from a deep-linked minifigure;
    - live re-tint through the `palette` prop (PicaBase dark → Light → Ember dark, one canvas
      throughout);
    - the collection context;
    - no console errors.

**Not verified:** widths below ~500 px (§6 item 6) and gesture feel on a real phone (US036's A23
pass). **Debts** are in §6 item 29.

## 2026-10-12 — US071 Configurable data explorer

US071 (plan),
an owner request on PR #132 (2026-10-10): the package should be "very configurable and flexible".
ADR-016 amendment A25 replaced A24's limit on the abstraction with a rule (a capability enters the
contract when the owner asks for it and an example uses it). The owner accepted it, with the
recommended answers to Q1-Q5, on 2026-10-11. Eight steps followed, each its own stacked PR
(#135-#142), each leaving `bun run test`, `bun run typecheck` and PicaBase's explorer unchanged.

- **What it is now.** Two layers.
  - Declarative: grouped `background` (colour, CSS-angle gradient, CORS image, grid), `effects`
    (grow-in, halo, rings, `glow`, `pulse`), `edges` (styled per kind, capped), `textures` and
    `customViews` options; item `color` (a number or CSS string), `effects` and `texture`; six
    events (hover, cancellable activate, enter, leave, camera, background click) plus
    `onTextureError`.
  - Custom: renderers by item `kind`, from a module the view loads lazily alongside the canvas
    chunk, written against a types-only `@sirkettle/data-explorer/pixi`.

  Every default reproduces the old rendering. PicaBase opts into nothing, and the LEGO
  characterisation test never changed.
- **How it was kept testable without WebGL.** Each capability put its rules in a pure module
  (`options`, `colour`, `events`, `motion`, `edge-geometry`, `texture-cache`, `custom-views`) and
  its drawing in a thin Pixi file. The architecture test names every Pixi-importing file; each
  addition, and each new boundary rule (no static import of the Pixi files, `./pixi` types-only and
  imported by nothing in the package), was seen failing first with a probe.
- **Found the hard way.**
  - **Round line caps cost 25 ms a frame.** The first edges used round caps and joins: 500
    straight edges took 28.8 ms against a 2.1 ms baseline. Batching the strokes changed nothing;
    Pixi's default caps took it to 2.3 ms. Dashes are now the costly style (each dash is its own
    geometry), so the edge cap is 500.
  - **A cancel test that could not fail.** Step 2's "preventDefault stops the drill" waited 50 ms,
    but the drill's approach animation takes 500 ms, so a view ignoring `preventDefault` passed
    too. It waits 900 ms now, and was seen failing against that broken view.
  - **A polygon blacked out the whole canvas, without an error.** Step 7's night-side polygon
    listed its two meeting points twice. The degenerate triangulation turned every frame black
    (the background, the Sun and the edges included) while the console stayed clean. The package
    isolates a renderer that throws; it cannot isolate one that draws wrong, and the README says so.
  - **Two bundle guards that could not fail.** The new `check:bundle` first scanned only the entry
    file; a statically imported renderers module landed in a chunk the entry imports eagerly, and
    the check passed. It now walks the entry's static import closure. Looking at why, PicaBase's
    own CI step turned out to be vacuous: it grepped the entry for `autoDetectRenderer`, but the
    production build is minified, so the name is in no chunk at all. `check-lazy-pixi.ts` replaces
    it, using shader source as the marker, the static closure, and a failure when the marker is
    missing everywhere. PixiJS was in fact still lazy.
  - **A real CORS refusal without a third party.** The examples server starts a second listener on
    the next port with no CORS header; Pluto's texture comes from it, so the fallback and
    `onTextureError` are exercised deterministically.
- **Measured** (desktop Chrome on Apple silicon, the stress page, 1,000 items): edges, textures and
  custom views each have a table in the package README. With all of them on at once, a frame took
  3.39 ms at fit (baseline 1.65 ms) and 2.71 ms zoomed in (baseline 1.41 ms). Panning across 1,000
  textured items with a budget of 64, the held count peaked at exactly 64.
- **Bundle** (PicaBase production build against `main`): up front +1.2%, lazy +1.5%. The package's
  own renderer chunk grew 26% (43.2 to 54.4 KB), which is the new drawing code; PixiJS is
  unchanged.
- **Deviations, each recorded in the plan:** Step 1 shipped the switches whose drawing already
  existed; the event demo uses a toggle, not Shift (gestures report no modifiers); glows blend
  normally, not additively (additive vanishes on light backgrounds); `onTextureError` is a prop;
  the solar system started at Step 6; `create()` takes no item, because views are pooled.

**Not verified:** a phone (every cap was set on desktop numbers), the real reduced-motion setting
(stubbed), touch double-tap, keyboard Enter in a real browser, and a slow network. **Debts** are
in status §6 item 30.

## 2026-10-12 — US072 Step 3: the approved API changes

The owner approved the API review's changes
1-12 as recommended. Each landed as its own commit, PicaBase migrated in the same commit as the
change that needed it.

- **What changed for a consumer:** items carry their own `data`, and the selection events hand back
  the item as written (`image` left the scene model; PicaBase's detail modal reads `data.image`).
  `createSceneSource({ load })` replaces the cache every consumer hand-wrote; `createTestStack`
  drives navigation in a test with no DOM and no animation. Palette colours take CSS strings;
  `marks`, `truncated` and `onSettle` are optional. `VisualExplorer` is `DataExplorer`, and its
  classes are `.data-explorer*`. Render records, `resolveOptions` and `parseColour` moved to
  `./headless`.
- **API report:** 0 forgotten exports (23 before) and 0 undocumented members (142 before) across
  the three entries. The main entry holds 40 exports.
- **A claim in the review was wrong.** It said clusters and nodes share one size scale, repeating
  the cold-start tester. `layout.ts` sizes each list against itself, with every cluster at least
  twice the largest node. It was found while documenting sizing (change 12); the review carries a
  dated correction.
- **Widening a field is breaking for readers.** Making `marks` optional compiled for every writer,
  and failed PicaBase's adapter, which read it. The report flags such changes; it does not catch
  every consequence for a reader.
- **Verified:** `bun run test` (2312 pass) and `bun run typecheck` clean; `check:bundle` and
  `check-lazy-pixi.ts` pass; PicaBase's `/visual-explorer` seen in a browser: the top scene, a
  drill into a theme, and a set's detail modal showing its image.

**Not verified:** the cold-start test was not repeated against the new docs. It is worth doing
before the docs site (Step 6) is written from them.

## 2026-10-12 — US072 Step 4: a real build, proven as a tarball

The package is named `@thirkettle/data-explorer` (the owner's decision, 2026-10-12; ADR-022
decision 2). Step 4 builds it as it will be published and proves the result.

- **The build** (`bun run build`, `scripts/build.ts`) writes `build/package/`: ESM per entry plus
  shared chunks from `Bun.build` with code splitting, so the PixiJS renderer stays a lazy chunk;
  one api-extractor `.d.ts` rollup per entry; and a generated manifest (`exports` with `types` and
  `import`, `sideEffects: false`, peers `react ^18.0.0 || ^19.0.0` and `pixi.js ^8.13.2`, Node 20+).
  The workspace manifest keeps pointing at `src/` (the plan records why).
- **Why rollups, not `tsc` declarations.** The source uses extensionless relative imports, which
  bundlers accept and Node's ESM resolution rejects; `tsc` would copy them into every `.d.ts`.
  Rolling each entry up into one file leaves no relative import to resolve. It also turns the API
  report into a gate: the build runs api-extractor without `--local`, so a public API that
  differs from `api/*.api.md` fails it (tried: a one-word change to the report failed the build).
- **The consumer check** (`check:consumer`) packs the package, installs it into a fresh npm
  project with given React and PixiJS versions, type-checks a consumer under `bundler` and
  `node16` resolution, and runs it under Node: a server render of `DataExplorer` and navigation
  with `createTestStack`. CI runs it as a 2 × 2 matrix.
- **A trap: a peer's own declarations fail `skipLibCheck: false`.** PixiJS 8's `.d.ts` files have
  errors of their own under `node16` resolution. Turning on `skipLibCheck` would also hide errors
  in this package's declarations, so the check keeps it off and fails only on errors in the
  consumer or in `node_modules/@thirkettle/` (a deliberate type error was caught).
- **Verified:** `publint` and `attw` (ESM-only profile) pass; `check:bundle --built` passes; the
  consumer check passed with React 18.3.1 + PixiJS 8.13.2 and React 19.3.0 + PixiJS 8.22.0
  locally; PicaBase on the packed tarball (a throwaway worktree, `file:` dependency) passed 2312
  tests, typecheck, the production build, the entry check and `check-lazy-pixi.ts` (876 KB up
  front, against 875 KB on source). Sizes, gzipped: `.` 23.1 KB up front plus 11.0 KB on first
  mount, `./headless` 13.5 KB, `./pixi` 0.5 KB.

**Not verified:** the tarball build in a browser (its tests, build and bundle checks passed, but
nobody looked at it running); the CI matrix runs for the first time on this PR. The 18 × 8-latest
and 19 × 8.13.2 cells were not run locally.
