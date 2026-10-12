import {
  createSceneSource,
  type ExplorerCluster,
  type ExplorerEdge,
  type ExplorerNode,
  type ExplorerScene,
  type SceneSource,
} from "@thirkettle/data-explorer";
import { delay } from "../shared/delay";
import {
  CEO_ID,
  DEPARTMENTS,
  headcountOf,
  PEOPLE,
  reportsOf,
  TEAMS,
  type Department,
  type Person,
  type Team,
} from "./data";

/**
 * A tree with a graph hanging off every leaf:
 *
 * - `null`: the departments as clusters, and the CEO as a node (packed);
 * - a department: its teams as clusters, and its head as a node (packed);
 * - a team: its people (packed), the lead as a square;
 * - a person: radial, with the person in the middle, their manager and their direct reports around
 *   them, joined by "reports-to" and "manages" edges. Each neighbour is a person too, so you can
 *   walk up and down the reporting line.
 *
 * Each item carries its own record in `data` (a `Selected`), which the selection events hand back,
 * so the details panel never has to find it again.
 */
export type Focus =
  | { kind: "department"; id: string }
  | { kind: "team"; id: string }
  | { kind: "person"; id: string };

export const CEO_COLOUR = "#eab308";

export const encodeFocus = (focus: Focus) => `${focus.kind}:${focus.id}`;

export function decodeFocus(hash: string): Focus | null {
  const colon = hash.indexOf(":");
  const kind = hash.slice(0, colon);
  const id = hash.slice(colon + 1);
  if (kind === "department" && DEPARTMENTS.has(id)) return { kind, id };
  if (kind === "team" && TEAMS.has(id)) return { kind, id };
  if (kind === "person" && PEOPLE.has(id)) return { kind, id };
  return null;
}

const href = (focus: Focus) => `/org-chart#${encodeFocus(focus)}`;

export const itemId = {
  department: (id: string) => `dept:${id}`,
  team: (id: string) => `team:${id}`,
  person: (id: string) => `person:${id}`,
};

/** What an item stands for: carried in its `data`. */
export type Selected =
  | { kind: "department"; department: Department }
  | { kind: "team"; team: Team }
  | { kind: "person"; person: Person };

const colourOf = (person: Person) =>
  person.departmentId === null ? CEO_COLOUR : DEPARTMENTS.get(person.departmentId)!.colour;

function personNode(person: Person): ExplorerNode<Focus, Selected> {
  const reports = reportsOf(person.id).length;
  return {
    id: itemId.person(person.id),
    label: person.name,
    sublabel: person.role,
    weight: reports + 1, // the person and the people who report to them
    marks: [person.role, ...(reports > 0 ? [`${reports} direct reports`] : [])],
    href: href({ kind: "person", id: person.id }),
    drillsInto: { kind: "person", id: person.id },
    // Anyone who manages someone is a square; everyone else a disc.
    shape: reports > 0 ? "square" : "disc",
    color: colourOf(person),
    effects: person.id === CEO_ID ? ["pulse"] : [],
    data: { kind: "person", person },
  };
}

function departmentCluster(department: Department): ExplorerCluster<Focus, Selected> {
  const headcount = headcountOf(department);
  return {
    id: itemId.department(department.id),
    label: department.name,
    sublabel: `${headcount} people`,
    weight: headcount,
    marks: [`${headcount} people`, `${department.teamIds.length} teams`],
    href: href({ kind: "department", id: department.id }),
    drillsInto: { kind: "department", id: department.id },
    shape: "cloud",
    truncated: null,
    color: department.colour,
    data: { kind: "department", department },
  };
}

function teamCluster(team: Team): ExplorerCluster<Focus, Selected> {
  const headcount = team.memberIds.length;
  return {
    id: itemId.team(team.id),
    label: team.name,
    sublabel: `${headcount} people`,
    weight: headcount,
    marks: [`${headcount} people`, `led by ${PEOPLE.get(team.leadId)!.name}`],
    href: href({ kind: "team", id: team.id }),
    drillsInto: { kind: "team", id: team.id },
    shape: "cloud",
    truncated: null,
    color: DEPARTMENTS.get(team.departmentId)!.colour,
    data: { kind: "team", team },
  };
}

/** "manages" from a manager to someone who reports to them, drawn in the packed scenes too. */
const manages = (manager: Person, itemTargetId: string): ExplorerEdge => ({
  id: `${manager.id}->${itemTargetId}`,
  sourceId: itemId.person(manager.id),
  targetId: itemTargetId,
  kind: "manages",
});

function buildScene(focus: Focus | null): ExplorerScene<Focus, Selected> {
  if (focus === null) {
    const ceo = PEOPLE.get(CEO_ID)!;
    const departments = [...DEPARTMENTS.values()];
    return {
      id: "root",
      heading: "Rosa & Co.",
      clusters: departments.map(departmentCluster),
      nodes: [personNode(ceo)],
      edges: departments.map((d) => manages(ceo, itemId.department(d.id))),
    };
  }

  if (focus.kind === "department") {
    const department = DEPARTMENTS.get(focus.id)!;
    const head = PEOPLE.get(department.headId)!;
    const teams = department.teamIds.map((id) => TEAMS.get(id)!);
    return {
      id: encodeFocus(focus),
      heading: department.name,
      clusters: teams.map(teamCluster),
      nodes: [personNode(head)],
      edges: teams.map((t) => manages(head, itemId.team(t.id))),
    };
  }

  if (focus.kind === "team") {
    const team = TEAMS.get(focus.id)!;
    const lead = PEOPLE.get(team.leadId)!;
    const people = team.memberIds.map((id) => PEOPLE.get(id)!);
    return {
      id: encodeFocus(focus),
      heading: team.name,
      clusters: [],
      nodes: people.map(personNode),
      edges: people.filter((p) => p !== lead).map((p) => manages(lead, itemId.person(p.id))),
    };
  }

  // A person: radial, because the scene sets `focusId`.
  const centre = PEOPLE.get(focus.id)!;
  const manager = centre.managerId === null ? null : PEOPLE.get(centre.managerId)!;
  const reports = reportsOf(centre.id);
  const centreId = itemId.person(centre.id);
  const edges: ExplorerEdge[] = [
    ...(manager
      ? [{ id: `${centre.id}->${manager.id}`, sourceId: centreId, targetId: itemId.person(manager.id), kind: "reports-to" }]
      : []),
    ...reports.map((r) => manages(centre, itemId.person(r.id))),
  ];
  return {
    id: encodeFocus(focus),
    heading: centre.name,
    focusId: centreId,
    clusters: [],
    nodes: [centre, ...(manager ? [manager] : []), ...reports].map(personNode),
    edges,
  };
}

/** The scene a person normally lives in, and so where zooming out of them lands. */
function homeOf(person: Person): Focus | null {
  if (person.teamId !== null) return { kind: "team", id: person.teamId };
  if (person.departmentId !== null) return { kind: "department", id: person.departmentId };
  return null; // the CEO sits in the top scene
}

export function orgChartSource(): SceneSource<Focus, Selected> {
  return createSceneSource<Focus, Selected>({
    keyOf: (focus) => (focus === null ? "root" : encodeFocus(focus)),
    load: async (focus) => {
      await delay(80);
      return buildScene(focus);
    },
    parentOf(focus) {
      if (focus.kind === "department") {
        return { kind: "anchored", focus: null, anchorId: itemId.department(focus.id) };
      }
      if (focus.kind === "team") {
        const departmentId = TEAMS.get(focus.id)!.departmentId;
        return { kind: "anchored", focus: { kind: "department", id: departmentId }, anchorId: itemId.team(focus.id) };
      }
      // A person zooms out to their own item in their team (or department, or the top scene).
      // Walking sideways first retraces the walk instead: the explorer remembers.
      const person = PEOPLE.get(focus.id)!;
      return { kind: "anchored", focus: homeOf(person), anchorId: itemId.person(person.id) };
    },
  });
}
