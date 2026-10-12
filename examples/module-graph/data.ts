/**
 * A made-up app's import graph: modules grouped into packages, each importing others. It is not a
 * tree: `core/store` → `core/events` → `core/logger` → `core/store` is a cycle, and so is
 * `ui/Form` ↔ `ui/Field`.
 */
export interface Module {
  id: string; // "package/name"
  pkg: string;
  name: string;
  lines: number;
  imports: string[];
}

const raw: [id: string, lines: number, imports: string[]][] = [
  ["core/store", 420, ["core/events", "core/logger"]],
  ["core/events", 180, ["core/logger"]],
  ["core/logger", 90, ["core/store"]],
  ["core/config", 120, []],
  ["core/http", 310, ["core/config", "core/logger"]],
  ["ui/Button", 140, ["ui/theme"]],
  ["ui/Field", 210, ["ui/theme", "ui/Form"]],
  ["ui/Form", 380, ["ui/Field", "ui/Button", "core/store"]],
  ["ui/Modal", 260, ["ui/Button", "ui/theme"]],
  ["ui/theme", 75, ["core/config"]],
  ["ui/Table", 520, ["ui/theme", "core/store"]],
  ["features/login", 290, ["ui/Form", "ui/Button", "core/http", "core/store"]],
  ["features/search", 340, ["ui/Field", "ui/Table", "core/http"]],
  ["features/settings", 230, ["ui/Form", "ui/Modal", "core/config"]],
  ["features/reports", 610, ["ui/Table", "ui/Modal", "core/http", "core/events"]],
  ["app/main", 60, ["app/router", "core/config", "core/logger"]],
  [
    "app/router",
    150,
    ["features/login", "features/search", "features/settings", "features/reports"],
  ],
];

export const MODULES = new Map<string, Module>(
  raw.map(([id, lines, imports]) => {
    const [pkg, name] = id.split("/") as [string, string];
    return [id, { id, pkg, name, lines, imports }];
  }),
);

export const PACKAGES = [...new Set([...MODULES.values()].map((m) => m.pkg))];

export const modulesIn = (pkg: string) => [...MODULES.values()].filter((m) => m.pkg === pkg);

export const importersOf = (id: string) =>
  [...MODULES.values()].filter((m) => m.imports.includes(id));

/**
 * Which modules sit on an import cycle (Tarjan's strongly connected components). Computed on read
 * from the graph, never stored: it is something this example asserts, not something the data said.
 */
export const IN_CYCLE: ReadonlySet<string> = (() => {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result = new Set<string>();

  function visit(id: string) {
    index.set(id, counter);
    low.set(id, counter++);
    stack.push(id);
    onStack.add(id);
    for (const next of MODULES.get(id)!.imports) {
      if (!index.has(next)) {
        visit(next);
        low.set(id, Math.min(low.get(id)!, low.get(next)!));
      } else if (onStack.has(next)) {
        low.set(id, Math.min(low.get(id)!, index.get(next)!));
      }
    }
    if (low.get(id) === index.get(id)) {
      const component: string[] = [];
      let member: string;
      do {
        member = stack.pop()!;
        onStack.delete(member);
        component.push(member);
      } while (member !== id);
      if (component.length > 1) component.forEach((m) => result.add(m));
    }
  }

  for (const id of MODULES.keys()) if (!index.has(id)) visit(id);
  return result;
})();
