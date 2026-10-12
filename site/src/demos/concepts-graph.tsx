import { useState } from "react";
import { createSceneSource, DataExplorer, type ExplorerEdge } from "@thirkettle/data-explorer";

// A tiny organisation: teams of people, and who works with whom. The focus says where you are:
// the top (null), a team, or one person's neighbourhood.
type Focus = { team: string } | { person: string };

const teams: Record<string, string[]> = {
  Design: ["Ada", "Ben", "Cleo"],
  Platform: ["Dev", "Eli", "Fay", "Gus"],
  Data: ["Hal", "Ivy"],
};
const teamOf = (person: string) => Object.keys(teams).find((t) => teams[t]!.includes(person))!;
// Pairs who work together across teams; teammates are joined too (below).
const pairs: [string, string][] = [["Ada", "Dev"], ["Cleo", "Hal"], ["Fay", "Ivy"], ["Ben", "Eli"]];

const person = (name: string) => ({
  id: name,
  label: name,
  weight: 1,
  href: `#${name}`,
  drillsInto: { person: name }, // entering a person opens their neighbourhood
  shape: "disc" as const,
});

const source = createSceneSource<Focus>({
  load(focus) {
    // The top: a packed scene of teams, each a cloud you can enter.
    if (focus === null) {
      return {
        id: "top",
        heading: "Organisation",
        clusters: Object.keys(teams).map((team) => ({
          id: team,
          label: team,
          weight: teams[team]!.length,
          href: `#${team}`,
          drillsInto: { team },
          shape: "cloud" as const,
        })),
        nodes: [],
        edges: [],
      };
    }
    // A team: a packed scene of its people.
    if ("team" in focus) {
      return { id: focus.team, heading: focus.team, clusters: [], nodes: teams[focus.team]!.map(person), edges: [] };
    }
    // A person: a radial scene. `focusId` puts them in the middle; edges choose the neighbours,
    // grouped round them by the edge's `kind`.
    const me = focus.person;
    const mates = teams[teamOf(me)]!.filter((p) => p !== me);
    const partners = pairs.flatMap(([a, b]) => (a === me ? [b] : b === me ? [a] : []));
    const edges: ExplorerEdge[] = [
      ...mates.map((p) => ({ id: `team-${p}`, sourceId: me, targetId: p, kind: "teammate" })),
      ...partners.map((p) => ({ id: `pair-${p}`, sourceId: me, targetId: p, kind: "works-with" })),
    ];
    return { id: me, heading: me, focusId: me, clusters: [], nodes: [me, ...mates, ...partners].map(person), edges };
  },
  // Zooming out: a person returns to their dot in their team; a team to its cloud at the top.
  parentOf(focus) {
    if ("team" in focus) return { kind: "anchored", focus: null, anchorId: focus.team };
    return { kind: "anchored", focus: { team: teamOf(focus.person) }, anchorId: focus.person };
  },
});

export default function ConceptsGraph() {
  const [focus, setFocus] = useState<Focus | null>(null);
  return <DataExplorer source={source} focus={focus} onSettle={setFocus} edges={{ visible: true }} />;
}
