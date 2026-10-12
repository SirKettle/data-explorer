# Examples

Five small apps built on `@thirkettle/data-explorer`, each with made-up data and nothing else
underneath, plus a stress page for measuring. Each shows a different part of the contract; the
package README's Examples section maps every option to the app that uses it.

```sh
bun run examples   # then open http://localhost:3070
```

`PORT=…` changes the port. The server is Bun's HTML bundler (`server.ts`), so there is no build
step. If a page still shows old code after an edit, restart the server.

| Example                                      | Path            | What it shows                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [A file tree](./file-tree/)                  | `/file-tree`    | The minimum: a tree of packed scenes, a string focus, and an always-`anchored` `parentOf`. Also `windowed` with an honest aggregate (`assets/icons` has 420 files and draws 120), `ramp` (file age), and `emphasis: ["ring"]` (uncommitted changes).                                          |
| [A module dependency graph](./module-graph/) | `/module-graph` | A graph reached through a tree. The focus is a tagged union, and a module's scene is **radial** (`focusId`), with what it imports as discs and what imports it as squares. Every neighbour drills into its own neighbourhood, so you can walk round the import cycles.                        |
| [A streaming atlas](./atlas/)                | `/atlas`        | The optional members: `loadSceneStreaming` with `expectedItemCount` (countries arrive in pages), `subscribeToInvalidation` + `refreshScene` (mark a country visited and its ring appears in place), a custom `ramp` (population density), and a live `palette` switch between light and dark. |
| [A solar system](./solar-system/)            | `/solar-system` | Item `texture`s cropped to their disc, a `texture` from a host with no CORS header (the fallback and `onTextureError`), custom renderers by item `kind`, `edges` as orbits, a `pulse`, and an image `background`. |
| [An org chart](./org-chart/)                 | `/org-chart`    | A tree (departments, teams, people) into a radial person view whose manager and reports are drawn edges you can walk. Written from the docs alone, as US072's cold-start test, with a headless `smoke.test.ts`. |
| [Stress test](./stress/)                     | `/stress`       | One big scene, its size and styles in the query string, for reading draw cost off `?stats=1`. |

## Layout

```text
examples/
  server.ts              one route per page
  index.html             the gallery
  shared/
    ExampleShell.tsx     page chrome: focus in the URL hash, breadcrumb, selection panel
    delay.ts             a pretend network delay, so loading and previews are visible
    styles.css           the page chrome (the package itself needs no CSS)
  <example>/
    data.ts              the data, independent of the explorer
    source.ts            the SceneSource: the part worth reading
    main.tsx             mounts ExampleShell with that source
```

Start with `source.ts` in each folder. `ExampleShell.tsx` is the wiring every consumer writes once:

- the focus lives in the URL, written in `onSettle` and read back on Back/Forward;
- the breadcrumb comes from `onSceneChange`, built from the focus rather than the path walked;
- the detail panel comes from `onNodeSelect`.

## Notes

- The examples import `@thirkettle/data-explorer` by name. `examples/tsconfig.json` maps that name
  to `../src`, and both `tsc` and Bun's bundler follow the mapping, so the examples use only the
  public exports.
- Edges in a radial scene decide where neighbours sit: they are grouped by `kind` around the
  focus. With `edges={{ visible: true }}` the canvas also draws them (module graph, solar
  system, org chart).
- `bun run typecheck` in this package checks the examples too.
- **Adding an example:** a folder with `index.html`, `main.tsx` and usually `source.ts`, plus two
  lines in `server.ts` (`import page from "./<name>/index.html"` and a `"/<name>": page` route)
  and an entry in the gallery, `index.html`.
