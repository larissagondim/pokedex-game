import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pokemon } from "../data/pokedex.ts";
import {
  act,
  dexOf,
  EGG_HATCH_MS,
  eggPool,
  evolutionLevel,
  evolve,
  hatch,
  levelOf,
  moodOf,
  newPet,
  type Pet,
  stageOf,
  tick,
} from "./tamagotchi.ts";

const HOUR = 3_600_000;
const T0 = 1_000_000_000_000;

const mon = (id: number, name: string, evolvesFromId: number | null, extra: Partial<Pokemon> = {}) =>
  ({ id, name, evolvesFromId, isBaby: false, isLegendary: false, isMythical: false, ...extra }) as Pokemon;

const LIST = [
  mon(1, "Bulbasaur", null),
  mon(2, "Ivysaur", 1),
  mon(3, "Venusaur", 2),
  mon(25, "Pikachu", 172),
  mon(26, "Raichu", 25),
  mon(133, "Eevee", null),
  mon(134, "Vaporeon", 133),
  mon(135, "Jolteon", 133),
  mon(150, "Mewtwo", null, { isLegendary: true }),
  mon(151, "Mew", null, { isMythical: true }),
  mon(172, "Pichu", null, { isBaby: true }),
];
const dex = dexOf(LIST);
const pet = (changes: Partial<Pet> = {}): Pet => ({ ...newPet("p", 1, T0), ...changes });

test("needs decay with elapsed time", () => {
  const later = tick(pet({ fullness: 80, happiness: 70, energy: 80 }), T0 + 2 * HOUR);
  assert.equal(later.fullness, 64);
  assert.equal(later.happiness, 60);
  assert.equal(later.energy, 72);
  assert.equal(later.updatedAt, T0 + 2 * HOUR);
});

test("decay clamps at 0 and happiness drops faster when hungry", () => {
  const later = tick(pet({ fullness: 10, happiness: 50 }), T0 + HOUR);
  assert.equal(later.fullness, 2);
  assert.equal(later.happiness, 40);
  assert.equal(tick(pet({ fullness: 5 }), T0 + 10 * HOUR).fullness, 0);
});

test("sleeping restores energy and wakes up when full", () => {
  assert.equal(tick(pet({ asleep: true, energy: 20 }), T0 + HOUR).energy, 45);
  const rested = tick(pet({ asleep: true, energy: 90 }), T0 + HOUR);
  assert.equal(rested.energy, 100);
  assert.equal(rested.asleep, false);
});

test("eggs don't decay", () => {
  const egg = newPet("e", null, T0);
  assert.equal(tick(egg, T0 + 10 * HOUR).fullness, egg.fullness);
});

test("actions change needs, give xp and coins, and refuse when they can't", () => {
  assert.equal(act(pet({ fullness: 50 }), "feed", T0).pet.fullness, 80);
  assert.equal(act(pet({ fullness: 96 }), "feed", T0).outcome, "too-full");
  const played = act(pet({ energy: 50 }), "play", T0);
  assert.deepEqual([played.outcome, played.coins, played.pet.energy], ["played", 5, 35]);
  assert.equal(act(pet({ energy: 10 }), "play", T0).outcome, "too-tired");
  assert.equal(act(pet({ fullness: 10, energy: 90 }), "train", T0).outcome, "too-hungry");
  const trained = act(pet({ energy: 90, fullness: 90 }), "train", T0);
  assert.deepEqual([trained.outcome, trained.coins, trained.pet.xp], ["trained", 10, 15]);
  assert.equal(act(pet({ asleep: true }), "feed", T0).outcome, "is-asleep");
  assert.equal(act(pet({ asleep: true }), "sleep", T0).outcome, "woke-up");
  assert.equal(act(newPet("e", null, T0), "feed", T0).outcome, "is-egg");
});

test("act does not mutate the pet", () => {
  const p = pet();
  const copy = { ...p };
  act(p, "train", T0);
  assert.deepEqual(p, copy);
});

test("levels and moods", () => {
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(49), 1);
  assert.equal(levelOf(50), 2);
  assert.equal(moodOf(pet({ happiness: 80 })), "happy");
  assert.equal(moodOf(pet({ happiness: 20 })), "sad");
  assert.equal(moodOf(pet({ fullness: 10, happiness: 80 })), "hungry");
  assert.equal(moodOf(pet({ asleep: true })), "sleeping");
  assert.equal(moodOf(newPet("e", null, T0)), "egg");
});

test("stages and evolution levels", () => {
  assert.equal(stageOf(1, dex), 0);
  assert.equal(stageOf(3, dex), 2);
  assert.equal(stageOf(26, dex), 2); // Pichu → Pikachu → Raichu
  assert.equal(evolutionLevel(1, dex), 5);
  assert.equal(evolutionLevel(2, dex), 10);
  assert.equal(evolutionLevel(3, dex), null);
  assert.equal(evolutionLevel(172, dex), 3); // baby
});

test("evolves when the level is reached; babies also need happiness", () => {
  assert.equal(evolve(pet({ xp: 199 }), dex), null);
  assert.equal(evolve(pet({ xp: 200 }), dex)?.dexId, 2);
  assert.equal(evolve(pet({ dexId: 3, xp: 9999 }), dex), null);
  assert.equal(evolve(pet({ dexId: 172, xp: 100, happiness: 50 }), dex), null);
  assert.equal(evolve(pet({ dexId: 172, xp: 100, happiness: 80 }), dex)?.dexId, 25);
  // Branches pick by the random number.
  assert.equal(evolve(pet({ dexId: 133, xp: 200 }), dex, () => 0)?.dexId, 134);
  assert.equal(evolve(pet({ dexId: 133, xp: 200 }), dex, () => 0.99)?.dexId, 135);
});

test("eggs hatch into base stages or babies, never legendaries or mythicals", () => {
  const pool = eggPool(LIST);
  assert.deepEqual(
    pool.map((p) => p.id),
    [1, 133, 172],
  );
  const egg = newPet("e", null, T0);
  assert.equal(hatch(egg, pool, T0 + EGG_HATCH_MS - 1), null);
  assert.equal(hatch(egg, pool, T0 + EGG_HATCH_MS, () => 0.5)?.dexId, 133);
});
