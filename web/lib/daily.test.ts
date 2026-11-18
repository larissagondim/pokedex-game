import assert from "node:assert/strict";
import { test } from "node:test";
import { DAILY_BONUS, dailyBonus, dailyTeam, dayKey, liveStreak, nextStreak, previousDay, seeded, STREAK_MAX, STREAK_STEP } from "./daily.ts";

const POOL = Array.from({ length: 1025 }, (_, i) => i + 1);

test("dayKey uses the local date, zero-padded", () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("the same day gives the same team, another day another one", () => {
  assert.deepEqual(dailyTeam("2026-11-18", POOL), dailyTeam("2026-11-18", POOL));
  assert.notDeepEqual(dailyTeam("2026-11-18", POOL), dailyTeam("2026-11-19", POOL));
});

test("the team has distinct Pokémon from the pool", () => {
  const team = dailyTeam("2026-11-18", POOL);
  assert.equal(team.length, 3);
  assert.equal(new Set(team).size, 3);
  assert.ok(team.every((id) => POOL.includes(id)));
  assert.deepEqual(dailyTeam("x", [7, 8], 3).sort(), [7, 8]);
});

test("seeded numbers stay in [0, 1)", () => {
  const rng = seeded(42);
  for (let i = 0; i < 1000; i++) {
    const x = rng();
    assert.ok(x >= 0 && x < 1);
  }
});

test("previousDay crosses months and years", () => {
  assert.equal(previousDay("2026-03-01"), "2026-02-28");
  assert.equal(previousDay("2028-03-01"), "2028-02-29");
  assert.equal(previousDay("2027-01-01"), "2026-12-31");
});

test("streaks grow on consecutive days and restart after a gap", () => {
  assert.equal(nextStreak(null, 0, "2026-11-18"), 1);
  assert.equal(nextStreak("2026-11-17", 3, "2026-11-18"), 4);
  assert.equal(nextStreak("2026-11-18", 4, "2026-11-18"), 4);
  assert.equal(nextStreak("2026-11-15", 9, "2026-11-18"), 1);
  assert.equal(liveStreak("2026-11-17", 4, "2026-11-18"), 4);
  assert.equal(liveStreak("2026-11-16", 4, "2026-11-18"), 0);
});

test("the bonus grows with the streak, up to a cap", () => {
  assert.equal(dailyBonus(1), DAILY_BONUS);
  assert.equal(dailyBonus(3), DAILY_BONUS + 2 * STREAK_STEP);
  assert.equal(dailyBonus(STREAK_MAX + 10), dailyBonus(STREAK_MAX));
});
