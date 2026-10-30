import type { Pokemon, Stats } from "@/data/pokedex";
import { statTotal } from "./listing.ts";
import { dexOf, stageOf } from "./tamagotchi.ts";

/**
 * Fun facts computed from the Pokédex data itself, by comparing a Pokémon
 * with all the others (rankings, rarities, comparisons). Each candidate fact
 * gets an "interest" score; the most interesting ones are shown.
 */

interface Fact {
  text: string;
  score: number;
}

const STAT_LABELS: Record<keyof Stats, string> = {
  hp: "HP",
  attack: "Attack",
  defense: "Defense",
  specialAttack: "Sp. Atk",
  specialDefense: "Sp. Def",
  speed: "Speed",
};

const PIKACHU_ID = 25;
const TOP = 10;
const EXTREME_SHARE = 0.05;

/** Whole-dex aggregates, computed once per list. */
interface Context {
  n: number;
  totals: number[];
  stats: Record<keyof Stats, number[]>;
  heights: number[];
  weights: number[];
  typeCounts: Map<string, number>;
  pikachuKg: number;
}

const contexts = new WeakMap<readonly Pokemon[], Context>();

const typeKey = (p: Pokemon) => [...p.types].sort().join("/");
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const typeLabel = (p: Pokemon) => p.types.map(capitalize).join("/");

function contextOf(list: readonly Pokemon[]): Context {
  let ctx = contexts.get(list);
  if (!ctx) {
    const keys = Object.keys(STAT_LABELS) as (keyof Stats)[];
    const typeCounts = new Map<string, number>();
    for (const p of list) typeCounts.set(typeKey(p), (typeCounts.get(typeKey(p)) ?? 0) + 1);
    ctx = {
      n: list.length,
      totals: list.map(statTotal),
      stats: Object.fromEntries(keys.map((k) => [k, list.map((p) => p.stats[k])])) as Context["stats"],
      heights: list.map((p) => p.heightM),
      weights: list.map((p) => p.weightKg),
      typeCounts,
      pikachuKg: list.find((p) => p.id === PIKACHU_ID)?.weightKg ?? 6,
    };
    contexts.set(list, ctx);
  }
  return ctx;
}

/** 1 + how many values are strictly greater (ties share a rank). */
const rankDesc = (values: number[], v: number) => 1 + values.filter((x) => x > v).length;
/** How many values are strictly smaller. */
const countBelow = (values: number[], v: number) => values.filter((x) => x < v).length;

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
};

const round = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);

/** All candidate facts, unordered. */
export function candidateFacts(p: Pokemon, list: readonly Pokemon[]): Fact[] {
  const ctx = contextOf(list);
  const dex = dexOf(list);
  const facts: Fact[] = [];
  const add = (score: number, text: string) => facts.push({ text, score });

  // Base stat total ranking.
  const total = statTotal(p);
  const totalRank = rankDesc(ctx.totals, total);
  if (totalRank <= 50) add(9, `Its base stat total of ${total} is the ${ordinal(totalRank)} highest of all ${ctx.n} Pokémon.`);
  else if (countBelow(ctx.totals, total) < 25) add(6, `Its base stat total is only ${total}, one of the lowest of all ${ctx.n} Pokémon.`);
  else add(2, `Its base stat total of ${total} ranks ${ordinal(totalRank)} of ${ctx.n}.`);

  // Best stat, and whether it's exceptional.
  const best = (Object.keys(STAT_LABELS) as (keyof Stats)[]).reduce((a, b) => (p.stats[b] > p.stats[a] ? b : a));
  const bestShare = (rankDesc(ctx.stats[best], p.stats[best]) - 1) / ctx.n;
  if (bestShare < EXTREME_SHARE) {
    const pct = Math.max(1, Math.ceil(bestShare * 100));
    add(8, `Its ${STAT_LABELS[best]} of ${p.stats[best]} is in the top ${pct}% of all Pokémon.`);
  } else {
    add(3, `Its best stat is ${STAT_LABELS[best]} (${p.stats[best]}).`);
  }

  // How rare its typing is.
  const sharing = ctx.typeCounts.get(typeKey(p)) ?? 1;
  const typing = p.types.length === 1 ? `pure ${typeLabel(p)}-type` : `${typeLabel(p)}`;
  if (sharing === 1) add(10, `It's the only ${typing} Pokémon.`);
  else if (sharing <= 5) add(7, `It's one of only ${sharing} ${typing} Pokémon.`);
  else if (sharing >= 40) add(1, `It shares its ${typing} typing with ${sharing - 1} other Pokémon.`);

  // Size.
  const weightRank = rankDesc(ctx.weights, p.weightKg);
  const heightRank = rankDesc(ctx.heights, p.heightM);
  if (weightRank <= TOP) add(8, `At ${p.weightKg} kg, it's the ${ordinal(weightRank)} heaviest Pokémon.`);
  else if (p.weightKg >= 2 * ctx.pikachuKg && p.id !== PIKACHU_ID)
    add(4, `It weighs ${p.weightKg} kg, about as much as ${round(p.weightKg / ctx.pikachuKg)} Pikachu.`);
  else if (countBelow(ctx.weights, p.weightKg) / ctx.n < EXTREME_SHARE) add(6, `It weighs only ${p.weightKg} kg, one of the lightest Pokémon.`);
  if (heightRank <= TOP) add(8, `At ${p.heightM} m, it's the ${ordinal(heightRank)} tallest Pokémon.`);
  else if ((heightRank - 1) / ctx.n < EXTREME_SHARE) add(5, `At ${p.heightM} m, it's taller than ${Math.floor(100 - ((heightRank - 1) / ctx.n) * 100)}% of all Pokémon.`);

  // Catch rate.
  if (p.captureRate <= 3) add(7, `Its catch rate is ${p.captureRate} out of 255: as hard to catch as it gets.`);
  else if (p.captureRate >= 255) add(5, `Its catch rate is 255 out of 255: as easy to catch as it gets.`);
  else if (p.captureRate <= 45) add(3, `Its catch rate is ${p.captureRate} out of 255, so it's tricky to catch.`);

  // Evolution line.
  const children = dex.children.get(p.id) ?? [];
  if (children.length >= 3) add(9, `It can evolve into ${children.length} different Pokémon!`);
  if (p.isBaby) add(4, "It's a baby Pokémon: it can't be found as an adult right away.");
  else if (stageOf(p.id, dex) === 2) add(2, "It's the final form of a three-stage evolution line.");
  else if (p.evolvesFromId === null && children.length === 0 && !p.isLegendary && !p.isMythical) add(2, "It doesn't evolve.");

  if (p.isMythical) add(7, "It's a Mythical Pokémon, one of the rarest kinds.");
  else if (p.isLegendary) add(6, "It's a Legendary Pokémon.");

  if (p.habitat === "rare") add(6, "Its habitat is officially listed as \"rare\".");
  else if (p.habitat) add(2, `It lives in ${p.habitat.replace("-", " ").replace("waters edge", "water's edge")} habitats.`);
  if (p.color) add(1, `Its official Pokédex color is ${p.color}.`);

  return facts;
}

/** The `count` most interesting facts (stable order for equal scores). */
export function funFacts(p: Pokemon, list: readonly Pokemon[], count = 3): string[] {
  return candidateFacts(p, list)
    .map((fact, i) => ({ ...fact, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, count)
    .map((f) => f.text);
}
