/**
 * The daily challenge: the same foe team for everyone on a given day, picked
 * from the date with a seeded generator (no server needed). The first win of
 * the day pays a bonus. Pure, no storage.
 */

export const DAILY_SIZE = 3;
export const DAILY_BONUS = 100;

/** "2026-11-18" in local time. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 32-bit FNV-1a hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: a small seeded generator returning numbers in [0, 1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's foes: `size` distinct dex numbers from `pool`, the same for a given day. */
export function dailyTeam(day: string, pool: readonly number[], size = DAILY_SIZE): number[] {
  const rng = seeded(hash(`daily:${day}`));
  const picked: number[] = [];
  const left = [...pool];
  while (picked.length < Math.min(size, pool.length)) picked.push(left.splice(Math.floor(rng() * left.length), 1)[0]);
  return picked;
}
