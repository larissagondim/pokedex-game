import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { afterLeague, canChallenge, LEAGUE, leagueBonus, leaderState, trainerTitle } from "./league.ts";

test("eight leaders of three and a champion of six, all with battle sets", () => {
  const sets = JSON.parse(readFileSync(new URL("../public/battle/battle-sets.json", import.meta.url), "utf8")) as Record<string, unknown>;
  assert.equal(LEAGUE.length, 9);
  LEAGUE.forEach((leader, i) => {
    const champion = i === LEAGUE.length - 1;
    assert.equal(leader.title, champion ? "CHAMPION" : "LEADER");
    assert.equal(new Set(leader.team).size, champion ? 6 : 3, leader.name);
    for (const id of leader.team) assert.ok(sets[String(id)], `${leader.name}: #${id}`);
  });
  assert.equal(trainerTitle(LEAGUE[8]), "CHAMPION AURORA");
});

test("leaders unlock in order", () => {
  assert.equal(leaderState(0, 0), "next");
  assert.equal(leaderState(1, 0), "locked");
  assert.equal(leaderState(0, 2), "beaten");
  assert.ok(canChallenge(0, 2) && canChallenge(2, 2) && !canChallenge(3, 2));
  assert.ok(canChallenge(8, 8) && !canChallenge(9, 9));
});

test("only a win against the next leader moves you up", () => {
  assert.equal(afterLeague(2, 2, true), 3);
  assert.equal(afterLeague(2, 2, false), 2);
  assert.equal(afterLeague(2, 0, true), 2);
  assert.equal(afterLeague(8, 8, true), 9);
  assert.equal(afterLeague(9, 8, true), 9);
});

test("later leaders pay more", () => {
  assert.ok(leagueBonus(7) > leagueBonus(0));
});
