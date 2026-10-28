import catalogue from "./catalogue.json";

/**
 * The LEGO catalogue as a tree: themes, their sub-themes, and the sets in each. `catalogue.json` is
 * a snapshot of picabase's local catalogue (Rebrickable's data, 26 October 2026), building sets
 * only: the families picabase's own history leaves out (Books, Gear, Promotional, Service Packs and
 * the like) are left out here too. It is compact on purpose: a theme is `[name, parentIndex]`
 * (`-1` for a root), a set `[number, name, year, parts, themeIndex]` (`0` for an unknown year).
 */
export interface Theme {
  /** Its index in the catalogue: unique, and used as its focus. */
  id: string;
  name: string;
  parent: Theme | null;
  children: Theme[];
  /** Its own sets, not its sub-themes'. */
  sets: LegoSet[];
  /** Sets in it and every sub-theme. */
  total: number;
  /** A LEGO colour, `#rrggbb`: its plate's colour. */
  colour: string;
}

export interface LegoSet {
  /** Its index in the catalogue: unique (set numbers repeat across variants). */
  id: string;
  number: string;
  name: string;
  year: number | null;
  parts: number;
  theme: Theme;
}

/** Solid LEGO colours (Rebrickable's RGB values). Green is left out: it is the baseplate. */
export const LEGO_COLOURS = {
  red: "#C91A09",
  blue: "#0055BF",
  yellow: "#F2CD37",
  white: "#FFFFFF",
  black: "#05131D",
  lightBluishGray: "#A0A5A9",
  darkBluishGray: "#6C6E68",
  orange: "#FE8A18",
  tan: "#E4CD9E",
  reddishBrown: "#582A12",
  darkRed: "#720E0F",
  darkBlue: "#0A3463",
  mediumAzure: "#36AEBF",
  lime: "#BBE90B",
  darkPink: "#C870A0",
  magenta: "#923978",
  darkTurquoise: "#008F9B",
  brightLightOrange: "#F8BB3D",
  mediumBlue: "#5A93DB",
  darkTan: "#958A73",
  sandGreen: "#A0BCAC",
  darkOrange: "#A95500",
  mediumLavender: "#AC78BA",
  brightPink: "#E4ADC8",
} as const;

const PALETTE: string[] = Object.values(LEGO_COLOURS);

/** A few themes in the colour they are known by; the rest take one from the palette by name. */
const KNOWN: Record<string, string> = {
  Duplo: LEGO_COLOURS.red,
  "Star Wars": LEGO_COLOURS.darkBluishGray,
  City: LEGO_COLOURS.blue,
  Town: LEGO_COLOURS.yellow,
  Friends: LEGO_COLOURS.darkPink,
  Ninjago: LEGO_COLOURS.darkRed,
  Technic: LEGO_COLOURS.black,
  Creator: LEGO_COLOURS.orange,
  Bionicle: LEGO_COLOURS.darkTurquoise,
  Castle: LEGO_COLOURS.lightBluishGray,
  Space: LEGO_COLOURS.mediumBlue,
  "Harry Potter": LEGO_COLOURS.reddishBrown,
  Minecraft: LEGO_COLOURS.lime,
  Pirates: LEGO_COLOURS.tan,
  "Collectible Minifigures": LEGO_COLOURS.white,
};

export const hashString = (text: string) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** A palette colour for `key`, never `avoid` (so a sub-theme always reads apart from its parent). */
export function paletteColour(key: string, avoid?: string): string {
  const pick = hashString(key) % PALETTE.length;
  const colour = PALETTE[pick]!;
  return colour === avoid ? PALETTE[(pick + 1) % PALETTE.length]! : colour;
}

type ThemeRow = [string, number];
type SetRow = [string, string, number, number, number];

function build() {
  const themeRows = catalogue.themes as ThemeRow[];
  const themes: Theme[] = themeRows.map(([name], i) => ({ id: `t${i}`, name, parent: null, children: [], sets: [], total: 0, colour: "" }));
  themeRows.forEach(([, parent], i) => {
    if (parent < 0) return;
    themes[i]!.parent = themes[parent]!;
    themes[parent]!.children.push(themes[i]!);
  });
  (catalogue.sets as SetRow[]).forEach(([number, name, year, parts, theme], i) => {
    const owner = themes[theme]!;
    owner.sets.push({ id: `s${i}`, number, name, year: year === 0 ? null : year, parts, theme: owner });
    for (let t: Theme | null = owner; t; t = t.parent) t.total++;
  });
  // Biggest first, so the packer and the outline both meet the big themes first.
  const bySize = (a: Theme, b: Theme) => b.total - a.total || a.name.localeCompare(b.name);
  for (const theme of themes) {
    theme.children = theme.children.filter((child) => child.total > 0).sort(bySize);
  }
  const roots = themes.filter((theme) => theme.parent === null && theme.total > 0).sort(bySize);
  const colour = (theme: Theme) => {
    theme.colour = KNOWN[theme.name] ?? paletteColour(theme.name, theme.parent?.colour);
    theme.children.forEach(colour);
  };
  roots.forEach(colour);
  return { roots, byId: new Map(themes.map((theme) => [theme.id, theme])) };
}

export const CATALOGUE = build();

export const themeById = (id: string) => CATALOGUE.byId.get(id) ?? null;

/** The theme and the ones above it, outermost first. */
export function ancestry(theme: Theme | null): Theme[] {
  const chain: Theme[] = [];
  for (let t = theme; t; t = t.parent) chain.unshift(t);
  return chain;
}
