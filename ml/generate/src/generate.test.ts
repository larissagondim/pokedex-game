import assert from "node:assert/strict";
import { test } from "node:test";
import { Dex } from "@pkmn/sim";
import { effectiveness, TYPE_NAMES } from "../../../web/lib/typeChart.ts";
import { pkmnEngine } from "./pkmnEngine.ts";
import { DEX_NUMBERS } from "./sets.ts";

const dex = Dex.forGen(9);

test("our type chart matches Showdown's for all 324 matchups", () => {
  for (const attack of TYPE_NAMES) {
    for (const defend of TYPE_NAMES) {
      const name = (t: string) => t[0].toUpperCase() + t.slice(1);
      const showdown = dex.getImmunity(name(attack), [name(defend)]) ? 2 ** dex.getEffectiveness(name(attack), [name(defend)]) : 0;
      assert.equal(effectiveness(attack, [defend]), showdown, `${attack} → ${defend}`);
    }
  }
});

test("every dex number 1..1025 has a species", () => {
  assert.equal(DEX_NUMBERS.length, 1025);
  assert.equal(DEX_NUMBERS[0], 1);
  assert.equal(DEX_NUMBERS.at(-1), 1025);
});

test("battles are reproducible and produce snapshots from turn 0", () => {
  const matchup = pkmnEngine.prepare(6, 9, 42);
  const r1 = pkmnEngine.play(matchup, 7);
  const r2 = pkmnEngine.play(matchup, 7);
  assert.deepEqual(r1, r2);
  assert.equal(r1.snapshots[0].turn, 0);
  assert.equal(r1.snapshots[0].a.dexId, 6);
  assert.equal(r1.snapshots[0].b.dexId, 9);
  assert.ok(r1.aWon === 0 || r1.aWon === 1);
});
