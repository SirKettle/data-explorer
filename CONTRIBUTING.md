# Contributing

Thank you for helping. Issues and pull requests are welcome; for anything larger than a fix, open
an issue first so we can agree the shape before you build it.

## The loop

```sh
bun install
bun test             # unit, component and architecture tests (happy-dom, no browser needed)
bun run typecheck    # the package and the examples
bun run examples     # every example at http://localhost:3070
```

Bun 1.3 or later is needed to develop the package; consumers need only npm and Node 20+.

### Working on the package inside an app

```sh
bun run build && bun link                  # here: register the package
bun link @thirkettle/data-explorer         # in the app
```

Rebuild here after each change (`bun run build`), and the app picks it up. The app imports `dist/`,
exactly as it would from npm.

## Rules the tests enforce

`src/architecture.test.ts` keeps the boundary: no consumer imports or consumer vocabulary, `pixi.js`
only in the renderer files it lists, `./pixi` types-only, and the renderer reached only through one
dynamic import. If a test there fails, the design has moved: talk about it in the pull request
rather than loosening the rule quietly.

## Changing the public API

The API reports in `api/` are the public contract. If your change alters what consumers can import
or call, run `bun run api:report` and commit the updated report with it; `bun run build` (and CI)
fails if they differ. Every public member needs a doc comment.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), because
release-please writes the CHANGELOG and picks the version from them:

- `fix:` a bug fix (patch);
- `feat:` a new capability (minor);
- `feat!:` or a `BREAKING CHANGE:` footer: a breaking change. Before 1.0 this is a **minor**
  version, and the CHANGELOG entry must say what to change;
- `docs:`, `test:`, `chore:`, `build:`, `ci:` and `refactor:` do not release.

## Releasing

1. Merging to `main` makes release-please open (or update) a release pull request with the next
   version and CHANGELOG.
2. Merging that pull request tags the release, and the release workflow publishes to npm from CI,
   with provenance. Nobody publishes from a laptop.
3. Before a release, run the **Release** workflow by hand (`workflow_dispatch`): it builds, checks
   and runs `npm publish --dry-run`.

## Versioning

[Semantic Versioning](https://semver.org/). While the version is 0.x, a minor version may break the
API (and says how in the CHANGELOG); a patch never does. From 1.0, only a major version breaks.
The peer ranges in `package.json` are the ones CI tests: React 18 and 19, PixiJS 8.13.2 and the
latest 8.x.
