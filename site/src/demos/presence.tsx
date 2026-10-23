import { useCallback, useState } from "react";
import { createSceneSource, DataExplorer } from "@thirkettle/data-explorer";

// Programming languages, sized by how widely they are taught, placed once. Presence fades in each
// language from the year it appeared, so the map grows as the slider moves and nothing is relaid out.
const languages: [name: string, year: number, weight: number][] = [
  ["Fortran", 1957, 6],
  ["Lisp", 1958, 5],
  ["COBOL", 1959, 5],
  ["BASIC", 1964, 5],
  ["C", 1972, 10],
  ["SQL", 1974, 9],
  ["C++", 1985, 9],
  ["Perl", 1987, 4],
  ["Haskell", 1990, 4],
  ["Python", 1991, 12],
  ["Java", 1995, 11],
  ["JavaScript", 1995, 12],
  ["PHP", 1995, 6],
  ["Ruby", 1995, 5],
  ["C#", 2000, 8],
  ["Go", 2009, 6],
  ["Rust", 2015, 6],
  ["TypeScript", 2012, 9],
  ["Swift", 2014, 6],
  ["Kotlin", 2011, 5],
];
const released = new Map(languages.map(([name, year]) => [name, year]));

const source = createSceneSource<null>({
  load: () => ({
    id: "languages",
    heading: "Programming languages",
    clusters: [],
    nodes: languages.map(([name, , weight]) => ({
      id: name,
      label: name,
      weight,
      href: `#${name}`,
      drillsInto: null,
      shape: "disc" as const,
    })),
    edges: [],
  }),
});

export default function Presence() {
  const [year, setYear] = useState(1975);
  // A new function when the year changes is what tells the explorer to redraw; items ease to it.
  const presence = useCallback((id: string) => ((released.get(id) ?? 0) <= year ? 1 : 0), [year]);
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Year{" "}
          <input type="range" min={1955} max={2020} value={year} onChange={(e) => setYear(Number(e.target.value))} /> {year}
        </label>
      </div>
      <DataExplorer source={source} focus={null} presence={presence} />
    </>
  );
}
