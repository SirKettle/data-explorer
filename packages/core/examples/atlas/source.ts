import {
  createSceneSource,
  type ExplorerCluster,
  type ExplorerNode,
  type ExplorerScene,
  type RampColours,
  type SceneSource,
} from "@data-xplorer/core";
import { delay } from "../shared/delay";
import { CONTINENTS, continentNamed, wiki, type Country, type VisitedStore } from "./data";

/**
 * The optional half of the contract:
 *
 * - `loadSceneStreaming`: a continent's countries arrive a few at a time, as a paged API would
 *   return them. The explorer draws the first page at once and folds the rest in, and
 *   `expectedItemCount` reserves room for all of them so the layout never has to grow.
 * - `subscribeToInvalidation` + `refreshScene`: marking a country visited changes data behind a
 *   scene that is already on screen, and the explorer redraws it in place, camera untouched.
 */
type ContinentName = string;

const PAGE_SIZE = 4;
const PAGE_MS = 350;

/** Sparse places blue, crowded places orange, by way of purple and red rather than back through
 *  green: the middle stops steer the hue, and `hsl` turns it the shorter way between each pair. */
export const DENSITY_RAMP: RampColours = {
  stops: ["hsl(215 75% 58%)", "hsl(272 75% 58%)", "hsl(328 75% 58%)", "hsl(25 75% 58%)"],
  interpolation: "hsl",
};
const DENSEST = 1500; // people per km², just above the densest country listed

function countryNode(country: Country, visited: VisitedStore): ExplorerNode<ContinentName> {
  const density = (country.population * 1000) / country.area; // people per km²
  const been = visited.has(country.name);
  return {
    id: country.name,
    label: country.name,
    sublabel: `${country.population} million`,
    weight: country.population,
    marks: [
      `${country.population} million people`,
      `${Math.round(density)} per km²`,
      ...(been ? ["visited"] : []),
    ],
    href: wiki(country.name),
    drillsInto: null,
    shape: "disc",
    ramp: Math.log(Math.max(density, 1)) / Math.log(DENSEST), // log scale: 2 per km² and 1,000 per km² both read
    emphasis: been ? ["ring"] : [],
    // US071 — a visited country asks for a pulse; the view's `effects` decide how it shows.
    effects: been ? ["pulse"] : [],
  };
}

function continentCluster(name: string, visited: VisitedStore): ExplorerCluster<ContinentName> {
  const countries = continentNamed(name)!.countries;
  const population = Math.round(countries.reduce((sum, country) => sum + country.population, 0));
  const been = countries.filter((country) => visited.has(country.name)).length;
  return {
    id: name,
    label: name,
    sublabel: `${countries.length} countries`,
    weight: population,
    marks: [
      `${population} million people (listed countries)`,
      `visited ${been} of ${countries.length}`,
    ],
    href: wiki(name),
    drillsInto: name,
    shape: "cloud",
    truncated: null,
    emphasis: been > 0 ? ["ring"] : [],
  };
}

function sceneFor(
  name: ContinentName | null,
  visited: VisitedStore,
  countryLimit = Infinity,
): ExplorerScene<ContinentName> {
  if (name === null) {
    return {
      id: "world",
      heading: "World",
      clusters: CONTINENTS.map((continent) => continentCluster(continent.name, visited)),
      nodes: [],
      edges: [],
    };
  }
  const countries = continentNamed(name)!.countries;
  return {
    id: name,
    heading: name,
    clusters: [],
    nodes: countries.slice(0, countryLimit).map((country) => countryNode(country, visited)),
    edges: [],
    expectedItemCount: countries.length,
  };
}

export function atlasSource(visited: VisitedStore): SceneSource<ContinentName> {
  const source = createSceneSource<ContinentName>({
    load: async (name) => {
      await delay(400);
      return sceneFor(name, visited);
    },

    // Resolve with the first page, then keep paging; each update is the fuller scene so far, and
    // the source caches the fullest it has seen, so a later visit comes straight from the cache.
    async loadStreaming(name, onUpdate) {
      const total = continentNamed(name)!.countries.length;
      await delay(400);
      void (async () => {
        for (let shown = PAGE_SIZE * 2; shown < total + PAGE_SIZE; shown += PAGE_SIZE) {
          await delay(PAGE_MS);
          onUpdate(sceneFor(name, visited, shown));
        }
      })();
      return sceneFor(name, visited, PAGE_SIZE);
    },

    parentOf: (name) => ({ kind: "anchored", focus: null, anchorId: name }),
  });
  // Marking a country visited changes every scene that shows it or counts it.
  visited.subscribe(() => source.invalidate());
  return source;
}

export const decodeContinent = (hash: string) => (continentNamed(hash) ? hash : null);
