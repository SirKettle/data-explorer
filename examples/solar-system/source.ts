import { createSceneSource, type ExplorerEdge, type ExplorerNode, type ExplorerScene, type SceneSource } from "@thirkettle/data-explorer";
import { bodyById, PLANETS, SUN, type Body } from "./data";

/**
 * A star system as radial scenes: the Sun at the centre with its planets round it, each planet a
 * scene of its own with its moons. Every body is drawn with a same-origin texture (US071), except
 * Pluto, whose face lives on an origin the canvas may not read.
 */
type PlanetId = string;

/** Where a body's face is: `textures/` on this origin, or the no-CORS origin on the next port. */
export function faceUrl(face: string): string {
  if (face.startsWith("no-cors:")) {
    const port = Number(window.location.port || 80) + 1;
    return `${window.location.protocol}//${window.location.hostname}:${port}/${face.slice("no-cors:".length)}.svg`;
  }
  return `/solar-system/textures/${face}.svg`;
}

function bodyNode(body: Body, drillable: boolean): ExplorerNode<PlanetId> {
  return {
    id: body.id,
    label: body.name,
    sublabel: `${body.radiusKm.toLocaleString("en")} km`,
    weight: body.radiusKm,
    marks: [`radius ${body.radiusKm.toLocaleString("en")} km`, ...(body.moons.length ? [`${body.moons.length} moons shown`] : [])],
    href: `#${body.id}`,
    drillsInto: drillable && body.moons.length > 0 ? body.id : null,
    shape: "disc",
    texture: body.face ? { url: faceUrl(body.face) } : null,
    // A planet is drawn by the example's own renderer (planet-renderers.ts); the Sun and the
    // moons keep the built-in disc and texture.
    kind: body.kind ?? null,
    effects: body === SUN ? ["pulse"] : [],
  };
}

function orbits(centre: Body, around: Body[]): ExplorerEdge[] {
  return around.map((body) => ({ id: `${body.id}-orbits-${centre.id}`, sourceId: body.id, targetId: centre.id, kind: "orbits" }));
}

function buildScene(focus: PlanetId | null): ExplorerScene<PlanetId> {
  const centre = focus === null ? SUN : bodyById.get(focus)!;
  const around = focus === null ? PLANETS : centre.moons;
  return {
    id: centre.id,
    heading: focus === null ? "The Solar System" : centre.name,
    focusId: centre.id, // radial: the centre body in the middle, what orbits it around
    clusters: [],
    nodes: [bodyNode(centre, false), ...around.map((body) => bodyNode(body, focus === null))],
    edges: orbits(centre, around),
  };
}

export function solarSystemSource(): SceneSource<PlanetId> {
  return createSceneSource<PlanetId>({
    load: buildScene,
    // A planet's scene sits inside its own disc in the Sun's.
    parentOf: (planet) => ({ kind: "anchored", focus: null, anchorId: planet }),
  });
}

export const decodePlanet = (hash: string): PlanetId | null => (PLANETS.some((p) => p.id === hash) ? hash : null);
