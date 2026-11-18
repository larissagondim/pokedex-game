import { LEAGUE } from "./league.ts";
import { levelOf, MAX_SLOTS, type Pet } from "./tamagotchi.ts";
import { type Accessory, ACCESSORIES, isAccessory } from "./trainer.ts";

/**
 * Tamagotchi sync: what the browser and the server (app/api/tamagotchi) agree
 * on. Pure, no storage and no network.
 *
 * A save is identified by a sync code, a random secret the player can type on
 * another device to share the same party. The server keeps one save per code
 * with a revision number: a write must name the revision it was based on, and
 * loses to a newer one (the client then takes the server's copy).
 */

/* Sync code */

/** Request header carrying the sync code. */
export const SYNC_CODE_HEADER = "x-sync-code";

/** No I, O, 0 or 1: they look alike on the pixel font. 32 symbols = 5 bits each. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 12;
const CODE_GROUP = 4;

const grouped = (chars: string) => chars.match(new RegExp(`.{1,${CODE_GROUP}}`, "g"))?.join("-") ?? "";

/** A new code such as "K7QM-2HXA-9RTB" (60 random bits). `bytes` must fill the array with random values. */
export function newSyncCode(bytes: (array: Uint8Array) => void = (a) => crypto.getRandomValues(a)): string {
  const raw = new Uint8Array(CODE_LENGTH);
  bytes(raw);
  return grouped([...raw].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(""));
}

/** The code as typed (any case, with or without dashes or spaces) in its canonical form, or null if it isn't one. */
export function normalizeSyncCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const chars = input.toUpperCase().replace(/[\s-]/g, "");
  if (chars.length !== CODE_LENGTH || [...chars].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return grouped(chars);
}

/** Groups what has been typed so far ("K7QM2H" → "K7QM-2H"), dropping anything that can't be in a code. */
export function formatSyncDraft(input: string): string {
  const chars = [...input.toUpperCase()].filter((c) => CODE_ALPHABET.includes(c)).slice(0, CODE_LENGTH);
  return grouped(chars.join(""));
}

/* Save */

export interface TamaSave {
  pets: Pet[];
  coins: number;
  /** The rest of the game's progress. Absent in saves from before it was synced. */
  progress?: SyncedProgress;
}

/** Progress kept next to the party: Pokédex, league, shop items and the daily challenge. */
export interface SyncedProgress {
  /** Dex numbers, ascending; caught ⊆ seen. */
  seen: number[];
  caught: number[];
  /** League leaders beaten. */
  league: number;
  /** Battle items bought and not used yet. */
  items: { potion: number; fullheal: number };
  /** Last day ("2026-11-18") the daily challenge was won. */
  dailyWon: string | null;
  /** Days in a row won, ending on `dailyWon` (absent in older progress). */
  dailyStreak?: number;
  /** Trainer accessories bought (absent in progress saved before they existed). */
  accessories?: Accessory[];
}

/** A save as the server stores it. */
export interface RemoteSave extends TamaSave {
  /** Starts at 1, +1 on every accepted write. */
  revision: number;
  /** Server time of the last write (ms). */
  updatedAt: number;
}

const MAX_COINS = 1_000_000_000;
const MAX_XP = 1_000_000;
const MAX_DEX = 100_000;
const MAX_UID = 40;

const isNumber = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isIndex = (x: unknown, max: number): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max;
const isNeed = (x: unknown): x is number => isNumber(x) && x >= 0 && x <= 100;
const isTime = (x: unknown): x is number => isNumber(x) && x >= 0;

function sanitizePet(value: unknown): Pet | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.uid !== "string" || p.uid.length === 0 || p.uid.length > MAX_UID) return null;
  if (p.dexId !== null && !(isIndex(p.dexId, MAX_DEX) && p.dexId > 0)) return null;
  if (p.hatchAt !== null && !isTime(p.hatchAt)) return null;
  if (!isNeed(p.fullness) || !isNeed(p.happiness) || !isNeed(p.energy)) return null;
  if (!isIndex(p.xp, MAX_XP) || typeof p.asleep !== "boolean" || !isTime(p.updatedAt)) return null;
  if (p.shiny !== undefined && typeof p.shiny !== "boolean") return null;
  return {
    uid: p.uid,
    dexId: p.dexId,
    hatchAt: p.hatchAt,
    ...(p.shiny && { shiny: true }),
    fullness: p.fullness,
    happiness: p.happiness,
    energy: p.energy,
    xp: p.xp,
    asleep: p.asleep,
    updatedAt: p.updatedAt,
  };
}

const MAX_ITEMS = 999;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function dexIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length > MAX_DEX) return null;
  if (!value.every((id) => isIndex(id, MAX_DEX) && id > 0)) return null;
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

/** Well-formed progress, or null if anything is off. */
export function sanitizeSyncedProgress(value: unknown): SyncedProgress | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  const seen = dexIds(p.seen);
  const caught = dexIds(p.caught);
  const items = (p.items && typeof p.items === "object" ? p.items : null) as Record<string, unknown> | null;
  if (!seen || !caught || !isIndex(p.league, LEAGUE.length) || !items) return null;
  if (!isIndex(items.potion, MAX_ITEMS) || !isIndex(items.fullheal, MAX_ITEMS)) return null;
  if (p.dailyWon !== null && !(typeof p.dailyWon === "string" && DAY.test(p.dailyWon))) return null;
  if (p.dailyStreak !== undefined && !isIndex(p.dailyStreak, 100_000)) return null;
  if (p.accessories !== undefined && !(Array.isArray(p.accessories) && p.accessories.every(isAccessory))) return null;
  return {
    seen: [...new Set([...seen, ...caught])].sort((a, b) => a - b),
    caught,
    league: p.league,
    items: { potion: items.potion, fullheal: items.fullheal },
    dailyWon: p.dailyWon,
    dailyStreak: p.dailyWon === null ? 0 : Math.max(1, (p.dailyStreak as number | undefined) ?? 1),
    accessories: ACCESSORIES.filter((id) => (p.accessories as Accessory[] | undefined)?.includes(id)),
  };
}

/**
 * Two devices' progress put together: the Pokédex, the league and the daily
 * challenge only ever move forward, so nothing earned on either is lost. Items
 * are spent, so they come from `remote` like the coins.
 */
export function mergeProgress(local: SyncedProgress, remote: SyncedProgress): SyncedProgress {
  const union = (a: number[], b: number[]) => [...new Set([...a, ...b])].sort((x, y) => x - y);
  const daily = [local.dailyWon, remote.dailyWon].filter((d): d is string => d !== null).sort();
  // The streak goes with the later win (the longer one if both won the same day).
  const streakOf = (p: SyncedProgress) => (p.dailyWon === daily.at(-1) ? (p.dailyStreak ?? 1) : 0);
  return {
    seen: union(local.seen, remote.seen),
    caught: union(local.caught, remote.caught),
    league: Math.max(local.league, remote.league),
    items: { ...remote.items },
    dailyWon: daily.at(-1) ?? null,
    dailyStreak: Math.max(streakOf(local), streakOf(remote)),
    accessories: ACCESSORIES.filter((id) => local.accessories?.includes(id) || remote.accessories?.includes(id)),
  };
}

export const sameProgress = (a: SyncedProgress | undefined, b: SyncedProgress | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A well-formed save (known fields only), or null if anything is off. Used on both ends of the wire. */
export function sanitizeSave(value: unknown): TamaSave | null {
  if (!value || typeof value !== "object") return null;
  const { pets, coins, progress } = value as Record<string, unknown>;
  if (!Array.isArray(pets) || pets.length > MAX_SLOTS || !isIndex(coins, MAX_COINS)) return null;
  const clean = pets.map(sanitizePet);
  if (clean.some((p) => p === null)) return null;
  if (new Set(clean.map((p) => p!.uid)).size !== clean.length) return null;
  // Bad progress is dropped, not the whole save (the server then keeps what it had).
  const synced = progress === undefined ? null : sanitizeSyncedProgress(progress);
  return { pets: clean as Pet[], coins, ...(synced && { progress: synced }) };
}

/* History */

export const HISTORY_KINDS = ["adopted", "egg", "hatched", "evolved", "level", "released"] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

/** One milestone of the party's life. */
export interface HistoryEntry {
  /** When it happened (ms, the device's clock). */
  at: number;
  kind: HistoryKind;
  /** The species (after evolving, for "evolved"); null for an egg. */
  dexId: number | null;
  /** "evolved": the species it evolved from. "level": the level reached. "hatched": 1 if it came out shiny. */
  detail: number | null;
}

/** How many entries the screen keeps (newest first). The server keeps them all. */
export const HISTORY_MAX = 30;
/** Most entries accepted in one write. */
export const HISTORY_BATCH = 50;

/** The milestones between two versions of the party, oldest first. */
export function diffHistory(prev: readonly Pet[], next: readonly Pet[], at: number): HistoryEntry[] {
  const entry = (kind: HistoryKind, dexId: number | null, detail: number | null = null): HistoryEntry => ({ at, kind, dexId, detail });
  const before = new Map(prev.map((p) => [p.uid, p]));
  const after = new Set(next.map((p) => p.uid));
  const entries: HistoryEntry[] = [];

  for (const old of prev) if (!after.has(old.uid)) entries.push(entry("released", old.dexId));
  for (const pet of next) {
    const old = before.get(pet.uid);
    if (!old) {
      entries.push(entry(pet.dexId === null ? "egg" : "adopted", pet.dexId));
      continue;
    }
    if (pet.dexId !== old.dexId) entries.push(old.dexId === null ? entry("hatched", pet.dexId, pet.shiny ? 1 : null) : entry("evolved", pet.dexId, old.dexId));
    if (pet.dexId !== null && levelOf(pet.xp) > levelOf(old.xp)) entries.push(entry("level", pet.dexId, levelOf(pet.xp)));
  }
  return entries;
}

/** Adds entries (oldest first) to a newest-first list, keeping the latest HISTORY_MAX. */
export const addHistory = (history: readonly HistoryEntry[], entries: readonly HistoryEntry[]) =>
  [...[...entries].reverse(), ...history].slice(0, HISTORY_MAX);

/** The well-formed entries of a list (bad ones are dropped), at most `max`. */
export function sanitizeHistory(value: unknown, max = HISTORY_MAX): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: HistoryEntry[] = [];
  for (const item of value) {
    if (entries.length >= max) break;
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (!isTime(e.at) || !HISTORY_KINDS.includes(e.kind as HistoryKind)) continue;
    if (e.dexId !== null && !isIndex(e.dexId, MAX_DEX)) continue;
    if (e.detail !== null && e.detail !== undefined && !isIndex(e.detail, MAX_DEX)) continue;
    entries.push({ at: e.at, kind: e.kind as HistoryKind, dexId: e.dexId, detail: e.detail ?? null });
  }
  return entries;
}

/* Deciding what to do with the server's copy */

export type SyncStep =
  /** Send the local save (first write, or local changes on top of the server's revision). */
  | "push"
  /** Take the server's save: it is newer than what this device last saw. */
  | "adopt"
  | "idle";

/**
 * @param revision The server revision this device's save is based on (0: never synced).
 * @param dirty    Local changes not yet accepted by the server.
 * @param remote   The server's revision, or null when it has no save for this code.
 */
export function nextSyncStep(revision: number, dirty: boolean, remote: number | null): SyncStep {
  if (remote === null) return "push";
  if (remote !== revision) return "adopt"; // the server wins, even over local changes
  return dirty ? "push" : "idle";
}
