# Agent instructions

A Bun workspace: the published package is `packages/core` (`@data-xplorer/core`), apps built on it
are in `apps/`, and the docs site is `site/`.

For any AI coding agent working in this repository. `CLAUDE.md` imports this file. Read
[CONTRIBUTING.md](./CONTRIBUTING.md) for how the package is developed.

## Before every commit and push

Run the same checks CI runs, and commit only when they all pass:

```sh
bun run check
```

at the repository root. That runs the core package's `typecheck`, `bun test`, `build`,
`check:size`, `lint:package` and `check:bundle` (source and `--built`), the world app's `check`,
the docs demos' typecheck and tests, and `check:docs`. If one fails, fix the cause; never skip a
check or weaken it to get past it.

Also, when the change touches:

- **the public API** (anything exported from `packages/core/src/index.ts`, `headless.ts` or
  `pixi.ts`): run `bun run api:report` in `packages/core` and commit the updated `api/*.api.md`.
- **the docs site** (`site/`): build it too, as the Docs workflow does:
  `bun install --cwd site && bun run --cwd site build`.
- **peer dependency ranges or the build**: `bun run check:consumer <react> <pixi>` in
  `packages/core`, for the versions in the CI matrix (`.github/workflows/ci.yml`).
- **rendering, colours or interaction**: look at it in the Ladle playground (`bun run ladle` in
  `packages/core`, or in `apps/world` for the map), not only in tests. The renderer cannot run
  under happy-dom.

Report what you ran and its result. If you could not run a check, say which and why.

## Docs rules `check:docs` enforces

Guide pages never show TypeScript or JavaScript in a fenced code block. Code is shown through
`<Demo>`, `<Code>` or `<ExampleFrame>` from a file in `site/src/demos/` imported `?raw`, so the
code on the page is the code that runs. Every file in `site/src/demos/` must be shown on a page.

## Commits and releases

`main` is squash-merged and released by release-please, so a PR's title becomes the commit it is
released from: use a Conventional Commit title (`feat:`, `fix:`, `chore:`, `docs:`, and `!` or a
`BREAKING CHANGE:` footer for a breaking change).
