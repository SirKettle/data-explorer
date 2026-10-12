/**
 * The Sun, its planets, one dwarf planet and some of their moons. Radii are mean radii in km,
 * rounded; they are what each body's size is drawn from, and the viewer can read them.
 */
export interface Body {
  /** Ordered, so the radial ring (sorted by id) goes round in orbital order. */
  id: string;
  name: string;
  radiusKm: number;
  /** A face in `textures/`, or `null` for a body without one. */
  face: string | null;
  /** The custom renderer that draws it, if any: `planet`, or `ringed-planet` for Saturn. */
  kind?: "planet" | "ringed-planet";
  moons: Body[];
}

const moon = (id: string, name: string, radiusKm: number, face: string | null = "moon"): Body => ({ id, name, radiusKm, face, moons: [] });

export const SUN: Body = { id: "sun", name: "Sun", radiusKm: 696_340, face: "sun", moons: [] };

export const PLANETS: Body[] = [
  { id: "p1-mercury", name: "Mercury", radiusKm: 2_440, face: "mercury", kind: "planet", moons: [] },
  { id: "p2-venus", name: "Venus", radiusKm: 6_052, face: "venus", kind: "planet", moons: [] },
  { id: "p3-earth", name: "Earth", radiusKm: 6_371, face: "earth", kind: "planet", moons: [moon("m1-moon", "Moon", 1_737)] },
  { id: "p4-mars", name: "Mars", radiusKm: 3_390, face: "mars", kind: "planet", moons: [moon("m1-phobos", "Phobos", 11), moon("m2-deimos", "Deimos", 6)] },
  {
    id: "p5-jupiter",
    name: "Jupiter",
    radiusKm: 69_911,
    face: "jupiter",
    kind: "planet",
    moons: [moon("m1-io", "Io", 1_822, "io"), moon("m2-europa", "Europa", 1_561, "europa"), moon("m3-ganymede", "Ganymede", 2_634), moon("m4-callisto", "Callisto", 2_410)],
  },
  {
    id: "p6-saturn",
    name: "Saturn",
    radiusKm: 58_232,
    face: "saturn",
    kind: "ringed-planet",
    moons: [moon("m1-enceladus", "Enceladus", 252), moon("m2-rhea", "Rhea", 764), moon("m3-titan", "Titan", 2_575, "titan")],
  },
  { id: "p7-uranus", name: "Uranus", radiusKm: 25_362, face: "uranus", kind: "planet", moons: [moon("m1-miranda", "Miranda", 236), moon("m2-titania", "Titania", 789), moon("m3-oberon", "Oberon", 761)] },
  { id: "p8-neptune", name: "Neptune", radiusKm: 24_622, face: "neptune", kind: "planet", moons: [moon("m1-triton", "Triton", 1_353)] },
  // Its face is served from a second origin with no CORS header: the canvas may not use it.
  { id: "p9-pluto", name: "Pluto", radiusKm: 1_188, face: "no-cors:pluto", kind: "planet", moons: [moon("m1-charon", "Charon", 606)] },
];

export const bodyById = new Map<string, Body>([[SUN.id, SUN], ...PLANETS.map((p) => [p.id, p] as const)]);
