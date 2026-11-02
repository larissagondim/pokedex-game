import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseMove } from "./ai.ts";
import { type BattleState, calcDamage, createBattle, type Fighter, runTurn, turnOrder } from "./engine.ts";
import type { BattleMove, BattlePokemon } from "./types.ts";

/** RNG that returns the given values in order, then `fallback`. */
const seq = (values: number[], fallback = 0.5) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : fallback);
};

const move = (over: Partial<BattleMove>): BattleMove => ({
  id: "tackle",
  name: "Tackle",
  type: "normal",
  power: 40,
  category: "physical",
  accuracy: 1,
  priority: 0,
  pp: 35,
  ...over,
});

const mon = (over: Partial<BattlePokemon>): BattlePokemon => ({
  name: "Mon",
  dexId: 1,
  level: 50,
  types: ["normal"],
  hp: 150,
  maxHp: 150,
  stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
  status: null,
  moves: [move({})],
  ...over,
});

const battle = (a: Partial<BattlePokemon>, b: Partial<BattlePokemon>) => createBattle(mon({ name: "A", ...a }), mon({ name: "B", ...b }));
const kinds = (events: { kind: string }[]) => events.map((e) => e.kind);

test("priority first, then speed, ties at random", () => {
  const st = battle({ stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 50 } }, {});
  const quick = { ...st.a.moves[0], priority: 1 };
  assert.deepEqual(turnOrder(st, st.a.moves[0], st.b.moves[0], seq([])), ["b", "a"]);
  assert.deepEqual(turnOrder(st, quick, st.b.moves[0], seq([])), ["a", "b"]);
  const tie = battle({}, {});
  assert.deepEqual(turnOrder(tie, tie.a.moves[0], tie.b.moves[0], seq([0.1])), ["a", "b"]);
  assert.deepEqual(turnOrder(tie, tie.a.moves[0], tie.b.moves[0], seq([0.9])), ["b", "a"]);
});

test("damage formula: roll, STAB, effectiveness, crit and burn", () => {
  const st = battle({}, { types: ["rock"] });
  const tackle = st.a.moves[0];
  // base: floor(floor(22 * 40 * 100 / 100) / 50) + 2 = 19; min roll 85% → 16; STAB → 24; rock resists → 12
  assert.equal(calcDamage(st.a, st.b, tackle, seq([0]), false), 12);
  // max roll 100% → 19 → STAB 28 → 14
  assert.equal(calcDamage(st.a, st.b, tackle, seq([0.999]), false), 14);
  // crit ×1.5 before the roll: 28 → 23 → 34 → 17
  assert.equal(calcDamage(st.a, st.b, tackle, seq([0]), true), 17);
  const burned: Fighter = { ...st.a, status: "brn" };
  assert.equal(calcDamage(burned, st.b, tackle, seq([0]), false), 6);
});

test("immunity, miss and turn events", () => {
  const ghost = battle({}, { types: ["ghost"] });
  const r = runTurn(ghost, 0, 0, seq([0.9, 0.9, 0.9]));
  assert.ok(r.events.some((e) => e.kind === "no-effect" && e.side === "b"));
  const shaky = battle({ moves: [move({ accuracy: 0.5 })] }, {});
  // order roll (0.1: A first), A's accuracy roll 0.7 ≥ 0.5 → miss
  assert.ok(runTurn(shaky, 0, 0, seq([0.1, 0.7])).events.some((e) => e.kind === "miss" && e.side === "a"));
});

test("status moves respect type immunities and existing status", () => {
  const wisp = move({ id: "willowisp", name: "Will-O-Wisp", type: "fire", power: 0, category: "status", status: "brn" });
  const vsFire = runTurn(battle({ moves: [wisp] }, { types: ["fire"] }), 0, 0, seq([0.1]));
  assert.ok(vsFire.events.some((e) => e.kind === "fail" && e.side === "a"));
  const vsNormal = runTurn(battle({ moves: [wisp] }, {}), 0, 0, seq([0.1]));
  assert.equal(vsNormal.state.b.status, "brn");
  const wave = move({ id: "thunderwave", name: "Thunder Wave", type: "electric", power: 0, category: "status", status: "par" });
  assert.equal(runTurn(battle({ moves: [wave] }, { types: ["electric"] }), 0, 0, seq([0.1])).state.b.status, null);
});

test("burn and bad poison deal damage at the end of the turn", () => {
  const st: BattleState = battle({}, { moves: [move({ power: 0, category: "status", id: "splash", name: "Splash" })] });
  st.b.status = "tox";
  const t1 = runTurn(st, 0, 0, seq([0.1], 0.99));
  const t2 = runTurn(t1.state, 0, 0, seq([0.1], 0.99));
  const tox = (r: typeof t1) => r.events.find((e) => e.kind === "residual");
  assert.equal(tox(t1)?.kind === "residual" && tox(t1)?.amount, Math.floor(150 / 16));
  assert.equal(tox(t2)?.kind === "residual" && tox(t2)?.amount, Math.floor((150 * 2) / 16));
});

test("sleep lasts 1-3 turns, then the Pokémon wakes up and moves", () => {
  const st = battle({}, {});
  st.a.status = "slp";
  st.a.sleepTurns = 1;
  const t1 = runTurn(st, 0, 0, seq([0.1], 0.99));
  assert.ok(t1.events.some((e) => e.kind === "cant-move" && e.side === "a"));
  const t2 = runTurn(t1.state, 0, 0, seq([0.1], 0.99));
  assert.ok(t2.events.some((e) => e.kind === "wake" && e.side === "a"));
  assert.ok(t2.events.some((e) => e.kind === "move" && e.side === "a"));
});

test("drain, recoil, healing and stat stages", () => {
  const drain = runTurn(battle({ moves: [move({ drain: [1, 2], power: 80 })] }, {}), 0, 0, seq([0.1], 0.99));
  const st0 = drain.state;
  assert.ok(st0.a.hp <= st0.a.maxHp);
  const recoil = runTurn(battle({ moves: [move({ recoil: [1, 3], power: 120 })] }, {}), 0, 0, seq([0.1], 0.99));
  const dealt = recoil.events.find((e) => e.kind === "damage" && e.side === "b");
  const took = recoil.events.find((e) => e.kind === "recoil");
  assert.ok(dealt?.kind === "damage" && took?.kind === "recoil" && took.amount === Math.floor(dealt.amount / 3));
  const dance = move({ id: "swordsdance", name: "Swords Dance", power: 0, category: "status", boosts: { target: "self", stats: { atk: 2 } } });
  let st = battle({ moves: [dance] }, { moves: [move({ power: 0, category: "status", id: "splash", name: "Splash" })] });
  for (let i = 0; i < 4; i++) st = runTurn(st, 0, 0, seq([0.1], 0.99)).state;
  assert.equal(st.a.boosts.atk, 6, "stages cap at +6");
  const recover = move({ id: "recover", name: "Recover", power: 0, category: "status", heal: [1, 2] });
  const hurt = battle({ moves: [recover] }, {});
  hurt.a.hp = 10;
  const healed = runTurn(hurt, 0, 0, seq([0.1], 0.99));
  assert.ok(healed.events.some((e) => e.kind === "heal" && e.side === "a" && e.amount === 75));
});

test("the battle ends at the first faint and nobody moves after it", () => {
  const strong = battle({ moves: [move({ power: 250 })] }, { hp: 20, maxHp: 20 });
  const r = runTurn(strong, 0, 0, seq([0.1], 0.99));
  assert.equal(r.state.winner, "a");
  assert.deepEqual(kinds(r.events), ["move", "damage", "faint"]);
  assert.deepEqual(runTurn(r.state, 0, 0).events, []);
});

test("PP runs out, then Struggle", () => {
  const st = battle({ moves: [move({ pp: 1 })] }, { hp: 999, maxHp: 999 });
  const t1 = runTurn(st, 0, 0, seq([0.1], 0.99));
  assert.equal(t1.state.a.moves[0].ppLeft, 0);
  const t2 = runTurn(t1.state, 0, 0, seq([0.1], 0.99));
  assert.ok(t2.events.some((e) => e.kind === "move" && e.move === "Struggle"));
});

test("runTurn does not mutate the input state", () => {
  const st = battle({}, {});
  const copy = structuredClone(st);
  runTurn(st, 0, 0);
  assert.deepEqual(st, copy);
});

test("the AI prefers a super-effective hit and skips useless status moves", () => {
  const st = battle(
    {
      moves: [
        move({ type: "water", power: 90, category: "special", id: "surf", name: "Surf" }),
        move({ type: "grass", power: 90, category: "special", id: "energyball", name: "Energy Ball" }),
        move({ power: 0, category: "status", status: "par", id: "thunderwave", name: "Thunder Wave" }),
      ],
    },
    { types: ["water"] },
  );
  st.b.status = "brn";
  assert.equal(chooseMove(st.a, st.b, seq([0.9], 0.5)), 1);
});
