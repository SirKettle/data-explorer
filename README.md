# data-xplorer

A continuous, zoomable explorer for tree- and graph-shaped data, drawn with PixiJS behind an
accessible outline, and the things built on it.

**[Documentation](https://sirkettle.github.io/data-xplorer/)**

| Workspace                         | What it is                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`packages/core`](./packages/core) | [`@data-xplorer/core`](https://www.npmjs.com/package/@data-xplorer/core): the explorer itself, published to npm. Formerly `@thirkettle/data-explorer`. |
| [`apps/world`](./apps/world)       | The world as fixed scenes of real country shapes: continents, each entered to its countries. Private. |
| [`site`](./site)                   | The documentation site, deployed to GitHub Pages. Its demos run the package source.             |

```sh
npm install @data-xplorer/core pixi.js react react-dom
```

## Development

```sh
bun install       # every workspace
bun run check     # everything CI checks
```

See [CONTRIBUTING](./CONTRIBUTING.md).

## Licence

MIT. See [LICENSE](./LICENSE).
