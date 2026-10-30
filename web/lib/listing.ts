import type { Pokemon } from "@/data/pokedex";
import { normalize } from "./search.ts";

export const TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

/** "all", favorites only, or one type. Cycled with ◀ ▶ on the options row. */
export const FILTERS = ["all", "favorites", ...TYPES] as const;
export type Filter = (typeof FILTERS)[number];

/**
 * "auto" keeps each view's natural order: dex number for the full list,
 * A→Z for search results (the order the prefix search returns them in).
 */
export const SORTS = ["auto", "number", "name", "total"] as const;
export type Sort = (typeof SORTS)[number];

export const statTotal = (p: Pokemon) =>
  p.stats.hp + p.stats.attack + p.stats.defense + p.stats.specialAttack + p.stats.specialDefense + p.stats.speed;

const byNumber = (a: Pokemon, b: Pokemon) => a.id - b.id;
const byName = (a: Pokemon, b: Pokemon) => {
  const x = normalize(a.name);
  const y = normalize(b.name);
  return x < y ? -1 : x > y ? 1 : a.id - b.id;
};
const byTotal = (a: Pokemon, b: Pokemon) => statTotal(b) - statTotal(a) || a.id - b.id;

interface Options {
  filter: Filter;
  sort: Sort;
  favorites: ReadonlySet<number>;
}

/** Filters then sorts. Doesn't mutate `items`. O(n log n) when re-sorting. */
export function applyListing(items: readonly Pokemon[], { filter, sort, favorites }: Options): Pokemon[] {
  const filtered =
    filter === "all"
      ? [...items]
      : filter === "favorites"
        ? items.filter((p) => favorites.has(p.id))
        : items.filter((p) => p.types.includes(filter));
  if (sort === "number") filtered.sort(byNumber);
  else if (sort === "name") filtered.sort(byName);
  else if (sort === "total") filtered.sort(byTotal);
  return filtered;
}
