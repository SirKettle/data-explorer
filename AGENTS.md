# Agent instructions

For any AI coding agent working in this repository. `CLAUDE.md` imports this file. Read
[CONTRIBUTING.md](./CONTRIBUTING.md) for how the package is developed.

## Before every commit and push

Run the same checks CI runs, and commit only when they all pass:

```sh
bun run check
```

That runs `typecheck`, `bun test`, `build`, `check:size`, `lint:package`, `check:bundle` (source
and `--built`) and `check:docs`. If one fails, fix the cause; never skip a check or weaken it to get
past it.

Also, when the change touches:

- **the public API** (anything exported from `src/index.ts`, `src/headless.ts` or `src/pixi.ts`):
  run `bun run api:report` and commit the updated `api/*.api.md` with the change.
- **the docs site** (`site/`): build it too, as the Docs workflow does:
  `bun install --cwd site && bun run --cwd site build`.
- **peer dependency ranges or the build**: `bun run check:consumer <react> <pixi>` for the versions
  in the CI matrix (`.github/workflows/ci.yml`).
- **rendering, colours or interaction**: look at it in the Ladle playground (`bun run ladle`), not
  only in tests. The renderer cannot run under happy-dom.

Report what you ran and its result. If you could not run a check, say which and why.

## Docs rules `check:docs` enforces

Guide pages never show TypeScript or JavaScript in a fenced code block. Code is shown through
`<Demo>`, `<Code>` or `<ExampleFrame>` from a file in `site/src/demos/` imported `?raw`, so the
code on the page is the code that runs. Every file in `site/src/demos/` must be shown on a page.

## Commits and releases

`main` is squash-merged and released by release-please, so a PR's title becomes the commit it is
released from: use a Conventional Commit title (`feat:`, `fix:`, `chore:`, `docs:`, and `!` or a
`BREAKING CHANGE:` footer for a breaking change).
