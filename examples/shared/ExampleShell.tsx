import { useEffect, useState, type ReactNode } from "react";
import {
  DataExplorer,
  type ExplorerBackground,
  type ExplorerCustomViews,
  type ExplorerEdges,
  type ExplorerEffects,
  type ExplorerPalette,
  type ExplorerTextures,
  type RampColours,
  type ExplorerItem,
  type SceneSource,
  type DataExplorerProps,
} from "@thirkettle/data-explorer";

/**
 * The page chrome every example shares, so each example file is only its data and its
 * `SceneSource`. It shows the three things a real consumer wires up around the explorer:
 *
 * - the focus lives in the URL (here the hash), written on `onSettle` and read back on Back/Forward;
 * - a breadcrumb from `onSceneChange`, which fires on every scene swap without waiting to settle;
 * - a detail panel from `onNodeSelect`, which fires on a confirmed single click.
 */
export interface ExampleShellProps<F, D = unknown> {
  title: string;
  intro: ReactNode;
  source: SceneSource<F, D>;
  /** Focus to URL hash and back. `null` (the root) is the empty hash. */
  encode: (focus: F) => string;
  decode: (hash: string) => F | null;
  /** Where a focus sits, root first, for the breadcrumb. */
  trailOf: (focus: F | null) => string[];
  palette?: ExplorerPalette;
  ramp?: RampColours;
  background?: ExplorerBackground;
  effects?: ExplorerEffects;
  edges?: ExplorerEdges;
  /** Extra controls for the selected node. */
  renderSelection?: (item: ExplorerItem<F, D>) => ReactNode;
  /** Extra controls above the canvas. */
  toolbar?: ReactNode;
  /** US071 — the explorer's own events, passed straight through. */
  events?: Pick<DataExplorerProps<F>, "onNodeHover" | "onNodeActivate" | "onEnter" | "onLeave" | "onCameraChange" | "onBackgroundClick" | "onTextureError">;
  textures?: ExplorerTextures;
  renderers?: DataExplorerProps<F>["renderers"];
  customViews?: ExplorerCustomViews;
  /** Extra content after the selection panel. */
  footer?: ReactNode;
}

function readHash(): string {
  return decodeURIComponent(window.location.hash.slice(1));
}

export function ExampleShell<F, D = unknown>({
  title,
  intro,
  source,
  encode,
  decode,
  trailOf,
  palette,
  ramp,
  background,
  effects,
  edges,
  textures,
  renderers,
  customViews,
  renderSelection,
  toolbar,
  events,
  footer,
}: ExampleShellProps<F, D>) {
  const [focus, setFocus] = useState<F | null>(() => decode(readHash()));
  const [trail, setTrail] = useState<string[]>([]);
  const [selected, setSelected] = useState<ExplorerItem<F, D> | null>(null);

  // Back/Forward and pasted links change the hash; the explorer's `focus` prop then jumps there.
  useEffect(() => {
    const onHashChange = () => setFocus(decode(readHash()));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [decode]);

  function handleSettle(next: F | null) {
    const hash = next === null ? "" : encode(next);
    if (hash !== readHash()) window.location.hash = hash; // one history entry per settled scene
    setFocus(next);
  }

  return (
    <main className="example">
      <header className="example__header">
        <a href="/">← All examples</a>
        <h1>{title}</h1>
        <div className="example__intro">{intro}</div>
      </header>

      <nav aria-label="Where you are" className="example__trail">
        {trail.map((heading, i) => (
          <span key={i}>{heading}</span>
        ))}
      </nav>

      {toolbar && <div className="example__toolbar">{toolbar}</div>}

      <DataExplorer
        {...events}
        source={source}
        focus={focus}
        onSettle={handleSettle}
        onSceneChange={({ focus }) => setTrail(trailOf(focus))}
        onNodeSelect={setSelected}
        palette={palette}
        ramp={ramp}
        background={background}
        effects={effects}
        edges={edges}
        textures={textures}
        renderers={renderers}
        customViews={customViews}
        stats={new URLSearchParams(window.location.search).get("stats") === "1"}
      />

      <aside className="example__selection" aria-live="polite">
        {selected ? (
          <>
            <h2>{selected.label}</h2>
            {selected.sublabel && <p>{selected.sublabel}</p>}
            {(selected.marks ?? []).length > 0 && (
              <ul className="example__marks">
                {(selected.marks ?? []).map((mark) => (
                  <li key={mark}>{mark}</li>
                ))}
              </ul>
            )}
            <p>
              {selected.drillsInto !== null ? "Double-click or zoom in to enter it. " : "Nothing inside. "}
              {selected.href && <a href={selected.href}>Its own page</a>}
            </p>
            {renderSelection?.(selected)}
          </>
        ) : (
          <p className="example__hint">
            Scroll or pinch to zoom, drag to pan, click an item to select it, double-click to enter
            it.
          </p>
        )}
      </aside>
      {footer}
    </main>
  );
}
