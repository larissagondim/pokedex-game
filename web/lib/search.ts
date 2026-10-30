import type { Pokemon } from "@/data/pokedex";

/**
 * Pokémon search by name prefix or by National Dex number.
 *
 * Names: the index keeps the Pokémon sorted by normalized name, so every name
 * starting with a prefix sits in one contiguous range. A binary search finds
 * where that range starts (the first name >= prefix) and a scan collects it
 * until a name stops matching: O(log n + k) per query, k = number of results,
 * after an O(n log n) sort done once. Results come out in alphabetical order.
 *
 * Numbers: "25" or "#25" is an exact id lookup in a Map, O(1).
 */

export interface SearchIndex {
  /** Pokémon sorted by `normalize(name)`. */
  byName: Pokemon[];
  /** `normalize(name)` for each entry of `byName` (same order). */
  names: string[];
  byId: Map<number, Pokemon>;
}

/** Lowercase, accents removed ("Flabébé" → "flabebe"), outer spaces trimmed. */
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function buildSearchIndex(list: Pokemon[]): SearchIndex {
  const entries = list.map((p) => ({ p, key: normalize(p.name) }));
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.p.id - b.p.id));
  return {
    byName: entries.map((e) => e.p),
    names: entries.map((e) => e.key),
    byId: new Map(list.map((p) => [p.id, p])),
  };
}

/** First index i with sorted[i] >= target (sorted.length if none). O(log n). */
export function lowerBound(sorted: readonly string[], target: string) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** All Pokémon whose name starts with `prefix` (already normalized), A→Z. */
export function searchByPrefix(index: SearchIndex, prefix: string): Pokemon[] {
  const results: Pokemon[] = [];
  for (let i = lowerBound(index.names, prefix); i < index.names.length && index.names[i].startsWith(prefix); i++) {
    results.push(index.byName[i]);
  }
  return results;
}

/**
 * Searches by name prefix, or by exact number when the query is numeric
 * ("25", "#25", "#0025"). Empty query → no results.
 */
export function searchPokemon(index: SearchIndex, query: string): Pokemon[] {
  const q = normalize(query);
  if (!q) return [];
  const number = /^#?(\d+)$/.exec(q);
  if (number) {
    const p = index.byId.get(Number(number[1]));
    return p ? [p] : [];
  }
  return searchByPrefix(index, q);
}
