import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type BattleSnapshot,
  battleFeatures,
  type Combatant,
  expectedDamage,
  FEATURE_NAMES,
  featureVector,
  MAX_TURNS,
  movesFirst,
  swapSides,
  turnsToKo,
} from "./battleFeatures.ts";
import { effectiveness } from "./typeChart.ts";

const stats = { atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
const combatant = (over: Partial<Combatant>): Combatant => ({
  dexId: 1,
  level: 50,
  types: ["normal"],
  hp: 150,
  maxHp: 150,
  stats,
  status: null,
  moves: [{ type: "normal", power: 80, category: "physical", accuracy: 1, priority: 0 }],
  ...over,
});

const charmander = combatant({
  types: ["fire"],
  moves: [{ type: "fire", power: 90, category: "special", accuracy: 1, priority: 0 }],
  stats: { ...stats, spe: 120 },
});
const bulbasaur = combatant({
  types: ["grass", "poison"],
  moves: [{ type: "grass", power: 90, category: "special", accuracy: 1, priority: 0 }],
});

test("type chart", () => {
  assert.equal(effectiveness("fire", ["grass", "poison"]), 2);
  assert.equal(effectiveness("grass", ["fire"]), 0.5);
  assert.equal(effectiveness("ground", ["flying"]), 0);
  assert.equal(effectiveness("ice", ["dragon", "flying"]), 4);
  assert.equal(effectiveness("Electric", ["Water"]), 2);
});

test("expected damage follows the formula with STAB and effectiveness", () => {
  // floor(floor(floor(22 * 90 * 100) / 100) / 50) + 2 = 41; × 0.925 × 1.5 STAB × 2 SE
  assert.equal(expectedDamage(charmander.moves[0], charmander, bulbasaur), 41 * 0.925 * 1.5 * 2);
  assert.equal(expectedDamage({ type: "normal", power: 0, category: "status", accuracy: 1, priority: 0 }, charmander, bulbasaur), 0);
});

test("burn halves physical damage, accuracy scales it", () => {
  const move = { type: "normal", power: 80, category: "physical" as const, accuracy: 1, priority: 0 };
  const base = expectedDamage(move, combatant({}), combatant({}));
  assert.equal(expectedDamage(move, combatant({ status: "brn" }), combatant({})), base / 2);
  assert.equal(expectedDamage({ ...move, accuracy: 0.5 }, combatant({}), combatant({})), base / 2);
});

test("turns to KO, capped when it can't hurt", () => {
  assert.equal(turnsToKo(charmander, bulbasaur), Math.ceil(150 / (41 * 0.925 * 3)));
  const ghost = combatant({ types: ["ghost"] });
  assert.equal(turnsToKo(combatant({}), ghost), MAX_TURNS);
});

test("turn order: priority first, then speed (paralysis halves it)", () => {
  assert.equal(movesFirst({ turn: 1, a: charmander, b: bulbasaur }), 1);
  assert.equal(movesFirst({ turn: 1, a: { ...charmander, status: "par" }, b: bulbasaur }), 0);
  const quick = { ...bulbasaur, moves: [{ type: "normal", power: 40, category: "physical" as const, accuracy: 1, priority: 1 }] };
  assert.equal(movesFirst({ turn: 1, a: charmander, b: quick }), 0);
  assert.equal(movesFirst({ turn: 1, a: bulbasaur, b: bulbasaur }), 0.5);
});

test("features are antisymmetric under swapping sides", () => {
  const s: BattleSnapshot = { turn: 3, a: charmander, b: { ...bulbasaur, hp: 90 } };
  const f = battleFeatures(s);
  const g = battleFeatures(swapSides(s));
  for (const name of ["ttk_diff", "hp_diff", "eff_diff", "stat_ratio", "level_diff"] as const) {
    assert.ok(Math.abs(g[name] + f[name]) < 1e-9, name);
  }
  assert.equal(f.race_win, 1);
  assert.equal(g.race_win, 0);
  assert.equal(f.moves_first + g.moves_first, 1);
});

test("feature vector follows FEATURE_NAMES", () => {
  const s: BattleSnapshot = { turn: 0, a: charmander, b: bulbasaur };
  const v = featureVector(s);
  assert.equal(v.length, FEATURE_NAMES.length);
  assert.equal(v[FEATURE_NAMES.indexOf("turn")], 0);
});
