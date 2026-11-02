/** Seeded PRNG (mulberry32) so datasets are reproducible. */
export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

/** Up to `n` distinct items, in random order. */
export function sample<T>(rng: Rng, items: readonly T[], n: number): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Seed string for @pkmn/sim ("n,n,n,n"). */
export const battleSeed = (rng: Rng) =>
  Array.from({ length: 4 }, () => Math.floor(rng() * 65536)).join(",") as `${number},${string}`;
