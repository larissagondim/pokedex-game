import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyTeam, dayKey, seeded } from "./daily.ts";

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
