/**
 * Trainer profile: appearance options, the pixel sprite built from them, and
 * the rank and stats derived from the rest of the game. Pure, no storage.
 */

export const NAME_MAX = 10;

export const SKIN_TONES = ["#ffe3cc", "#f5c9a0", "#d9a273", "#b07a4f", "#7d5236", "#553522"] as const;
export const HAIR_COLORS = ["#2b2530", "#5a3620", "#8a5a33", "#e6c26a", "#f0e2b6", "#b8402e", "#e98aa8", "#4a6fd0", "#d9d9e3"] as const;
export const EYE_COLORS = ["#5a3a24", "#3b6fd8", "#3e9a5a", "#6b6b78", "#c08a2a", "#8a4fc0"] as const;
/** Shared by the hat, the top, the bottom and the shoes. */
export const CLOTH_COLORS = [
  "#d8343c", // red
  "#e86fa0", // pink
  "#f0884a", // orange
  "#f2c94c", // yellow
  "#3fa66b", // green
  "#2fa3a8", // teal
  "#3a6ed8", // blue
  "#283a6b", // navy
  "#7d4fc4", // purple
  "#7a4a2a", // brown
  "#2b2b33", // black
  "#f4f4f6", // white
] as const;

export const HAIR_STYLES = ["short", "messy", "long", "ponytail", "bob", "bald"] as const;
export const HAT_STYLES = ["none", "cap", "fedora", "beanie"] as const;
export const TOP_STYLES = ["jacket", "tee", "hoodie", "sleeveless"] as const;
export const BOTTOM_STYLES = ["pants", "shorts", "skirt"] as const;
export const EXTRA_STYLES = ["none", "bag", "glasses"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export type HatStyle = (typeof HAT_STYLES)[number];
export type TopStyle = (typeof TOP_STYLES)[number];
export type BottomStyle = (typeof BOTTOM_STYLES)[number];
export type ExtraStyle = (typeof EXTRA_STYLES)[number];

export interface Appearance {
  skin: number;
  hair: HairStyle;
  hairColor: number;
  eyes: number;
  hat: HatStyle;
  hatColor: number;
  top: TopStyle;
  topColor: number;
  bottom: BottomStyle;
  bottomColor: number;
  shoes: number;
  extra: ExtraStyle;
}

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 1,
  hair: "short",
  hairColor: 1,
  eyes: 0,
  hat: "cap",
  hatColor: 0,
  top: "jacket",
  topColor: 6,
  bottom: "pants",
  bottomColor: 7,
  shoes: 0,
  extra: "bag",
};

type Field =
  | { key: AppearanceKey; label: string; styles: readonly string[] }
  | { key: AppearanceKey; label: string; colors: readonly string[] };

/** One editor row per appearance field, in the order the editor lists them. */
export const APPEARANCE_FIELDS: readonly Field[] = [
  { key: "skin", label: "SKIN", colors: SKIN_TONES },
  { key: "hair", label: "HAIR", styles: HAIR_STYLES },
  { key: "hairColor", label: "HAIR COLOR", colors: HAIR_COLORS },
  { key: "eyes", label: "EYES", colors: EYE_COLORS },
  { key: "hat", label: "HAT", styles: HAT_STYLES },
  { key: "hatColor", label: "HAT COLOR", colors: CLOTH_COLORS },
  { key: "top", label: "TOP", styles: TOP_STYLES },
  { key: "topColor", label: "TOP COLOR", colors: CLOTH_COLORS },
  { key: "bottom", label: "BOTTOM", styles: BOTTOM_STYLES },
  { key: "bottomColor", label: "BOTTOM COLOR", colors: CLOTH_COLORS },
  { key: "shoes", label: "SHOES", colors: CLOTH_COLORS },
  { key: "extra", label: "EXTRA", styles: EXTRA_STYLES },
];

export type AppearanceKey = keyof Appearance;

const fieldOf = (key: AppearanceKey) => APPEARANCE_FIELDS.find((f) => f.key === key)!;
const optionCount = (f: Field) => ("styles" in f ? f.styles.length : f.colors.length);
const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** Position of the field's current value among its options. */
function indexOf(a: Appearance, f: Field): number {
  const v = a[f.key];
  return "styles" in f ? f.styles.indexOf(v as string) : (v as number);
}

function withIndex(a: Appearance, f: Field, i: number): Appearance {
  return { ...a, [f.key]: "styles" in f ? f.styles[i] : i };
}

/** Steps one appearance field to its previous/next option (wraps). */
export function stepAppearance(a: Appearance, key: AppearanceKey, delta: number): Appearance {
  const f = fieldOf(key);
  return withIndex(a, f, wrap(indexOf(a, f) + delta, optionCount(f)));
}

/** Display value of a field: the style name, or a color swatch. */
export function appearanceValue(a: Appearance, key: AppearanceKey): { text: string } | { color: string } {
  const f = fieldOf(key);
  return "styles" in f ? { text: String(a[key]).toUpperCase() } : { color: f.colors[a[key] as number] };
}

/** A random look (rng returns [0, 1)). */
export function randomAppearance(rng: () => number = Math.random): Appearance {
  return APPEARANCE_FIELDS.reduce((a, f) => withIndex(a, f, Math.floor(rng() * optionCount(f))), DEFAULT_APPEARANCE);
}

/** Keeps saved data usable: unknown or out-of-range values fall back to the default. */
export function sanitizeAppearance(value: unknown): Appearance {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return APPEARANCE_FIELDS.reduce((a, f) => {
    const x = v[f.key];
    const valid = "styles" in f ? f.styles.includes(x as string) : Number.isInteger(x) && (x as number) >= 0 && (x as number) < f.colors.length;
    return valid ? { ...a, [f.key]: x } : a;
  }, DEFAULT_APPEARANCE);
}

/** Upper-cases, keeps the characters the on-screen keyboard can type, trims to NAME_MAX. */
export function cleanName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 .'-]/g, "")
    .replace(/\s+/g, " ")
    .trimStart()
    .slice(0, NAME_MAX);
}

/* Sprite: 24 x 40 pixels, front-facing, about five heads tall. It's drawn
   from simple shapes, back to front, then shaded (light from the upper left)
   and outlined automatically. Letters:
   s skin      h hair     c hat      t top      b bottom   f shoes
   n/y/q/u/d/x their shades (skin/hair/hat/top/bottom/strap)
   r bag strap  g sole    w white    k black    e lashes   i iris
   v eye white  m mouth   o outline */

export const SPRITE_W = 24;
export const SPRITE_H = 40;

type Grid = string[][];

/** Base material → its shade. */
const SHADE: Record<string, string> = { s: "n", h: "y", c: "q", t: "u", b: "d", r: "x" };
const MATERIAL: Record<string, string> = Object.fromEntries(Object.entries(SHADE).map(([base, shade]) => [shade, base]));
/** Small details that don't cast or receive edge shading. */
const DETAILS = new Set(["e", "i", "v", "m", "k"]);

const material = (ch: string) => MATERIAL[ch] ?? ch;

function painter(g: Grid) {
  const px = (x: number, y: number, ch: string) => {
    if (y >= 0 && y < SPRITE_H && x >= 0 && x < SPRITE_W) g[y][x] = ch;
  };
  const span = (y: number, x0: number, x1: number, ch: string) => {
    for (let x = x0; x <= x1; x++) px(x, y, ch);
  };
  return {
    px,
    span,
    /** Pixel and its mirror across the vertical center line. */
    mpx: (x: number, y: number, ch: string) => {
      px(x, y, ch);
      px(SPRITE_W - 1 - x, y, ch);
    },
    /** Span on the left half and its mirror. */
    mspan: (y: number, x0: number, x1: number, ch: string) => {
      span(y, x0, x1, ch);
      span(y, SPRITE_W - 1 - x1, SPRITE_W - 1 - x0, ch);
    },
    /** Span centered on the sprite, 2 * half wide. */
    row: (y: number, half: number, ch: string) => span(y, SPRITE_W / 2 - half, SPRITE_W / 2 - 1 + half, ch),
  };
}

type Paint = ReturnType<typeof painter>;

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function hairBack(p: Paint, style: HairStyle) {
  if (style === "long") range(5, 21).forEach((y) => p.row(y, 6, "h"));
  if (style === "bob") range(5, 13).forEach((y) => p.row(y, 6, "h"));
  if (style === "ponytail") {
    range(5, 15).forEach((y) => p.span(y, 17, 19, "h"));
    p.span(16, 18, 19, "h");
    p.px(19, 17, "h");
  }
}

function bottomPiece(p: Paint, a: Appearance) {
  switch (a.bottom) {
    case "pants":
      p.row(25, 5, "d");
      range(26, 27).forEach((y) => p.row(y, 5, "b"));
      range(28, 35).forEach((y) => p.mspan(y, 7, 10, "b"));
      p.mspan(35, 7, 10, "d"); // hem
      break;
    case "shorts":
      p.row(25, 5, "d");
      range(26, 28).forEach((y) => p.row(y, 5, "b"));
      range(29, 30).forEach((y) => p.mspan(y, 7, 10, "b"));
      range(31, 35).forEach((y) => p.mspan(y, 8, 10, "s"));
      break;
    case "skirt":
      // High-waisted and flared, with pleats.
      p.row(25, 5, "b");
      range(26, 27).forEach((y) => p.row(y, 6, "b"));
      range(28, 29).forEach((y) => p.row(y, 7, "b"));
      range(26, 29).forEach((y) => {
        p.mpx(9, y, "d");
        p.mpx(y < 28 ? 6 : 5, y, "d");
      });
      range(30, 35).forEach((y) => p.mspan(y, 8, 10, "s"));
      break;
  }
  // Shoes with a light sole.
  p.mspan(36, 7, 10, "f");
  p.mspan(37, 6, 10, "f");
  p.mspan(38, 6, 10, "g");
}

function topPiece(p: Paint, a: Appearance) {
  const sleeve = (from: number, to: number, ch: string) => range(from, to).forEach((y) => p.mspan(y, 4, 5, ch));
  const torso = () => range(17, 24).forEach((y) => p.row(y, 5, "t"));
  switch (a.top) {
    case "tee":
      p.row(15, 4, "t");
      p.row(16, 7, "t");
      torso();
      sleeve(17, 19, "t");
      p.mspan(19, 4, 5, "u");
      sleeve(20, 25, "s");
      p.span(15, 11, 12, "s"); // neckline
      p.mpx(10, 15, "u");
      break;
    case "jacket":
      p.row(15, 4, "t");
      p.row(16, 7, "t");
      torso();
      sleeve(17, 25, "t");
      p.mspan(25, 4, 5, "u"); // cuffs
      range(15, 24).forEach((y) => p.span(y, 10, 13, "w")); // shirt under it
      p.span(15, 11, 12, "s");
      range(16, 19).forEach((y, i) => p.mpx(10 + Math.min(i, 1), y, "u")); // lapels
      p.mspan(14, 8, 9, "t"); // popped collar
      p.row(24, 5, "u");
      p.span(24, 10, 13, "w");
      break;
    case "hoodie":
      p.row(14, 3, "u"); // hood behind the neck
      p.row(15, 5, "t");
      p.row(16, 7, "t");
      torso();
      sleeve(17, 25, "t");
      p.mspan(25, 4, 5, "u");
      range(21, 23).forEach((y) => p.row(y, 3, "u")); // pocket
      range(16, 18).forEach((y) => p.mpx(10, y, "w")); // strings
      p.row(24, 5, "u");
      break;
    case "sleeveless":
      p.row(15, 4, "s");
      p.mspan(16, 5, 6, "s");
      p.row(16, 5, "t");
      torso();
      sleeve(17, 25, "s");
      p.span(16, 11, 12, "s"); // neckline
      p.mpx(10, 16, "u");
      p.row(24, 5, "u");
      break;
  }
  p.mspan(26, 4, 5, "s"); // hands
  p.mspan(27, 4, 5, "s");
}

function head(p: Paint, a: Appearance) {
  p.row(14, 1, "n"); // neck, in the chin's shadow
  const widths: [number, number][] = [[3, 3], [4, 4], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 4], [12, 3], [13, 2]];
  for (const [y, half] of widths) p.row(y, half, "s");
  p.mpx(6, 9, "s"); // ears
  p.mpx(6, 10, "n");
  // Brows, lashes, eyes (iris outside, highlight inside), nose, mouth.
  p.mspan(7, 9, 10, "y");
  p.mspan(8, 9, 10, "e");
  p.mpx(9, 9, "i");
  p.mpx(10, 9, "v");
  p.px(12, 10, "n");
  p.span(12, 11, 12, "m");
  if (a.extra === "glasses") {
    p.mspan(8, 8, 11, "k");
    p.mpx(8, 9, "k");
    p.mpx(11, 9, "k");
    p.mspan(10, 9, 10, "k");
  }
}

function hairFront(p: Paint, style: HairStyle) {
  if (style === "bald") return;
  p.row(2, 3, "h");
  p.row(3, 5, "h");
  p.row(4, 6, "h");
  p.row(5, 6, "h");
  range(6, 8).forEach((y) => p.mspan(y, 6, 7, "h"));
  switch (style) {
    case "short":
      p.span(6, 8, 10, "h");
      p.span(6, 14, 15, "h");
      break;
    case "messy":
      [7, 10, 14].forEach((x) => p.span(1, x, x + 1, "h"));
      p.row(2, 5, "h");
      [8, 10, 13, 15].forEach((x) => p.px(x, 6, "h"));
      p.px(9, 7, "h");
      p.px(14, 7, "h");
      p.mpx(5, 5, "h");
      p.mpx(5, 6, "h");
      break;
    case "long":
      p.span(6, 7, 13, "h");
      p.span(7, 7, 8, "h");
      range(9, 17).forEach((y) => p.mspan(y, 6, 7, "h"));
      p.mspan(18, 6, 6, "h");
      break;
    case "ponytail":
      p.span(6, 7, 12, "h");
      p.px(7, 7, "h");
      p.span(5, 17, 18, "k"); // hair tie
      break;
    case "bob":
      p.span(6, 7, 16, "h");
      range(9, 11).forEach((y) => p.mspan(y, 6, 7, "h"));
      p.mspan(12, 6, 8, "h");
      break;
  }
}

function hat(p: Paint, style: HatStyle) {
  switch (style) {
    case "cap":
      p.row(1, 3, "c");
      p.row(2, 5, "c");
      range(3, 5).forEach((y) => p.row(y, 6, "c"));
      p.span(3, 11, 12, "w"); // badge
      p.span(4, 11, 12, "w");
      p.row(6, 7, "q"); // brim
      break;
    case "fedora":
      // Wide-brimmed hat with a dark band and a side bow. The crown is
      // narrower than the hair, so clear the hair beside it.
      range(1, 4).forEach((y) => p.mspan(y, 0, 6, "."));
      p.row(0, 3, "c");
      p.row(1, 4, "c");
      p.row(2, 5, "c");
      p.row(3, 5, "c");
      p.span(0, 11, 12, "q"); // crease
      p.row(4, 5, "k");
      p.span(3, 16, 17, "k");
      p.px(18, 4, "k");
      p.row(5, 9, "c");
      p.row(6, 8, "q");
      break;
    case "beanie":
      p.row(1, 4, "c");
      p.row(2, 5, "c");
      range(3, 4).forEach((y) => p.row(y, 6, "c"));
      range(5, 6).forEach((y) => p.row(y, 6, "q"));
      range(6, 17).filter((x) => x % 2 === 0).forEach((x) => p.px(x, 6, "c")); // ribbing
      break;
  }
}

function bag(p: Paint) {
  range(0, 8).forEach((i) => p.px(8 + i, 16 + i, "r")); // strap across the chest
  p.span(24, 15, 19, "x");
  range(25, 27).forEach((y) => p.span(y, 15, 19, "r"));
  p.px(17, 25, "g"); // clasp
}

/** Shading: the right edge of each material and skin under hair or a hat. */
function shade(g: Grid) {
  const out = g.map((r) => [...r]);
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      const ch = g[y][x];
      if (!(ch in SHADE)) continue;
      const right = g[y][x + 1] ?? ".";
      const above = g[y - 1]?.[x] ?? ".";
      const edge = right === "." || (material(right) !== ch && !DETAILS.has(right) && right !== "w");
      const underHair = ch === "s" && ["h", "y", "c", "q"].includes(above);
      if (edge || underHair) out[y][x] = SHADE[ch];
    }
  }
  return out;
}

/** Dark outline around the silhouette (and in the gaps between limbs). */
function outline(g: Grid) {
  const out = g.map((r) => [...r]);
  for (let y = 0; y < SPRITE_H; y++) {
    for (let x = 0; x < SPRITE_W; x++) {
      if (g[y][x] !== ".") continue;
      const filled = [g[y - 1]?.[x], g[y + 1]?.[x], g[y][x - 1], g[y][x + 1]].some((n) => n !== undefined && n !== ".");
      if (filled) out[y][x] = "o";
    }
  }
  return out;
}

/** The trainer sprite as rows of palette letters (see above). */
export function spriteRows(a: Appearance): string[] {
  const grid: Grid = Array.from({ length: SPRITE_H }, () => Array<string>(SPRITE_W).fill("."));
  const p = painter(grid);
  hairBack(p, a.hair);
  bottomPiece(p, a);
  topPiece(p, a);
  if (a.extra === "bag") bag(p);
  head(p, a);
  hairFront(p, a.hair);
  hat(p, a.hat);
  return outline(shade(grid)).map((row) => row.join(""));
}

/** Darkens a #rrggbb color (amount 0..1), nudging it toward blue like hand-picked shades. */
function darken(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number, bias: number) => Math.round(((n >> shift) & 255) * (1 - amount) + bias);
  const [r, g, b] = [channel(16, 0), channel(8, 0), channel(0, 12)].map((c) => Math.max(0, Math.min(255, c)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** Colors for each sprite letter. */
export function spritePalette(a: Appearance): Record<string, string> {
  const skin = SKIN_TONES[a.skin];
  const hair = HAIR_COLORS[a.hairColor];
  const hatColor = CLOTH_COLORS[a.hatColor];
  const top = CLOTH_COLORS[a.topColor];
  const bottom = CLOTH_COLORS[a.bottomColor];
  const strap = "#8a5a33";
  return {
    o: "#24202c",
    s: skin,
    n: darken(skin, 0.18),
    h: hair,
    y: darken(hair, 0.3),
    c: hatColor,
    q: darken(hatColor, 0.28),
    t: top,
    u: darken(top, 0.25),
    b: bottom,
    d: darken(bottom, 0.25),
    f: CLOTH_COLORS[a.shoes],
    g: "#e8e8ee",
    r: strap,
    x: darken(strap, 0.3),
    w: "#f7f7fa",
    k: "#2a2630",
    e: "#24202c",
    i: EYE_COLORS[a.eyes],
    v: "#ffffff",
    m: darken(skin, 0.35),
  };
}

/* Rank and stats */

export const RANKS = [
  { wins: 0, title: "ROOKIE" },
  { wins: 5, title: "TRAINER" },
  { wins: 20, title: "ACE TRAINER" },
  { wins: 50, title: "VETERAN" },
  { wins: 100, title: "CHAMPION" },
] as const;

/** Title for this many battle wins, and how many more the next one needs. */
export function rankOf(wins: number): { title: string; next: number | null } {
  let i = 0;
  while (i + 1 < RANKS.length && wins >= RANKS[i + 1].wins) i++;
  return { title: RANKS[i].title, next: i + 1 < RANKS.length ? RANKS[i + 1].wins - wins : null };
}

export interface BattleTotals {
  wins: number;
  losses: number;
  /** Dex number of the Pokémon with the most wins (ties: fewest losses, then lowest number). */
  bestId: number | null;
}

export function battleTotals(records: { [dexId: number]: { wins: number; losses: number } }): BattleTotals {
  let wins = 0;
  let losses = 0;
  let best: { id: number; wins: number; losses: number } | null = null;
  for (const [key, r] of Object.entries(records)) {
    const id = Number(key);
    wins += r.wins;
    losses += r.losses;
    if (r.wins > 0 && (!best || r.wins > best.wins || (r.wins === best.wins && (r.losses < best.losses || (r.losses === best.losses && id < best.id))))) {
      best = { id, wins: r.wins, losses: r.losses };
    }
  }
  return { wins, losses, bestId: best?.id ?? null };
}

/** Five-digit trainer ID. */
export const newTrainerId = (rng: () => number = Math.random) => String(Math.floor(rng() * 100_000)).padStart(5, "0");
