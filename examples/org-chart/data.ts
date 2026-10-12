/**
 * A made-up company: a CEO, four departments each with a head, two or three teams per department,
 * each team with a lead and some members. Every person but the CEO has a manager:
 *
 * - the CEO manages each department head;
 * - a department head manages the lead of each of their teams;
 * - a team lead manages the rest of their team.
 *
 * This file knows nothing about the explorer.
 */
export interface Person {
  id: string;
  name: string;
  role: string;
  email: string;
  /** null for the CEO and department heads, who sit above any one team. */
  teamId: string | null;
  /** null only for the CEO. */
  departmentId: string | null;
  managerId: string | null;
}

export interface Team {
  id: string;
  name: string;
  departmentId: string;
  leadId: string;
  memberIds: string[]; // lead first
}

export interface Department {
  id: string;
  name: string;
  headId: string;
  teamIds: string[];
  colour: string;
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, ".");
const email = (name: string) => `${slug(name)}@example.com`;

// [department, colour, head, [team, lead, ...members][]]
const raw: [string, string, string, [string, string, ...string[]][]][] = [
  [
    "Engineering",
    "#3b82f6",
    "Ada Brooks",
    [
      ["Platform", "Ben Ortiz", "Cara Lin", "Dev Patel", "Eli Novak", "Fay Wu"],
      ["Product", "Gus Hale", "Hana Ito", "Ivo Petrov"],
      ["Data", "Jun Park", "Kai Moss", "Lea Roth", "Max Ford"],
    ],
  ],
  [
    "Design",
    "#ec4899",
    "Nia Cole",
    [
      ["Brand", "Oli Grant", "Pia Shah", "Quin Doyle"],
      ["UX Research", "Rae Kim", "Sam Hart", "Tia Bell", "Uma Reid"],
    ],
  ],
  [
    "Sales",
    "#f59e0b",
    "Vic Lowe",
    [
      ["Enterprise", "Wes Clark", "Xia Chen", "Yan Ruiz", "Zoe Price", "Abe Fox"],
      ["SMB", "Bea Lane", "Cal West", "Dot Snow"],
      ["Partnerships", "Eve Marsh", "Finn Day", "Gia Rossi"],
    ],
  ],
  [
    "Operations",
    "#10b981",
    "Hal Stone",
    [
      ["People", "Ida Knox", "Jay Vance", "Kim Lowry"],
      ["Finance", "Lou Baker", "Mae Quinn", "Ned Frost", "Ora Blake"],
    ],
  ],
];

export const CEO_ID = "ceo";

export const PEOPLE = new Map<string, Person>();
export const TEAMS = new Map<string, Team>();
export const DEPARTMENTS = new Map<string, Department>();

PEOPLE.set(CEO_ID, {
  id: CEO_ID,
  name: "Rosa Vega",
  role: "Chief Executive Officer",
  email: email("Rosa Vega"),
  teamId: null,
  departmentId: null,
  managerId: null,
});

for (const [deptName, colour, headName, teams] of raw) {
  const departmentId = slug(deptName);
  const headId = slug(headName);
  PEOPLE.set(headId, {
    id: headId,
    name: headName,
    role: `Head of ${deptName}`,
    email: email(headName),
    teamId: null,
    departmentId,
    managerId: CEO_ID,
  });
  const teamIds: string[] = [];
  for (const [teamName, leadName, ...memberNames] of teams) {
    const teamId = `${departmentId}/${slug(teamName)}`;
    const leadId = slug(leadName);
    teamIds.push(teamId);
    PEOPLE.set(leadId, {
      id: leadId,
      name: leadName,
      role: `${teamName} Lead`,
      email: email(leadName),
      teamId,
      departmentId,
      managerId: headId,
    });
    for (const name of memberNames) {
      PEOPLE.set(slug(name), {
        id: slug(name),
        name,
        role: `${teamName} Specialist`,
        email: email(name),
        teamId,
        departmentId,
        managerId: leadId,
      });
    }
    TEAMS.set(teamId, {
      id: teamId,
      name: teamName,
      departmentId,
      leadId,
      memberIds: [leadId, ...memberNames.map(slug)],
    });
  }
  DEPARTMENTS.set(departmentId, { id: departmentId, name: deptName, headId, teamIds, colour });
}

export const reportsOf = (personId: string) =>
  [...PEOPLE.values()].filter((p) => p.managerId === personId);

/** Everyone in a department, its head included. */
export const headcountOf = (department: Department) =>
  1 + department.teamIds.reduce((sum, id) => sum + TEAMS.get(id)!.memberIds.length, 0);
