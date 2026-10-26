import { createSceneSource, type ExplorerNode, type SceneSource } from "@data-xplorer/core";
import { continentByName, continents, WORLD, type Place } from "./data";

/**
 * The world as fixed scenes of regions: continents at the top, each entered to its countries. A
 * focus is a continent's name. Every scene is in the same map units, and a continent's scene is
 * bounded by that continent's own box, so its countries land exactly where it was drawn.
 */
type ContinentName = string;

// No `ramp` or `color`: each region keeps the explorer's stable colour of its own, so neighbours
// stand apart, as on a political map.
function region(place: Place, drillsInto: ContinentName | null, sublabel: string | null): ExplorerNode<ContinentName> {
  return {
    id: place.name,
    label: place.name,
    sublabel,
    weight: 1, // a fixed scene sizes nothing by weight
    href: `#${encodeURIComponent(place.name)}`,
    drillsInto,
    shape: "region",
    box: place.box,
    outline: place.outline,
    labelAt: place.labelAt,
  };
}

export function worldMapSource(): SceneSource<ContinentName> {
  return createSceneSource<ContinentName>({
    load(focus) {
      if (focus === null) {
        return {
          id: "world",
          heading: "The world",
          layout: "fixed",
          bounds: WORLD,
          clusters: continents.map((c) => region(c, c.name, `${c.countries.length} countries`)),
          nodes: [],
          edges: [],
        };
      }
      const continent = continentByName.get(focus);
      if (!continent) throw new Error(`no continent ${focus}`);
      return {
        id: continent.name,
        heading: continent.name,
        layout: "fixed",
        bounds: continent.box,
        clusters: [],
        nodes: continent.countries.map((country) => region(country, null, null)),
        edges: [],
      };
    },
    parentOf: (focus) => ({ kind: "anchored", focus: null, anchorId: focus }),
  });
}

export const decodeContinent = (hash: string): ContinentName | null => (continentByName.has(hash) ? hash : null);
