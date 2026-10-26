import { createRoot } from "react-dom/client";
import type { ExplorerEdges, ExplorerItem } from "@data-xplorer/core";
import { ExampleShell } from "../shared/ExampleShell";
import { DEPARTMENTS, PEOPLE, TEAMS, headcountOf } from "./data";
import { decodeFocus, encodeFocus, orgChartSource, type Focus, type Selected } from "./source";

const source = orgChartSource();

/** "manages" runs down the chart with an arrow; "reports-to" runs up it, dashed. */
const EDGES: ExplorerEdges = {
  visible: true,
  style: { width: 1.5, alpha: 0.5 },
  styles: {
    manages: { arrow: "end" },
    "reports-to": { arrow: "end", dash: [5, 4], curve: 0.12 },
  },
};

// Where a scene sits in the company, not the path walked to reach it.
function trailOf(focus: Focus | null): string[] {
  const top = "Rosa & Co.";
  if (focus === null) return [top];
  if (focus.kind === "department") return [top, DEPARTMENTS.get(focus.id)!.name];
  if (focus.kind === "team") {
    const team = TEAMS.get(focus.id)!;
    return [top, DEPARTMENTS.get(team.departmentId)!.name, team.name];
  }
  const person = PEOPLE.get(focus.id)!;
  return [
    top,
    ...(person.departmentId ? [DEPARTMENTS.get(person.departmentId)!.name] : []),
    ...(person.teamId ? [TEAMS.get(person.teamId)!.name] : []),
    person.name,
  ];
}

/** The details of *our* object behind the selected item: its `data`, handed back with it. */
function Details({ item }: { item: ExplorerItem<Focus, Selected> }) {
  const selected = item.data;
  if (!selected) return null;

  if (selected.kind === "person") {
    const { person } = selected;
    const manager = person.managerId ? PEOPLE.get(person.managerId)! : null;
    const team = person.teamId ? TEAMS.get(person.teamId)! : null;
    const department = person.departmentId ? DEPARTMENTS.get(person.departmentId)! : null;
    return (
      <dl className="example__details">
        <dt>Role</dt>
        <dd>{person.role}</dd>
        <dt>Email</dt>
        <dd>
          <a href={`mailto:${person.email}`}>{person.email}</a>
        </dd>
        <dt>Team</dt>
        <dd>{team?.name ?? "—"}</dd>
        <dt>Department</dt>
        <dd>{department?.name ?? "—"}</dd>
        <dt>Manager</dt>
        <dd>{manager ? <a href={`#person:${manager.id}`}>{manager.name}</a> : "Nobody: the top of the chart"}</dd>
      </dl>
    );
  }

  if (selected.kind === "team") {
    const { team } = selected;
    return (
      <dl className="example__details">
        <dt>Department</dt>
        <dd>{DEPARTMENTS.get(team.departmentId)!.name}</dd>
        <dt>Lead</dt>
        <dd>{PEOPLE.get(team.leadId)!.name}</dd>
        <dt>People</dt>
        <dd>{team.memberIds.map((id) => PEOPLE.get(id)!.name).join(", ")}</dd>
      </dl>
    );
  }

  const { department } = selected;
  return (
    <dl className="example__details">
      <dt>Head</dt>
      <dd>{PEOPLE.get(department.headId)!.name}</dd>
      <dt>Headcount</dt>
      <dd>{headcountOf(department)}</dd>
      <dt>Teams</dt>
      <dd>{department.teamIds.map((id) => TEAMS.get(id)!.name).join(", ")}</dd>
    </dl>
  );
}

createRoot(document.getElementById("root")!).render(
  <ExampleShell
    title="An org chart"
    intro={
      <p>
        A small company. Enter a department to see its teams, a team to see its people, and a person
        to see who they report to and who reports to them. From a person you can walk up to their
        manager or down to a report. Colours follow the department; the CEO pulses. Click anything
        for its details.
      </p>
    }
    source={source}
    encode={encodeFocus}
    decode={decodeFocus}
    trailOf={trailOf}
    edges={EDGES}
    renderSelection={(item) => <Details item={item} />}
  />,
);
