import assert from "node:assert/strict";
import { test } from "node:test";
import { createBattle, createTeamBattle } from "./engine.ts";
import { winChance } from "./montecarlo.ts";
import type { BattleMove, BattlePokemon } from "./types.ts";

const tackle: BattleMove = { id: "tackle", name: "Tackle", type: "normal", power: 40, category: "physical", accuracy: 1, priority: 0, pp: 35 };
const mon = (over: Partial<BattlePokemon>): BattlePokemon => ({
  name: "Mon",
  dexId: 1,
  level: 50,
  types: ["normal"],
  hp: 150,
  maxHp: 150,
  stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
  status: null,
  moves: [tackle],
  ...over,
});

/** Deterministic RNG for the test. */
const mulberry = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test("a mirror match is close to 50%", () => {
  const p = winChance(createBattle(mon({}), mon({})), 400, mulberry(1));
  assert.ok(p > 0.4 && p < 0.6, String(p));
});

test("a much stronger side is close to 100%, and a finished battle is exact", () => {
  const strong = mon({ stats: { atk: 300, def: 300, spa: 100, spd: 300, spe: 300 } });
  assert.ok(winChance(createBattle(strong, mon({})), 200, mulberry(2)) > 0.95);
  const done = createBattle(mon({}), mon({}));
  done.winner = "b";
  assert.equal(winChance(done), 0);
});

test("does not change the state it starts from", () => {
  const st = createBattle(mon({}), mon({}));
  const copy = structuredClone(st);
  winChance(st, 20, mulberry(3));
  assert.deepEqual(st, copy);
});

test("teams: three against one strong-enough Pokémon wins more often than one against one", () => {
  const foe = mon({ stats: { atk: 130, def: 130, spa: 100, spd: 130, spe: 130 } });
  const solo = winChance(createBattle(mon({}), foe), 200, mulberry(4));
  const trio = winChance(createTeamBattle([mon({}), mon({}), mon({})], [foe]), 200, mulberry(4));
  assert.ok(trio > solo + 0.2, `${solo} → ${trio}`);
});
