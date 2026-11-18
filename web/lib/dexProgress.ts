/**
 * Pokédex progress: species you have SEEN (faced in battle) and CAUGHT
 * (beaten in a battle you won, or raised in the Tamagotchi). Caught implies
 * seen. Pure, no storage.
 */

export interface DexProgress {
  seen: ReadonlySet<number>;
  caught: ReadonlySet<number>;
}

export const EMPTY_PROGRESS: DexProgress = { seen: new Set(), caught: new Set() };

const ids = (x: unknown): number[] => (Array.isArray(x) ? x.filter((n): n is number => Number.isInteger(n) && n > 0) : []);

/** Whatever was stored (or nothing) → a valid progress, caught ⊆ seen. */
export function sanitizeProgress(raw: unknown): DexProgress {
  const r = (raw && typeof raw === "object" ? raw : {}) as { seen?: unknown; caught?: unknown };
  const caught = new Set(ids(r.caught));
  return { seen: new Set([...ids(r.seen), ...caught]), caught };
}

/** Marks species as seen. Returns the same object when nothing is new. */
export function see(p: DexProgress, dexIds: readonly number[]): DexProgress {
  const fresh = dexIds.filter((id) => !p.seen.has(id));
  return fresh.length === 0 ? p : { ...p, seen: new Set([...p.seen, ...fresh]) };
}

/** Marks species as caught (and seen). Returns the same object when nothing is new. */
export function capture(p: DexProgress, dexIds: readonly number[]): DexProgress {
  const fresh = dexIds.filter((id) => !p.caught.has(id));
  if (fresh.length === 0) return p;
  return { seen: new Set([...p.seen, ...fresh]), caught: new Set([...p.caught, ...fresh]) };
}

/** How many of `set` fall in the dex range first..last. */
export function countInRange(set: ReadonlySet<number>, first: number, last: number): number {
  let n = 0;
  for (const id of set) if (id >= first && id <= last) n++;
  return n;
}

export type DexMark = "caught" | "seen" | null;

export const markOf = (p: DexProgress, dexId: number): DexMark => (p.caught.has(dexId) ? "caught" : p.seen.has(dexId) ? "seen" : null);

/** For storage. */
export const serializeProgress = (p: DexProgress) => ({ seen: [...p.seen], caught: [...p.caught] });
