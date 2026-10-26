import { useEffect, useRef, type KeyboardEvent } from "react";
import type { ExplorerScene } from "../scene/types";

/**
 * US036 plan Step 3R.1 Step 4 / ADR-016 A13 — the accessibility mitigation A13 names but the spike
 * deliberately does not build: "a visually-hidden `<ul>` of real `<a href>` items for the current
 * scene's visible nodes... updated when the scene changes, not per frame... restores the substance
 * of Decision 5 (reachability, announcement, real links) at a cost of roughly one small component,
 * without touching the renderer or the per-frame path."
 *
 * This is that component. It re-renders once per scene change, never per frame, so it costs
 * nothing on the path A11's reversal was about (a canvas draw). It mirrors the discrete
 * `SceneView`'s own accessibility mechanism as closely as the two surfaces' different geometry
 * allows (plan D4, checked point by point in this file's own test):
 *
 *  1. A real `<a href>` per navigable node/cluster; a non-navigable aggregate (`href: null`) is a
 *     real `<button>`, same as `NodeView`'s own href/no-href split — still in the tab order, still
 *     announced, just with nowhere to send a modified click.
 *  2. Arrow keys move focus between siblings in the list's own DOM order (the adapter's weight
 *     order, same as every layout in this tree already sorts by); `Enter`/`Space` is native
 *     `<a>`/`<button>` activation.
 *  3. Focus moves to this list's own heading on every `scene.id` change, announced through a
 *     polite live region — both keyed on `scene.id` alone, identical to `SceneView`.
 *  4. A windowed cluster still renders "Showing N of M" — `ExplorerTruncation` carried straight
 *     through, never summarised away.
 *
 * US071 Step 4 — when the canvas draws edges, every drawn edge is listed too, as a link to its far
 * end (the end that is not the scene's focus), so a relationship that can be seen can also be
 * followed (ADR-016 Decision 3, extended to edges by A25 clause 6). A capped scene says how many
 * it left out. With edges off, nothing is listed, as before.
 *
 * Deliberately NOT covered here: gesture equivalence (US036's own relaxation, untouched by this
 * component).
 */
export interface SceneOutlineProps {
  scene: ExplorerScene;
  /** Both a node and a navigable cluster funnel through one id — the same shape
   *  `ExplorerConnector`'s own `onActivate(id, all)` already resolves against `scene.clusters`/
   *  `scene.nodes`, so this component doesn't need to know which list an id came from. */
  onActivate: (id: string) => void;
  /** US071 — the edges the canvas draws, and how many the cap left out; `null` when edges are off. */
  edges?: { drawn: readonly { id: string; kind: string; sourceId: string; targetId: string }[]; omitted: number } | null;
}

const ARROW_KEYS = new Set(["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]);

/** US072 Step 1 — the usual screen-reader-only rule, inline so the outline is hidden from sight
 *  (and still read aloud) with no consumer CSS. The class stays for consumers that style it. */
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

interface OutlineRow {
  id: string;
  label: string;
  sublabel?: string | null;
  href: string | null;
  truncated: { shown: number; total: number } | null;
}

export function SceneOutline({ scene, onActivate, edges = null }: SceneOutlineProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [scene.id]);

  function handleKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (!ARROW_KEYS.has(event.key)) return;
    const focusables = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-scene-outline-item]"));
    const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
    if (currentIndex === -1) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + delta + focusables.length) % focusables.length;
    focusables[nextIndex]?.focus();
  }

  // Clusters before nodes, matching `layoutScene`'s own weight-sorted convention closely enough to
  // give a stable, predictable tab order — exact visual position doesn't apply to a hidden list.
  const rows: OutlineRow[] = [
    ...scene.clusters.map((cluster) => ({ id: cluster.id, label: cluster.label, sublabel: cluster.sublabel, href: cluster.href, truncated: cluster.truncated ?? null })),
    ...scene.nodes.map((node) => ({ id: node.id, label: node.label, sublabel: node.sublabel, href: node.href, truncated: null })),
  ];

  function activate(id: string, event: { preventDefault(): void; defaultPrevented: boolean; button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onActivate(id);
  }

  const items = new Map<string, { label: string; href: string | null }>(rows.map((row) => [row.id, row]));
  const relationships = (edges?.drawn ?? []).flatMap((edge) => {
    const farId = edge.sourceId === scene.focusId ? edge.targetId : edge.targetId === scene.focusId ? edge.sourceId : edge.targetId;
    const nearId = farId === edge.targetId ? edge.sourceId : edge.targetId;
    const far = items.get(farId);
    const near = items.get(nearId);
    return far && near ? [{ id: edge.id, farId, text: `${near.label} — ${edge.kind} — ${far.label}`, href: far.href }] : [];
  });

  return (
    <section className="visually-hidden" style={VISUALLY_HIDDEN} aria-label={`${scene.heading} (list view)`}>
      <h2 tabIndex={-1} ref={headingRef}>
        {scene.heading}
      </h2>
      <div aria-live="polite">{scene.heading}</div>
      <ul onKeyDown={handleKeyDown}>
        {rows.map((row) => (
          <li key={row.id}>
            {row.href ? (
              <a href={row.href} data-scene-outline-item onClick={(e) => activate(row.id, e)}>
                {row.label}
                {row.sublabel ? ` — ${row.sublabel}` : ""}
              </a>
            ) : (
              <button type="button" data-scene-outline-item onClick={(e) => activate(row.id, e)}>
                {row.label}
              </button>
            )}
            {row.truncated && (
              <span>
                {" "}
                (showing {row.truncated.shown} of {row.truncated.total})
              </span>
            )}
          </li>
        ))}
      </ul>
      {relationships.length > 0 && (
        <>
          <h3>Relationships</h3>
          {edges!.omitted > 0 && (
            <p>
              Showing {relationships.length} of {relationships.length + edges!.omitted} relationships
            </p>
          )}
          <ul onKeyDown={handleKeyDown}>
            {relationships.map((rel) => (
              <li key={rel.id}>
                {rel.href ? (
                  <a href={rel.href} data-scene-outline-item onClick={(e) => activate(rel.farId, e)}>
                    {rel.text}
                  </a>
                ) : (
                  <span>{rel.text}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
