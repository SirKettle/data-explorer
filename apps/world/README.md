# World

The world as fixed scenes of regions, built on [`@data-xplorer/core`](../../packages/core):
Natural Earth's 110m countries (from `world-atlas`), projected once with `d3-geo` into one set of
map units. Continents at the top, each entered to its countries, which land exactly where the
continent was drawn. Private: it is not published.

```sh
bun run dev        # http://localhost:3071 (PORT=… changes it)
bun run ladle      # the WorldMap story, with effects and limits behind controls
bun run check      # typecheck and build
```

- `src/source.ts` is the `SceneSource`; `src/data.ts` is the projection, which the explorer never
  sees; `src/continents.ts` puts each country in a continent.
- It imports `@data-xplorer/core` by name. The root `tsconfig.json` maps that name to the package's
  source, so the app always runs the package in the same commit, with no build in between.
- The docs site shows it running, as the "world map" example (`scripts/build-examples.ts`).
