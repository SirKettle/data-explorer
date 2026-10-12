> Written in the PicaBase repository before the move (US072 Step 2); its links to that private
> repository are kept as plain text. Every change it approved has since landed.

# Data explorer API review (US072 Step 2)

**Date:** 2026-10-12 · **Story:** US072
(plan, Step 2) · **Gate:**
ADR-022, decision 4: every breaking
change lands before 0.1.0, recorded and approved here.\
**Status:** **Approved by the owner 2026-10-12, as recommended**: changes 1-12 accepted, 13-15
rejected, 16 superseded. Step 3 applies them.

## Method

Three sources of evidence, collected before anything was decided:

1. **Inventory.** `bun run api:report` generates the public surface of all three entries with
   `api-extractor` into `packages/data-explorer/api/`. It found:
   - **58 exports**: 42 in `.`, 11 in `./headless` and 5 in `./pixi`;
   - **142 members with no doc comment**;
   - **23 "forgotten exports"**: types the API uses but no entry exports, so a consumer can see
     them in a signature but cannot import them by name. Examples are `ResolvedEdgeStyle`,
     `NavigationDirection` (in `./headless`) and `TransitionView`.
2. **README first.** `packages/data-explorer/docs/getting-started.md` and `docs/concepts.md` were
   written for a newcomer against today's API, before any change. Wherever the honest explanation
   was awkward, that is recorded below as a finding. The getting-started code was typechecked.
3. **Cold start.** A fresh agent session, allowed only the README, those two pages and
   `examples/`, built an org chart:
   - departments, then teams, then people (packed);
   - a radial person view with their manager and reports as edges;
   - a details panel showing the person's own record;
   - a headless smoke test.

   Its friction log is summarised below. The app is now `examples/org-chart/`, checked in a
   browser: the tree, the radial view, colours, edges and the details panel all work. The tester
   declared one breach of its reading rules (`package.json`, to confirm the export names).

## What the evidence says

### From writing the docs

- **D1. The first explorer needs a hand-written cache.** `SceneSource` requires `isCached`, so
  getting-started's smallest example spends 10 lines on a `Map` before anything is drawn. Every
  example in the repository imports the same private helper (`examples/shared/cached.ts`). A
  consumer outside this repository does not have it.
- **D2. Two item lists, explained by an exception.** "A cluster's `href` may be `null`, but only
  for an aggregate" is the only real difference between `clusters` and `nodes`, apart from
  `truncated`.
- **D3. Events hand back the explorer's record, not yours.** Concepts had to say "to get your own
  object back, look it up by `id`".
- **D4. Required boilerplate:** `marks: []` on every item, and `truncated: null` on every
  ordinary cluster.
- **D5. Overlapping events:** `onSceneChange` and `onEnter`/`onLeave` both report scene changes.
  `onSceneChange` also fires while a scene streams in.

### From the cold start

The app itself typechecked on the first try. The tester called `module-graph/source.ts` "an
excellent template" and found the `SceneSource` contract "small and well named". 75% of its effort
went elsewhere:

- **C1. Headless was undocumented** (costly, nearly blocking). The README's "Headless use" names
  three functions with no signatures or example. The tester guessed `createSceneStack(source)`,
  which is wrong. It found the real deps object only by forcing type errors, over four rounds.
- **C2. Headless still needs `requestAnimationFrame`** (costly). `enter()` animates by default, so
  `bun test` failed with `ReferenceError: requestAnimationFrame is not defined`. The tester
  polyfilled it, unsure whether the polyfill is correct or lucky.
- **C3. No way back from a clicked item to your own object** (costly at design time). Ids are
  unique only within a scene, and `RenderNode.focus` is `unknown`. The tester encoded the kind into
  every id (`dept:`, `team:`, `person:`) and parsed it back. Every consumer with more than one kind
  of item would reinvent this. This independently confirms D3.
- **C4. The docs contradicted each other** (minor each, costly together). The examples README said
  edges are never drawn. The README's Styling section still required consumer CSS after US072
  Step 1 removed the need. `stats` was missing from the props table, and the docs disagreed about
  `onSceneChange`'s argument. **All four are fixed in this change.** They were documentation
  faults, not API ones; two were left by Step 1.
- **C5. Radial edges under-explained** (minor). The docs don't say whether direction matters,
  whether one end must be the centre, how groups are ordered, or whether the centre should drill
  into itself.
- **C6. Smaller points:**
  - whether clusters' and nodes' weights share a scale (**they do not**: corrected 2026-10-12, see the note at the end);
  - how to add an example page;
  - whether a cluster honours `color` (it does).

**What the tester found clear, to keep:**
- the `SceneSource` contract, and `parentOf`'s `anchored`/`unanchored`/`none`;
- "going back the way you came, whatever `parentOf` says";
- "a scene is radial when it sets `focusId`", described as "a single, memorable rule";
- the edge style table and the option defaults.

## Recommendations

**Accept** means Step 3 makes the change; **Reject** means it stays as it is. A breaking change is
one an existing consumer would have to edit for. PicaBase is the only consumer today, and its
cost is given for each.

| # | Change | Evidence | Breaking? | PicaBase cost | Recommendation |
| --- | --- | --- | --- | --- | --- |
| 1 | **Items carry a typed `data` payload**, and the selection events (`onNodeSelect`, `onNodeHover`, `onNodeActivate`) hand back the consumer's own item, with `data`, instead of `RenderNode`. `RenderNode` leaves the main entry; `./headless` keeps it. | D3, C3 | Yes | Small. The detail modal reads `label`, `sublabel`, `marks` (was `rawMarks`), `href` and `data.image` (was `image`); the adapter puts the image URL into `data`. | **Accept** |
| 2 | **Remove `image` from items.** With `data` (1), a consumer keeps its own picture, which the explorer never drew anyway. This also ends the `image` against `texture` confusion. | Report, 1 | Yes | Included in 1. | **Accept** (with 1) |
| 3 | **`createSceneSource({ keyOf?, load, parentOf, loadStreaming?, refresh?, subscribe? })`** builds a `SceneSource` that owns its cache and `isCached`. `SceneSource` itself is unchanged, for sources that cache elsewhere (PicaBase's TanStack loader). | D1; every example uses `shared/cached.ts` | No | None. The examples switch to it. | **Accept** |
| 4 | **A headless test helper:** `createTestStack(source, { focus?, viewport? })` returns a stack whose transitions do not animate (no `requestAnimationFrame`), with `enter`, `leave`, `current` and `depth`. Plus a worked example in the README, and a note that the raw `createSceneStack` animates. | C1, C2 | No | None; PicaBase's tests may adopt it. | **Accept** |
| 5 | **`palette` accepts CSS strings** as well as numbers, like every other colour. | US071 Q3, consistency | No (it widens) | None. | **Accept** |
| 6 | **`marks` optional** (default `[]`) and **`truncated` optional** on clusters (default `null`). | D4, C6 | No (it widens) | None. | **Accept** |
| 7 | **`onSettle` optional**, for a page that does not keep the focus in its URL. | Docs writing | No (it widens) | None. | **Accept** |
| 8 | **Rename the component `VisualExplorer` to `DataExplorer`**, to match the package. | Discoverability | Yes | One import, plus the connector's JSX and docs. | **Accept** (0.1.0 is the only cheap moment) |
| 9 | **Renderer-neutral class names:** `.data-explorer` and `.data-explorer__surface`, not `.pixi-explorer*`. | Report; the package no longer needs CSS | Yes, for styled consumers | Two selectors in `explorer.css`, plus the examples' stylesheet. | **Accept** (pairs with 8) |
| 10 | **A smaller main entry.** Move `resolveOptions`, `ResolvedOptions`, `parseColour`, `RenderEdge` and (after 1) `RenderNode` to `./headless`. Export, or stop exposing, all 23 forgotten types. `windowed`, `DEFAULT_RAMP` and `FALLBACK_PALETTE` stay (PicaBase uses them). | Report: each export is a semver promise | Yes, for those names | Small. Up to four files use `RenderNode` (the connector, the detail modal and two tests); after 1, the connector and modal use the item type, and the tests that read layout import `RenderNode` from `./headless`. | **Accept** |
| 11 | **A doc comment on every public member** (142 missing). The generated API reference (Step 6) is built from them. | Report | No | None. | **Accept** |
| 12 | **Document radial edges:** direction, which end is the centre, group order, edges between neighbours, the centre's `drillsInto`. Also that weights share a scale across clusters and nodes. | C5, C6 | No | None. | **Accept** (docs) |
| 13 | **An explicit `layout: "packed" \| "radial"`** instead of radial being implied by `focusId`. | US071 candidate | Yes | Adapter: one field per radial scene. | **Reject.** The cold start called the `focusId` rule clear and memorable. Explicitness would add a field that must agree with another. |
| 14 | **Merge `clusters` and `nodes` into one `items` list.** | D2 | Yes, and large | The adapter's every scene builder, and the outline. | **Reject for 0.1.0.** The cold start never stumbled on it, and the churn is the largest of any candidate. Document the difference clearly instead (in 12). |
| 15 | **Drop `onSceneChange`** in favour of `onEnter`/`onLeave`. | D5 | Yes | The breadcrumb depends on it, and it alone reports streamed refines. | **Reject.** Document the difference in the events table: `onSceneChange` is "what is on screen now", including refines; `onEnter`/`onLeave` are navigations. |
| 16 | **A typed `RenderNode<F>`** (`focus: F`). | C3 | — | — | **Superseded by 1.** |

## Not changed by this review

- The `SceneSource` contract's shape (only 3 adds a helper beside it).
- `parentOf` and its three answers; `href` being required, with its accessibility reason.
- Option groups and names (`background`, `effects`, `edges`, `textures`, `customViews`). Nothing in
  the evidence argued against them.
- The `./pixi` renderer contract.

## Effect on the plan

If the owner approves 1-12 as recommended:

- **Step 3** applies them in this order, smallest risk first, one commit each where PicaBase is
  touched (as delivered, 11 and 12 moved to the end: 1, 2, 8 and 10 rename and move the members
  their doc comments describe):
  - widening changes: 5, 6, 7;
  - helpers: 3, 4;
  - doc comments and docs: 11, 12;
  - item data and selection: 1, 2;
  - surface trimming: 10;
  - renames last: 8, 9.

  The API report is regenerated, and its diff must match this list exactly.
- The characterisation test's snapshot should be untouched by all of them. It reads render nodes
  through `./headless`, which keeps `RenderNode` and its fields (`rawMarks` included), and it does
  not print `image`. Step 3 confirms this; any snapshot change would be a finding.
- The cold-start test is repeated at the end of Step 3 against the new docs, by a fresh session,
  to check that the friction is actually gone.

## Correction (2026-10-12, during Step 3)

C6 above said clusters' and nodes' weights share one size scale. That repeated the cold-start
tester's inference, and it is wrong. `layout.ts` sizes nodes against nodes and clusters against
clusters, with every cluster at least twice the largest node. It was found while writing change
12's documentation, which now states the real rule (`concepts.md`, the README and the
`ExplorerNode.weight` and `ExplorerCluster` doc comments). Nothing in the approved change list
depended on the wrong claim.

