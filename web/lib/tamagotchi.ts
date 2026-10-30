import type { Pokemon } from "@/data/pokedex";

/**
 * Tamagotchi rules, as pure functions over plain data (the store persists it).
 *
 * Needs decay with elapsed real time: every read calls `tick(pet, now)`, which
 * applies the hourly rates for the time since `updatedAt`. Nothing has to run
 * while the page is closed.
 */

export const MAX_SLOTS = 5;
export const START_COINS = 150;
export const EGG_PRICE = 100;
export const EGG_HATCH_MS = 2 * 60_000;
export const XP_PER_LEVEL = 50;
/** Babies evolve at this level, given enough happiness. */
export const BABY_EVOLUTION_LEVEL = 3;
export const BABY_EVOLUTION_HAPPINESS = 70;
/** Other stages evolve at level (stage + 1) * STAGE_LEVEL_STEP: 5, then 10. */
export const STAGE_LEVEL_STEP = 5;

const HOUR = 3_600_000;

/** Change per hour. Happiness drops faster while hungry. */
export const RATES = {
  fullness: -8,
  happiness: -5,
  happinessHungry: -10,
  energyAwake: -4,
  energyAsleep: 25,
} as const;

export interface Pet {
  uid: string;
  /** Species; null while it's still an egg. */
  dexId: number | null;
  /** When the egg hatches (eggs only). */
  hatchAt: number | null;
  /** 0..100, higher is better for all three. */
  fullness: number;
  happiness: number;
  energy: number;
  xp: number;
  asleep: boolean;
  updatedAt: number;
}

export type Action = "feed" | "play" | "sleep" | "train";

export type Outcome =
  | "ate"
  | "too-full"
  | "played"
  | "trained"
  | "fell-asleep"
  | "woke-up"
  | "too-tired"
  | "too-hungry"
  | "is-asleep"
  | "is-egg";

export type Mood = "egg" | "sleeping" | "hungry" | "tired" | "sad" | "happy" | "ok";

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function newPet(uid: string, dexId: number | null, now: number): Pet {
  return {
    uid,
    dexId,
    hatchAt: dexId === null ? now + EGG_HATCH_MS : null,
    fullness: 80,
    happiness: 70,
    energy: 80,
    xp: 0,
    asleep: false,
    updatedAt: now,
  };
}

/** Applies the decay for the time elapsed since the last update. */
export function tick(pet: Pet, now: number): Pet {
  const hours = Math.max(0, now - pet.updatedAt) / HOUR;
  if (pet.dexId === null || hours === 0) return { ...pet, updatedAt: Math.max(now, pet.updatedAt) };
  const energy = clamp(pet.energy + (pet.asleep ? RATES.energyAsleep : RATES.energyAwake) * hours);
  return {
    ...pet,
    fullness: clamp(pet.fullness + RATES.fullness * hours),
    happiness: clamp(pet.happiness + (pet.fullness < 30 ? RATES.happinessHungry : RATES.happiness) * hours),
    energy,
    // Wakes up on its own once fully rested.
    asleep: pet.asleep && energy < 100,
    updatedAt: now,
  };
}

export const levelOf = (xp: number) => 1 + Math.floor(xp / XP_PER_LEVEL);

export function moodOf(pet: Pet): Mood {
  if (pet.dexId === null) return "egg";
  if (pet.asleep) return "sleeping";
  if (pet.fullness < 25) return "hungry";
  if (pet.energy < 20) return "tired";
  if (pet.happiness >= 70) return "happy";
  if (pet.happiness < 30) return "sad";
  return "ok";
}

export interface ActionResult {
  pet: Pet;
  outcome: Outcome;
  coins: number;
}

/** Performs an action (after applying decay). Never mutates `pet`. */
export function act(pet: Pet, action: Action, now: number): ActionResult {
  const p = tick(pet, now);
  const result = (outcome: Outcome, changes: Partial<Pet> = {}, coins = 0): ActionResult => ({
    pet: {
      ...p,
      ...changes,
      fullness: clamp(changes.fullness ?? p.fullness),
      happiness: clamp(changes.happiness ?? p.happiness),
      energy: clamp(changes.energy ?? p.energy),
    },
    outcome,
    coins,
  });

  if (p.dexId === null) return result("is-egg");
  if (action === "sleep") return result(p.asleep ? "woke-up" : "fell-asleep", { asleep: !p.asleep });
  if (p.asleep) return result("is-asleep");

  switch (action) {
    case "feed":
      if (p.fullness >= 95) return result("too-full", { happiness: p.happiness - 5 });
      return result("ate", { fullness: p.fullness + 30, happiness: p.happiness + 3, xp: p.xp + 1 });
    case "play":
      if (p.energy < 15) return result("too-tired");
      return result("played", { happiness: p.happiness + 20, energy: p.energy - 15, fullness: p.fullness - 5, xp: p.xp + 4 }, 5);
    case "train":
      if (p.energy < 20) return result("too-tired");
      if (p.fullness < 20) return result("too-hungry");
      return result("trained", { xp: p.xp + 15, energy: p.energy - 20, fullness: p.fullness - 10 }, 10);
  }
}

// Evolution ----------------------------------------------------------------

export interface Dex {
  byId: Map<number, Pokemon>;
  /** Species → the species that evolve from it. */
  children: Map<number, number[]>;
}

const dexCache = new WeakMap<readonly Pokemon[], Dex>();

/** Index of species and evolution children; cached per list. */
export function dexOf(list: readonly Pokemon[]): Dex {
  let dex = dexCache.get(list);
  if (!dex) {
    const children = new Map<number, number[]>();
    for (const p of list) {
      if (p.evolvesFromId === null) continue;
      children.set(p.evolvesFromId, [...(children.get(p.evolvesFromId) ?? []), p.id]);
    }
    dex = { byId: new Map(list.map((p) => [p.id, p])), children };
    dexCache.set(list, dex);
  }
  return dex;
}

/** 0 for a base stage, 1 for its evolution, and so on. */
export function stageOf(dexId: number, dex: Dex): number {
  let stage = 0;
  for (let p = dex.byId.get(dexId); p?.evolvesFromId != null; p = dex.byId.get(p.evolvesFromId)) stage++;
  return stage;
}

/** Level at which this species evolves, or null if it doesn't. */
export function evolutionLevel(dexId: number, dex: Dex): number | null {
  if (!dex.children.get(dexId)?.length) return null;
  if (dex.byId.get(dexId)?.isBaby) return BABY_EVOLUTION_LEVEL;
  return (stageOf(dexId, dex) + 1) * STAGE_LEVEL_STEP;
}

/** Species it can evolve into right now (empty if not ready). */
export function evolutionOptions(pet: Pet, dex: Dex): number[] {
  if (pet.dexId === null) return [];
  const level = evolutionLevel(pet.dexId, dex);
  if (level === null || levelOf(pet.xp) < level) return [];
  if (dex.byId.get(pet.dexId)?.isBaby && pet.happiness < BABY_EVOLUTION_HAPPINESS) return [];
  return dex.children.get(pet.dexId) ?? [];
}

/** Evolves if ready; branched lines (e.g. Eevee) pick one at random. */
export function evolve(pet: Pet, dex: Dex, random: () => number = Math.random): Pet | null {
  const options = evolutionOptions(pet, dex);
  if (options.length === 0) return null;
  return { ...pet, dexId: options[Math.floor(random() * options.length)] };
}

// Eggs ---------------------------------------------------------------------

/** What an egg can hatch into: base stages and babies, no legendaries or mythicals. */
export const eggPool = (list: readonly Pokemon[]) =>
  list.filter((p) => p.evolvesFromId === null && !p.isLegendary && !p.isMythical);

/** Hatches the egg if its time has come. */
export function hatch(pet: Pet, pool: readonly Pokemon[], now: number, random: () => number = Math.random): Pet | null {
  if (pet.dexId !== null || pet.hatchAt === null || now < pet.hatchAt || pool.length === 0) return null;
  const species = pool[Math.floor(random() * pool.length)];
  return { ...pet, dexId: species.id, hatchAt: null, updatedAt: now };
}
