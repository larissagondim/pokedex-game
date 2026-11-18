import assert from "node:assert/strict";
import { test } from "node:test";
import { BATTLE_WIN_XP, battleReward, MAX_MULTIPLIER, MIN_MULTIPLIER, upsetMultiplier, WIN_REWARD } from "./rewards.ts";

test("an even fight pays the base reward", () => {
  assert.equal(upsetMultiplier(0.5), 1);
  assert.deepEqual(battleReward(0.5, 1), { coins: WIN_REWARD, xp: BATTLE_WIN_XP });
  assert.deepEqual(battleReward(0.5, 3), { coins: WIN_REWARD * 3, xp: BATTLE_WIN_XP });
});

test("unknown odds pay the base reward", () => {
  assert.equal(upsetMultiplier(null), 1);
  assert.equal(upsetMultiplier(Number.NaN), 1);
});

test("sure wins pay less, upsets pay more, within the bounds", () => {
  assert.equal(upsetMultiplier(0.99), MIN_MULTIPLIER);
  assert.equal(upsetMultiplier(0), MAX_MULTIPLIER);
  assert.ok(Math.abs(upsetMultiplier(0.1) - 1.8) < 1e-9);
  assert.ok(battleReward(0.9, 1).coins < battleReward(0.5, 1).coins);
  assert.ok(battleReward(0.2, 1).coins > battleReward(0.5, 1).coins);
});

test("a win always pays something", () => {
  const r = battleReward(1, 1);
  assert.ok(r.coins >= 1 && r.xp >= 1);
});
