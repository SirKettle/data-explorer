# @data-xplorer/core

A continuous, zoomable explorer for tree- and graph-shaped data. You zoom into a group to enter
it, zoom out to leave it, and pan across to its neighbours. It is drawn with PixiJS (WebGL), with
an accessible outline of real links and buttons alongside the canvas.

Nothing in it knows what your data is: you describe your data through a small contract, and the
package handles the camera, gestures, transitions and outline. It started as the visual explorer of
a collectibles catalogue, which is still its first consumer ([history](https://github.com/SirKettle/data-xplorer/blob/main/docs/history.md)).

```sh
npm install @data-xplorer/core pixi.js react react-dom
```

> **Status:** 0.x. Until 1.0, a **minor** version may break the API, and its CHANGELOG entry says
> how; a patch never does. Peers: React 18 or 19, PixiJS 8.13.2 or later 8.x, Node 20+ for
> tooling. ESM only.

## Documentation

**[sirkettle.github.io/data-xplorer](https://sirkettle.github.io/data-xplorer/)**: every page has a live demo running the exact code
it shows.

- [Getting started](https://sirkettle.github.io/data-xplorer/getting-started/): install to a working explorer in one file.
- [Concepts](https://sirkettle.github.io/data-xplorer/concepts/): focus, scenes, packed, radial and fixed layouts, drilling and zooming out,
  loading, and the accessible outline.
- Guides: [styling and theming](https://sirkettle.github.io/data-xplorer/guides/styling-and-theming/),
  [colours and backgrounds](https://sirkettle.github.io/data-xplorer/guides/colours-and-backgrounds/), [edges](https://sirkettle.github.io/data-xplorer/guides/edges/),
  [glow, pulse and emphasis](https://sirkettle.github.io/data-xplorer/guides/effects/), [images and CORS](https://sirkettle.github.io/data-xplorer/guides/images-and-cors/),
  [events](https://sirkettle.github.io/data-xplorer/guides/events/), [custom renderers](https://sirkettle.github.io/data-xplorer/guides/custom-renderers/),
  [fixed layouts and regions](https://sirkettle.github.io/data-xplorer/guides/fixed-layouts/),
  [performance](https://sirkettle.github.io/data-xplorer/guides/performance/), [accessibility](https://sirkettle.github.io/data-xplorer/guides/accessibility/) and
  [testing](https://sirkettle.github.io/data-xplorer/guides/testing/).
- [API reference](https://sirkettle.github.io/data-xplorer/reference/), generated from the doc comments.
- [Examples](https://sirkettle.github.io/data-xplorer/examples/): a file tree, a module graph, a streaming atlas, a solar system, an
  org chart and a stress page, each running beside its source.

## In short

You give the explorer a **scene source**: for any **focus** you choose (a path, an id; `null` is the
top) it returns a **scene** of groups (`clusters`) and things (`nodes`), and says what each item
**drills into** and where **zooming out** leads. The explorer handles the camera, gestures,
transitions, layout and an accessible outline of real links. A scene is **packed** (a level of a
tree), **radial** (one item's neighbourhood in a graph) or **fixed** (items at places of their own,
such as regions on a map). It never walks your data itself, so
graphs with cycles cost only the scenes a viewer visits.

## Development

```sh
bun install            # at the repository root: every workspace
cd packages/core
bun test               # the package's own tests
bun run typecheck
bun run examples       # the examples, at http://localhost:3070
```

See [CONTRIBUTING](https://github.com/SirKettle/data-xplorer/blob/main/CONTRIBUTING.md) for the full loop, including working on the package inside an
app with `bun link`.

`src/architecture.test.ts` enforces the boundary:

- no consumer imports;
- `pixi.js` only in the files it names (`renderer-pixi/renderer.ts`, `edges.ts`, `textures.ts`,
  `custom.ts`), and in `src/pixi.ts` only as types;
- nothing in the package imports the `./pixi` entry;
- the renderer reached only through the view's one dynamic import;
- `scene/` self-contained;
- no consumer-domain vocabulary in code or strings.

## Building and releasing

`bun run build` writes `dist/`: one ESM file per entry plus shared chunks (the PixiJS renderer stays
a lazily loaded chunk) and one rolled-up `.d.ts` per entry. The build **fails** if the public API
differs from `api/*.api.md`: run `bun run api:report` and commit the change when it is meant. The
API report is the public contract.

| Check | What it proves |
| --- | --- |
| `bun run lint:package` | `publint` and `@arethetypeswrong/cli` (ESM-only profile) pass on the build. |
| `bun run check:size` | Each entry, and the renderer loaded on first mount, stays within its gzipped budget. |
| `bun run check:bundle --built` | The built package keeps PixiJS and a renderers module out of what a page loads up front. |
| `bun run check:consumer <react> <pixi.js>` | The packed tarball installs into a fresh npm project, type-checks under `bundler` and `node16` resolution, server-renders and navigates under Node. CI runs React 18 and 19 against PixiJS 8.13.2 and the latest 8. |

Releases are made by [release-please](https://github.com/googleapis/release-please) from
[Conventional Commits](https://www.conventionalcommits.org/) on `main`, and published from CI only,
with npm provenance. See [CONTRIBUTING](https://github.com/SirKettle/data-xplorer/blob/main/CONTRIBUTING.md#releasing).

## Licence

MIT. See [LICENSE](./LICENSE).
