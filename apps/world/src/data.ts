import type { ExplorerOutline, ExplorerPoint, ExplorerRect } from "@data-xplorer/core";
import { geoArea, geoCentroid, geoNaturalEarth1, geoPath, geoStream, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json";
import { CONTINENTS, LABEL_AT } from "./continents";

/**
 * The world, projected once: every country's outline and box in one set of map units (the Natural
 * Earth projection's), which is all a fixed layout needs. The explorer never sees a longitude.
 */
export interface Place {
  name: string;
  /** Polygons, each its edge then its holes, in map units. */
  outline: ExplorerOutline;
  box: ExplorerRect;
  labelAt: ExplorerPoint;
}

export interface Continent extends Place {
  countries: Place[];
}

const projection = geoNaturalEarth1();
const [[left, top], [right, bottom]] = geoPath(projection).bounds({ type: "Sphere" });
const mapWidth = right - left;

/** The whole map's extent: the projected globe. */
export const WORLD: ExplorerRect = { x: left, y: top, width: mapWidth, height: bottom - top };

const project = ([lon, lat]: [number, number]): ExplorerPoint => {
  const [x, y] = projection([lon, lat])!;
  return { x, y };
};

/** A feature's projected rings, as d3 streams them: cut at the antimeridian, ready to draw. */
function projectedRings(object: GeoPermissibleObjects): number[][][] {
  const rings: number[][][] = [];
  let ring: number[][] = [];
  geoStream(
    object,
    projection.stream({
      point: (x, y) => void ring.push([x, y]),
      lineStart: () => void (ring = []),
      lineEnd: () => void (ring.length > 2 && rings.push(ring)),
      polygonStart() {},
      polygonEnd() {},
      sphere() {},
    }),
  );
  return rings;
}

const area = (ring: number[][]) => Math.abs(ring.reduce((sum, [x, y], i) => sum + x! * ring[(i + 1) % ring.length]![1]! - ring[(i + 1) % ring.length]![0]! * y!, 0) / 2);
const midX = (ring: number[][]) => ring.reduce((sum, [x]) => sum + x!, 0) / ring.length;

function inside(ring: number[][], [px, py]: number[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > py! !== yj! > py! && px! < ((xj! - xi!) * (py! - yi!)) / (yj! - yi!) + xi!) hit = !hit;
  }
  return hit;
}

/**
 * Rings into polygons: biggest first, each either a hole in a polygon already found (Lesotho in
 * South Africa) or a polygon of its own. A piece cut off at the antimeridian (Chukotka, half of
 * Fiji) is moved back beside the rest of its country, so the country's box stays compact.
 */
function toOutline(rings: number[][][]): ExplorerOutline {
  const sorted = [...rings].sort((a, b) => area(b) - area(a));
  const main = sorted[0] ? midX(sorted[0]) : 0;
  const polygons: number[][][][] = [];
  for (let ring of sorted) {
    const shift = midX(ring) - main > mapWidth / 2 ? -mapWidth : main - midX(ring) > mapWidth / 2 ? mapWidth : 0;
    if (shift) ring = ring.map(([x, y]) => [x! + shift, y!]);
    const container = polygons.find((polygon) => inside(polygon[0]!, ring[0]!));
    if (container) container.push(ring);
    else polygons.push([ring]);
  }
  return polygons;
}

function boxOf(outline: ExplorerOutline): ExplorerRect {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of outline)
    for (const [x, y] of polygon[0]!) {
      x0 = Math.min(x0, x!);
      y0 = Math.min(y0, y!);
      x1 = Math.max(x1, x!);
      y1 = Math.max(y1, y!);
    }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const topology = atlas as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
const countryByName = new Map<string, Place>();
for (const country of feature(topology, topology.objects.countries).features) {
  const outline = toOutline(projectedRings(country));
  // The label goes in the middle of the country's biggest piece, not of its box (the USA's box
  // takes in Alaska, whose middle is in Canada).
  const biggest =
    country.geometry.type === "MultiPolygon"
      ? country.geometry.coordinates.map((coordinates) => ({ type: "Polygon" as const, coordinates })).sort((a, b) => geoArea(b) - geoArea(a))[0]!
      : country;
  countryByName.set(country.properties.name, {
    name: country.properties.name,
    outline,
    box: boxOf(outline),
    labelAt: project(geoCentroid(biggest) as [number, number]),
  });
}

/** Continents, their countries alphabetical. A continent's outline is all of its countries'. */
export const continents: Continent[] = Object.entries(CONTINENTS).map(([name, names]) => {
  const countries = names.map((n) => countryByName.get(n)!).sort((a, b) => a.name.localeCompare(b.name));
  const outline = countries.flatMap((c) => c.outline);
  return { name, countries, outline, box: boxOf(outline), labelAt: project(LABEL_AT[name]!) };
});

export const continentByName = new Map(continents.map((c) => [c.name, c]));
