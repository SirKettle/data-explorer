/**
 * A small atlas: a few countries per continent, with population (millions) and land area
 * (thousand km²). Figures are rounded and approximate; they are here to give the explorer
 * something real-looking to size and colour, not as a reference.
 */
export interface Country {
  name: string;
  population: number; // millions
  area: number; // thousand km²
}

export interface Continent {
  name: string;
  countries: Country[];
}

const c = (name: string, population: number, area: number): Country => ({ name, population, area });

export const CONTINENTS: Continent[] = [
  {
    name: "Asia",
    countries: [
      c("India", 1430, 3287),
      c("China", 1410, 9597),
      c("Indonesia", 278, 1905),
      c("Pakistan", 240, 882),
      c("Bangladesh", 173, 148),
      c("Japan", 124, 378),
      c("Philippines", 117, 300),
      c("Vietnam", 99, 331),
      c("Thailand", 72, 513),
      c("South Korea", 52, 100),
      c("Nepal", 30, 147),
      c("Mongolia", 3.4, 1564),
    ],
  },
  {
    name: "Africa",
    countries: [
      c("Nigeria", 224, 924),
      c("Ethiopia", 127, 1104),
      c("Egypt", 113, 1002),
      c("Democratic Republic of the Congo", 102, 2345),
      c("Tanzania", 67, 945),
      c("South Africa", 62, 1221),
      c("Kenya", 55, 580),
      c("Morocco", 37, 447),
      c("Ghana", 34, 239),
      c("Namibia", 2.6, 824),
    ],
  },
  {
    name: "Europe",
    countries: [
      c("Germany", 84, 357),
      c("France", 68, 552),
      c("United Kingdom", 68, 243),
      c("Italy", 59, 301),
      c("Spain", 48, 506),
      c("Poland", 37, 313),
      c("Netherlands", 18, 42),
      c("Sweden", 10.5, 450),
      c("Portugal", 10.4, 92),
      c("Greece", 10.4, 132),
      c("Norway", 5.5, 385),
      c("Ireland", 5.3, 70),
    ],
  },
  {
    name: "North America",
    countries: [
      c("United States", 335, 9834),
      c("Mexico", 129, 1964),
      c("Canada", 40, 9985),
      c("Guatemala", 18, 109),
      c("Cuba", 11, 110),
      c("Costa Rica", 5.2, 51),
      c("Jamaica", 2.8, 11),
    ],
  },
  {
    name: "South America",
    countries: [
      c("Brazil", 216, 8516),
      c("Colombia", 52, 1142),
      c("Argentina", 46, 2780),
      c("Peru", 34, 1285),
      c("Venezuela", 28, 916),
      c("Chile", 19.6, 756),
      c("Ecuador", 18, 284),
      c("Bolivia", 12, 1099),
      c("Uruguay", 3.4, 176),
    ],
  },
  {
    name: "Oceania",
    countries: [
      c("Australia", 27, 7692),
      c("Papua New Guinea", 10, 463),
      c("New Zealand", 5.2, 268),
      c("Fiji", 0.9, 18),
      c("Samoa", 0.2, 2.8),
    ],
  },
];

export const continentNamed = (name: string) =>
  CONTINENTS.find((continent) => continent.name === name) ?? null;

export const wiki = (title: string) =>
  `https://en.wikipedia.org/wiki/${title.replaceAll(" ", "_")}`;

/**
 * Which countries the viewer has visited: personal data, changed from the page. A real app would
 * keep it on a server; what matters here is that it changes underneath scenes already on screen.
 */
export function visitedStore(initial: string[]) {
  const visited = new Set(initial);
  const listeners = new Set<() => void>();
  let version = 0;
  return {
    has: (name: string) => visited.has(name),
    toggle(name: string) {
      if (!visited.delete(name)) visited.add(name);
      version++;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
}

export type VisitedStore = ReturnType<typeof visitedStore>;
