/**
 * Regions by National Dex range, in dex order. Hisui (Legends: Arceus) is its
 * own range even though PokéAPI files it under generation VIII.
 */
export const REGIONS = [
  { id: "kanto", name: "Kanto", first: 1, last: 151 },
  { id: "johto", name: "Johto", first: 152, last: 251 },
  { id: "hoenn", name: "Hoenn", first: 252, last: 386 },
  { id: "sinnoh", name: "Sinnoh", first: 387, last: 493 },
  { id: "unova", name: "Unova", first: 494, last: 649 },
  { id: "kalos", name: "Kalos", first: 650, last: 721 },
  { id: "alola", name: "Alola", first: 722, last: 809 },
  { id: "galar", name: "Galar", first: 810, last: 898 },
  { id: "hisui", name: "Hisui", first: 899, last: 905 },
  { id: "paldea", name: "Paldea", first: 906, last: 1025 },
] as const;

export type Region = (typeof REGIONS)[number];
export type RegionId = Region["id"];

/**
 * Index in REGIONS of the region containing `dexId`, or -1 if none.
 * Binary search for the last region whose range starts at or before the id:
 * O(log r) for r regions.
 */
export function regionIndexOf(dexId: number) {
  let lo = 0;
  let hi: number = REGIONS.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (REGIONS[mid].first <= dexId) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  return i >= 0 && dexId <= REGIONS[i].last ? i : -1;
}

export function regionOf(dexId: number): Region | null {
  const i = regionIndexOf(dexId);
  return i >= 0 ? REGIONS[i] : null;
}
