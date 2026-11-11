import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseAction, chooseMove, chooseReplacement, replaceFainted } from "./ai.ts";
import {
  beginBattle,
  type BattleEvent,
  type BattleState,
  calcDamage,
  canSwitch,
  effectiveSpeed,
  createBattle,
  createTeamBattle,
  type Fighter,
  needsReplacement,
  resolvePivot,
  runTurn,
  switchIn,
  turnOrder,
} from "./engine.ts";
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

test("Focus Punch fails if the user was hit first", () => {
  const punch = move({ id: "focuspunch", name: "Focus Punch", type: "fighting", power: 150, priority: -3 });
  const r = runTurn(battle({}, { moves: [punch] }), 0, 0, seq([], 0.99));
  const after = r.events.slice(r.events.findIndex((e) => e.kind === "move" && e.side === "b"));
  assert.equal(after[1]?.kind, "fail");
});

const splash = move({ id: "splash", name: "Splash", power: 0, category: "status" });

test("flinch only works if the target hasn't moved yet", () => {
  const bite = move({ id: "bite", name: "Bite", type: "dark", power: 60, secondary: [{ chance: 100, volatile: "flinch" }] });
  // A is faster: B flinches.
  const fast = battle({ moves: [bite], stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 200 } }, {});
  assert.ok(runTurn(fast, 0, 0, seq([], 0.99)).events.some((e) => e.kind === "cant-move" && e.reason === "flinch"));
  // A is slower: B already moved, no flinch.
  const slow = battle({ moves: [bite], stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 10 } }, {});
  assert.ok(!runTurn(slow, 0, 0, seq([], 0.99)).events.some((e) => e.kind === "cant-move"));
});

test("confusion can make the Pokémon hit itself, then wears off", () => {
  const ray = move({ id: "confuseray", name: "Confuse Ray", type: "ghost", power: 0, category: "status", volatile: "confusion" });
  const st = battle({ moves: [ray], stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 200 } }, {});
  // confuse roll 0 → 2 turns; B's first move: counter 2→1, self-hit roll 0.1 < 1/3
  const t1 = runTurn(st, 0, 0, seq([0, 0.1, 0.5], 0.99));
  assert.ok(t1.events.some((e) => e.kind === "confused" && e.side === "b"));
  assert.ok(t1.events.some((e) => e.kind === "self-hit" && e.side === "b"));
  const t2 = runTurn(t1.state, 0, 0, seq([], 0.99));
  assert.ok(t2.events.some((e) => e.kind === "confusion-end" && e.side === "b"));
});

test("Protect blocks the foe's move and gets less likely in a row", () => {
  const protect = move({ id: "protect", name: "Protect", power: 0, category: "status", priority: 4, volatile: "protect" });
  const t1 = runTurn(battle({ moves: [protect] }, {}), 0, 0, seq([], 0.5));
  assert.ok(t1.events.some((e) => e.kind === "protect" && e.side === "a"));
  assert.ok(t1.events.some((e) => e.kind === "protected" && e.side === "a"));
  assert.equal(t1.state.a.hp, t1.state.a.maxHp);
  // Second in a row needs a roll < 1/3: 0.5 fails.
  const t2 = runTurn(t1.state, 0, 0, seq([], 0.5));
  assert.ok(t2.events.some((e) => e.kind === "fail" && e.side === "a"));
});

test("Leech Seed drains 1/8 each turn and doesn't affect Grass types", () => {
  const seed = move({ id: "leechseed", name: "Leech Seed", type: "grass", power: 0, category: "status", volatile: "leechseed" });
  const t1 = runTurn(battle({ moves: [seed] }, { moves: [splash] }), 0, 0, seq([], 0.99));
  const leech = t1.events.find((e) => e.kind === "leech");
  assert.ok(leech?.kind === "leech" && leech.side === "b" && leech.amount === Math.floor(150 / 8));
  const grass = runTurn(battle({ moves: [seed] }, { types: ["grass"], moves: [splash] }), 0, 0, seq([], 0.99));
  assert.ok(grass.events.some((e) => e.kind === "no-effect"));
});

test("Outrage locks the user for 2-3 turns, then confuses it", () => {
  const outrage = move({ id: "outrage", name: "Outrage", type: "dragon", power: 120, locked: true });
  let st = battle({ moves: [outrage, move({ id: "tackle2" })], hp: 999, maxHp: 999 }, { hp: 999, maxHp: 999, moves: [splash] });
  // lock length roll 0 → 1 more turn; second turn picks move 1 but is forced to Outrage
  const t1 = runTurn(st, 0, 0, seq([0.1, 0.99, 0.99, 0], 0.99));
  st = t1.state;
  assert.ok(st.a.locked);
  const t2 = runTurn(st, 1, 0, seq([0.1], 0.99));
  assert.ok(t2.events.some((e) => e.kind === "move" && e.side === "a" && e.move === "Outrage"));
  assert.ok(t2.events.some((e) => e.kind === "confused" && e.side === "a" && e.fatigue));
  assert.equal(t2.state.a.moves[0].ppLeft, 34, "PP spent once");
});

test("Hyper Beam needs a recharge turn", () => {
  const beam = move({ id: "hyperbeam", name: "Hyper Beam", power: 150, category: "special", recharge: true });
  const st = battle({ moves: [beam], hp: 999, maxHp: 999 }, { hp: 999, maxHp: 999, moves: [splash] });
  const t1 = runTurn(st, 0, 0, seq([], 0.99));
  const t2 = runTurn(t1.state, 0, 0, seq([], 0.99));
  assert.ok(t2.events.some((e) => e.kind === "cant-move" && e.side === "a" && e.reason === "recharge"));
});

test("Thunder Wave doesn't affect Ground types, powders don't affect Grass types", () => {
  const wave = move({ id: "thunderwave", name: "Thunder Wave", type: "electric", power: 0, category: "status", status: "par" });
  const r = runTurn(battle({ moves: [wave] }, { types: ["ground"], moves: [splash] }), 0, 0, seq([], 0.99));
  assert.ok(r.events.some((e) => e.kind === "no-effect" && e.side === "b"));
  assert.equal(r.state.b.status, null);
  const spore = move({ id: "spore", name: "Spore", type: "grass", power: 0, category: "status", status: "slp" });
  assert.equal(runTurn(battle({ moves: [spore] }, { types: ["grass"], moves: [splash] }), 0, 0, seq([], 0.99)).state.b.status, null);
});

test("the AI takes a sure KO and skips status moves the target is immune to", () => {
  const st = battle(
    {
      moves: [
        move({ id: "stoneedge", name: "Stone Edge", type: "rock", power: 100, accuracy: 0.8 }),
        move({ id: "rockslide", name: "Rock Slide", type: "rock", power: 75, accuracy: 0.9 }),
        move({ id: "thunderwave", name: "Thunder Wave", type: "electric", power: 0, category: "status", status: "par" }),
      ],
    },
    { types: ["ground"] },
  );
  st.b.hp = 5; // either rock move knocks it out: the more accurate one wins
  assert.equal(chooseMove(st.a, st.b, seq([0.9], 0.5)), 1);
  st.b.hp = st.b.maxHp;
  // Thunder Wave never beats an attack against a Ground type.
  for (let i = 0; i < 20; i++) assert.notEqual(chooseMove(st.a, st.b, seq([0.9], i / 20)), 2);
});

test("Fake Out only works on the first turn; Sucker Punch needs an incoming attack", () => {
  const fake = move({ id: "fakeout", name: "Fake Out", power: 40, priority: 3, secondary: [{ chance: 100, volatile: "flinch" }] });
  const t1 = runTurn(battle({ moves: [fake] }, { hp: 999, maxHp: 999 }), 0, 0, seq([], 0.99));
  assert.ok(t1.events.some((e) => e.kind === "cant-move" && e.side === "b" && e.reason === "flinch"));
  const t2 = runTurn(t1.state, 0, 0, seq([], 0.99));
  assert.ok(t2.events.some((e) => e.kind === "fail" && e.side === "a"));
  const sucker = move({ id: "suckerpunch", name: "Sucker Punch", type: "dark", power: 70, priority: 1 });
  assert.ok(runTurn(battle({ moves: [sucker] }, { moves: [splash] }), 0, 0, seq([], 0.99)).events.some((e) => e.kind === "fail"));
  assert.ok(runTurn(battle({ moves: [sucker] }, {}), 0, 0, seq([], 0.99)).events.some((e) => e.kind === "damage" && e.side === "b"));
});

test("Rest, Super Fang, Pain Split, Belly Drum and Haze", () => {
  const rest = move({ id: "rest", name: "Rest", type: "psychic", power: 0, category: "status" });
  const tired = battle({ moves: [rest] }, { moves: [splash] });
  tired.a.hp = 10;
  tired.a.status = "brn";
  const r = runTurn(tired, 0, 0, seq([0.1], 0.99));
  assert.equal(r.state.a.hp, r.state.a.maxHp);
  assert.equal(r.state.a.status, "slp");

  const fang = move({ id: "superfang", name: "Super Fang", power: 0 });
  const fanged = battle({ moves: [fang] }, { moves: [splash] });
  fanged.b.hp = 100;
  assert.equal(runTurn(fanged, 0, 0, seq([0.1], 0.99)).state.b.hp, 50);

  const split = move({ id: "painsplit", name: "Pain Split", power: 0, category: "status" });
  const ps = battle({ moves: [split] }, { moves: [splash] });
  ps.a.hp = 20;
  const p = runTurn(ps, 0, 0, seq([0.1], 0.99));
  assert.equal(p.state.a.hp, 85);
  assert.equal(p.state.b.hp, 85);

  const drum = move({ id: "bellydrum", name: "Belly Drum", power: 0, category: "status" });
  const d = runTurn(battle({ moves: [drum] }, { moves: [splash] }), 0, 0, seq([0.1], 0.99));
  assert.equal(d.state.a.boosts.atk, 6);
  assert.equal(d.state.a.hp, 75);

  const haze = move({ id: "haze", name: "Haze", type: "ice", power: 0, category: "status" });
  const hz = battle({ moves: [haze] }, { moves: [splash] });
  hz.b.boosts.atk = 4;
  assert.equal(runTurn(hz, 0, 0, seq([0.1], 0.99)).state.b.boosts.atk, 0);
});

// --- Substitute and status moves with their own rules ---

const status = (id: string, name: string, over: Partial<BattleMove> = {}) => move({ id, name, power: 0, category: "status", ...over });
const fast = { atk: 100, def: 100, spa: 100, spd: 100, spe: 200 };
const slow = { atk: 100, def: 100, spa: 100, spd: 100, spe: 50 };

test("Substitute costs 1/4 HP, takes hits until it breaks and blocks status moves", () => {
  const sub = status("substitute", "Substitute");
  const t1 = runTurn(battle({ moves: [sub], stats: fast }, {}), 0, 0, seq([], 0.99));
  assert.equal(t1.state.a.hp, 150 - 37);
  // Tackle does 28 (max roll, STAB): the 37-HP decoy keeps 9.
  assert.equal(t1.state.a.substitute, 9);
  assert.ok(!t1.events.some((e) => e.kind === "damage" && e.side === "a"));
  const t2 = runTurn(t1.state, 0, 0, seq([], 0.99));
  assert.ok(t2.events.some((e) => e.kind === "sub-damage" && e.side === "a" && e.broke));
  assert.equal(t2.state.a.hp, 113);
  assert.ok(t2.events.some((e) => e.kind === "effect" && e.effect === "substitute-fail"), "only one at a time");

  const wisp = status("willowisp", "Will-O-Wisp", { type: "fire", status: "brn" });
  const shielded = battle({ moves: [sub], stats: fast }, { moves: [wisp] });
  const r = runTurn(shielded, 0, 0, seq([], 0.99));
  assert.equal(r.state.a.status, null);
  assert.ok(r.events.some((e) => e.kind === "fail" && e.side === "b"));
  // Sound moves go through it.
  const voice = move({ id: "hypervoice", name: "Hyper Voice", category: "special", power: 90, flags: ["sound"] });
  const v = runTurn(battle({ moves: [sub], stats: fast }, { moves: [voice] }), 0, 0, seq([], 0.99));
  assert.ok(v.events.some((e) => e.kind === "damage" && e.side === "a" && e.amount > 0));
});

test("Taunt blocks status moves for 3 turns", () => {
  let st = battle({ moves: [status("taunt", "Taunt", { type: "dark" })], stats: fast }, { moves: [splash] });
  const blocked: boolean[] = [];
  for (let i = 0; i < 4; i++) {
    const r = runTurn(st, 0, 0, seq([], 0.99));
    blocked.push(r.events.some((e) => e.kind === "effect" && e.effect === "taunt-block"));
    st = r.state;
    if (i === 0) st.a.moves[0] = { ...st.a.moves[0], id: "tackle", name: "Tackle", category: "physical", power: 1 };
  }
  assert.deepEqual(blocked, [true, true, true, false]);
});

test("Encore makes the foe repeat its last move", () => {
  const encore = status("encore", "Encore");
  const st = battle({ moves: [encore], stats: slow }, { moves: [splash, move({})] });
  const t1 = runTurn(st, 0, 0, seq([], 0.99));
  assert.ok(t1.state.b.encore);
  // B picks Tackle but has to Splash.
  const t2 = runTurn(t1.state, 0, 1, seq([], 0.99));
  assert.ok(t2.events.some((e) => e.kind === "move" && e.side === "b" && e.move === "Splash"));
});

test("Yawn puts the foe to sleep at the end of the next turn", () => {
  const st = battle({ moves: [status("yawn", "Yawn")], stats: fast }, { moves: [splash] });
  const t1 = runTurn(st, 0, 0, seq([], 0.99));
  assert.equal(t1.state.b.status, null);
  const t2 = runTurn(t1.state, 0, 0, seq([], 0.99));
  assert.equal(t2.state.b.status, "slp");
});

test("Destiny Bond takes the attacker down too", () => {
  const bond = status("destinybond", "Destiny Bond", { type: "ghost" });
  const r = runTurn(battle({ moves: [move({ power: 250 })] }, { moves: [bond], stats: fast }), 0, 0, seq([], 0.99));
  assert.equal(r.state.a.hp, 0);
  assert.equal(r.state.b.hp, 0);
  assert.ok(r.events.some((e) => e.kind === "hurt" && e.cause === "destiny-bond" && e.side === "a"));
  // Not twice in a row.
  const twice = battle({ moves: [splash] }, { moves: [bond], stats: fast });
  const t1 = runTurn(twice, 0, 0, seq([], 0.99));
  assert.ok(runTurn(t1.state, 0, 0, seq([], 0.99)).events.some((e) => e.kind === "fail" && e.side === "b"));
});

test("Curse: a Ghost type halves its HP to curse the foe, others trade Speed for Attack and Defense", () => {
  const curse = status("curse", "Curse", { type: "ghost" });
  const r = runTurn(battle({ types: ["ghost"], moves: [curse] }, { moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(r.state.a.hp, 75);
  assert.ok(r.events.some((e) => e.kind === "hurt" && e.side === "b" && e.cause === "curse" && e.amount === 37));
  const plain = runTurn(battle({ moves: [curse] }, { moves: [splash] }), 0, 0, seq([], 0.99)).state.a.boosts;
  assert.deepEqual([plain.atk, plain.def, plain.spe], [1, 1, -1]);
});

test("Sleep Talk uses another move while asleep and fails when awake", () => {
  const talk = status("sleeptalk", "Sleep Talk");
  const st = battle({ moves: [talk, move({})] }, { moves: [splash] });
  st.a.status = "slp";
  st.a.sleepTurns = 2;
  const r = runTurn(st, 0, 0, seq([], 0.99));
  assert.ok(r.events.some((e) => e.kind === "move" && e.side === "a" && e.move === "Tackle"));
  assert.ok(r.events.some((e) => e.kind === "damage" && e.side === "b"));
  const awake = runTurn(battle({ moves: [talk] }, { moves: [splash] }), 0, 0, seq([], 0.99));
  assert.ok(awake.events.some((e) => e.kind === "fail" && e.side === "a"));
});

test("Transform copies the foe until it switches out", () => {
  const transform = status("transform", "Transform");
  const st = createTeamBattle(team({ moves: [transform] }, {}), team({ types: ["fire"], stats: fast, moves: [move({ type: "fire" })] }));
  const t1 = runTurn(st, 0, 0, seq([], 0.99));
  assert.deepEqual(t1.state.a.types, ["fire"]);
  assert.equal(t1.state.a.stats.spe, 200);
  assert.equal(t1.state.a.moves[0].ppLeft, 5);
  const t2 = runTurn(t1.state, { switchTo: 0 }, 0, seq([], 0.99));
  assert.deepEqual(t2.state.bench.a[0].types, ["normal"]);
  assert.equal(t2.state.bench.a[0].moves[0].id, "transform");
});

test("Strength Sap heals by the foe's Attack and lowers it; Magnet Rise dodges Ground moves", () => {
  const sap = status("strengthsap", "Strength Sap", { type: "grass" });
  const st = battle({ moves: [sap], stats: fast }, { moves: [splash] });
  st.a.hp = 20;
  const r = runTurn(st, 0, 0, seq([], 0.99));
  assert.equal(r.state.a.hp, 120);
  assert.equal(r.state.b.boosts.atk, -1);

  const rise = status("magnetrise", "Magnet Rise", { type: "electric" });
  const quake = move({ id: "earthquake", name: "Earthquake", type: "ground", power: 100 });
  const m = runTurn(battle({ moves: [rise], stats: fast }, { moves: [quake] }), 0, 0, seq([], 0.99));
  assert.ok(m.events.some((e) => e.kind === "no-effect" && e.side === "a"));
});

test("Heal Bell cures the whole team; Revival Blessing brings a teammate back", () => {
  const bell = status("healbell", "Heal Bell", { flags: ["sound"] });
  const st = createTeamBattle(team({ moves: [bell] }, {}), team({ moves: splashOnly }));
  st.a.status = "par";
  st.bench.a[0].status = "tox";
  const r = runTurn(st, 0, 0, seq([0.9], 0.99));
  assert.equal(r.state.a.status, null);
  assert.equal(r.state.bench.a[0].status, null);

  const blessing = status("revivalblessing", "Revival Blessing");
  const down = createTeamBattle(team({ moves: [blessing] }, {}), team({ moves: splashOnly }));
  down.bench.a[0].hp = 0;
  assert.deepEqual(chooseAction(down, "a", seq([0.9])), 0);
  const back = runTurn(down, 0, 0, seq([], 0.99));
  assert.equal(back.state.bench.a[0].hp, 75);
});

// --- Teams, switching and items ---

const team = (...mons: Partial<BattlePokemon>[]) => mons.map((m, i) => mon({ name: `M${i}`, dexId: i + 1, ...m }));
const splashOnly = [move({ id: "splash", name: "Splash", category: "status", power: 0 })];

test("a faint with someone on the bench doesn't end the battle", () => {
  const st = createTeamBattle(team({ moves: [move({ power: 250 })] }), team({ hp: 1, maxHp: 150 }, {}));
  const r = runTurn(st, 0, 0, seq([0.1], 0.99));
  assert.equal(r.state.winner, null);
  assert.ok(needsReplacement(r.state, "b"));
  const next = switchIn(r.state, "b", 0);
  assert.equal(next.state.b.name, "M1");
  assert.deepEqual(kinds(next.events), ["switch"]);
  assert.equal(next.state.bench.b[0].hp, 0);
});

test("the battle ends when a side has nobody left", () => {
  let st = createTeamBattle(team({ moves: [move({ power: 250 })] }), team({ hp: 1, maxHp: 150 }, { hp: 1, maxHp: 150 }));
  st = runTurn(st, 0, 0, seq([0.1], 0.99)).state;
  st = switchIn(st, "b", 0).state;
  const last = runTurn(st, 0, 0, seq([0.1], 0.99));
  assert.equal(last.state.winner, "a");
});

test("switching goes before moves, the foe hits the incoming Pokémon and stat changes reset", () => {
  const st = createTeamBattle(team({ moves: splashOnly }, { types: ["ghost"] }), team({ stats: { atk: 100, def: 100, spa: 100, spd: 100, spe: 200 } }));
  st.a.boosts.atk = 2;
  const r = runTurn(st, { switchTo: 0 }, 0, seq([0.1], 0.99));
  assert.equal(r.events[0].kind, "switch");
  assert.equal(r.state.a.name, "M1");
  assert.equal(r.state.bench.a[0].boosts.atk, 0);
  // Tackle into a Ghost: no effect.
  assert.ok(r.events.some((e) => e.kind === "no-effect" && e.side === "a"));
  // The Pokémon that came in still gets its "first turn" next turn.
  assert.equal(r.state.a.turnsActive, 0);
});

test("can't switch while locked into a move, or to a fainted Pokémon", () => {
  const st = createTeamBattle(team({}, { hp: 0, maxHp: 150 }), team({}));
  st.bench.a[0].hp = 0;
  const r = runTurn(st, { switchTo: 0 }, 0, seq([0.1], 0.99));
  assert.ok(!r.events.some((e) => e.kind === "switch"));
  assert.ok(r.events.some((e) => e.kind === "move" && e.side === "a"));
  const locked = createTeamBattle(team({}, {}), team({}));
  locked.a.locked = { index: 0, turnsLeft: 1 };
  assert.ok(!runTurn(locked, { switchTo: 0 }, 0, seq([0.1], 0.99)).events.some((e) => e.kind === "switch"));
});

test("items: Super Potion heals 60, Full Heal cures, and they run out", () => {
  const st = createTeamBattle(team({}), team({ moves: splashOnly }));
  st.a.hp = 50;
  st.a.status = "psn";
  const potion = runTurn(st, { item: "potion" }, 0, seq([0.1], 0.99));
  assert.deepEqual(kinds(potion.events).slice(0, 2), ["item", "heal"]);
  assert.equal(potion.state.bag.a.potion, 1);
  const cured = runTurn(potion.state, { item: "fullheal" }, 0, seq([0.1], 0.99));
  assert.equal(cured.state.a.status, null);
  assert.equal(cured.state.bag.a.fullheal, 0);
  // None left: falls back to a move.
  const empty = runTurn(cured.state, { item: "fullheal" }, 0, seq([0.1], 0.99));
  assert.ok(!empty.events.some((e) => e.kind === "item"));
});

test("Sucker Punch fails if the foe switches", () => {
  const sucker = move({ id: "suckerpunch", name: "Sucker Punch", priority: 1, type: "dark" });
  const st = createTeamBattle(team({ moves: [sucker] }), team({}, {}));
  const r = runTurn(st, 0, { switchTo: 0 }, seq([0.1], 0.99));
  assert.ok(r.events.some((e) => e.kind === "fail" && e.side === "a"));
});

test("the AI sends out its best matchup and switches out of a bad one", () => {
  const water = move({ id: "surf", name: "Surf", type: "water", category: "special", power: 90 });
  const grass = move({ id: "gigadrain", name: "Giga Drain", type: "grass", category: "special", power: 75 });
  // Your Water type against the foe's Fire lead; the foe has a Grass type on the bench.
  const st = createTeamBattle(team({ types: ["water"], moves: [water] }), team({ types: ["fire"], moves: [move({ type: "fire", power: 40 })] }, { types: ["grass"], moves: [grass] }));
  assert.equal(chooseReplacement(st.bench.b, st.a), 0);
  st.b.turnsActive = 1;
  assert.deepEqual(chooseAction(st, "b", seq([0.1], 0.5)), { switchTo: 0 });
  // Not on its first turn out.
  st.b.turnsActive = 0;
  assert.equal(typeof chooseAction(st, "b", seq([0.9], 0.5)), "number");
  st.b.hp = 0;
  assert.equal(replaceFainted(st).b.types[0], "grass");
});

// --- The field: hazards, screens, weather, Trick Room, Wish ---

test("hazards hurt whoever switches in; Rapid Spin clears them", () => {
  const rocks = status("stealthrock", "Stealth Rock", { type: "rock" });
  const spikes = status("spikes", "Spikes", { type: "ground" });
  const tspikes = status("toxicspikes", "Toxic Spikes", { type: "poison" });
  const web = status("stickyweb", "Sticky Web", { type: "bug" });
  let st = createTeamBattle(team({ moves: [rocks, spikes, tspikes, web], stats: fast }), team({ moves: splashOnly }, { types: ["fire", "flying"] }, {}));
  for (const i of [0, 1, 2, 3]) st = runTurn(st, i, 0, seq([], 0.99)).state;
  assert.deepEqual([st.field.b.stealthRock, st.field.b.spikes, st.field.b.toxicSpikes, st.field.b.stickyWeb], [true, 1, 1, true]);
  // Fire/Flying: Stealth Rock ×4 = half its HP, and it floats over the rest.
  const flyer = runTurn(st, 0, { switchTo: 0 }, seq([], 0.99));
  assert.equal(flyer.state.b.hp, 75);
  assert.equal(flyer.state.b.status, null);
  // A grounded Normal type: rocks 1/8, one layer of spikes 1/8, poison, -1 Speed.
  const walker = runTurn(st, 0, { switchTo: 1 }, seq([], 0.99));
  assert.equal(walker.state.b.hp, 150 - 18 - 18 - 18);
  assert.equal(walker.state.b.status, "psn");
  assert.equal(walker.state.b.boosts.spe, -1);
  // Rapid Spin clears the user's side.
  const spin = move({ id: "rapidspin", name: "Rapid Spin", power: 50, secondary: [{ chance: 100, selfBoosts: { spe: 1 } }] });
  const swept = createTeamBattle(team({ moves: [spin] }), team({ moves: splashOnly }));
  swept.field.a.spikes = 2;
  assert.equal(runTurn(swept, 0, 0, seq([], 0.99)).state.field.a.spikes, 0);
});

test("Reflect halves physical damage until Brick Break shatters it", () => {
  const reflect = status("reflect", "Reflect", { type: "psychic" });
  const open = runTurn(battle({ moves: [splash], stats: fast }, {}), 0, 0, seq([], 0.99));
  const shielded = runTurn(battle({ moves: [reflect], stats: fast }, {}), 0, 0, seq([], 0.99));
  const dmg = (r: typeof open) => r.events.find((e) => e.kind === "damage" && e.side === "a");
  assert.ok(dmg(open)?.kind === "damage" && dmg(shielded)?.kind === "damage");
  assert.equal((dmg(shielded) as { amount: number }).amount, Math.floor((dmg(open) as { amount: number }).amount / 2));
  const brick = move({ id: "brickbreak", name: "Brick Break", type: "fighting", power: 75 });
  const st = battle({ moves: [splash] }, { moves: [brick] });
  st.field.a.reflect = 3;
  const r = runTurn(st, 0, 0, seq([], 0.99));
  assert.equal(r.state.field.a.reflect, 0);
  assert.ok(r.events.some((e) => e.kind === "effect" && e.effect === "screens-broken"));
});

test("weather: sun powers Fire, sand chips, rain makes Thunder sure, and it ends after 5 turns", () => {
  const ember = move({ id: "ember", name: "Ember", type: "fire", category: "special", power: 40 });
  const st = battle({}, {});
  const plain = calcDamage(st.a, st.b, { ...ember, ppLeft: 1 }, seq([0.99]), false);
  const sunny = calcDamage(st.a, st.b, { ...ember, ppLeft: 1 }, seq([0.99]), false, { weather: "sun" });
  assert.ok(sunny > plain * 1.4);

  const sand = status("sandstorm", "Sandstorm", { type: "rock" });
  let sandy = battle({ moves: [sand], types: ["rock"] }, { moves: [splash] });
  const t1 = runTurn(sandy, 0, 0, seq([], 0.99));
  assert.ok(t1.events.some((e) => e.kind === "hurt" && e.cause === "sandstorm" && e.side === "b"));
  assert.ok(!t1.events.some((e) => e.kind === "hurt" && e.side === "a"), "Rock types don't mind");
  sandy = t1.state;
  sandy.a.moves[0] = { ...sandy.a.moves[0], id: "splash2" };
  for (let i = 0; i < 4; i++) sandy = runTurn(sandy, 0, 0, seq([], 0.99)).state;
  assert.equal(sandy.weather, null);

  const thunder = move({ id: "thunder", name: "Thunder", type: "electric", category: "special", power: 110, accuracy: 0.7 });
  const rainy = battle({ moves: [thunder], stats: fast }, { moves: [splash] });
  rainy.weather = { kind: "rain", turns: 5 };
  // A 0.95 roll misses a 70% move, but not in rain.
  assert.ok(runTurn(rainy, 0, 0, seq([0.95], 0.99)).events.some((e) => e.kind === "damage" && e.side === "b"));
});

test("Trick Room lets the slower Pokémon move first", () => {
  const st = battle({ stats: slow }, {});
  st.trickRoom = 3;
  assert.deepEqual(turnOrder(st, st.a.moves[0], st.b.moves[0], seq([])), ["a", "b"]);
});

test("Wish heals half the user's HP at the end of the next turn", () => {
  const wish = status("wish", "Wish");
  const st = battle({ moves: [wish, splash], stats: fast }, { moves: [splash] });
  st.a.hp = 10;
  const t1 = runTurn(st, 0, 0, seq([], 0.99));
  assert.equal(t1.state.a.hp, 10);
  const t2 = runTurn(t1.state, 1, 0, seq([], 0.99));
  assert.equal(t2.state.a.hp, 85);
});

test("Healing Wish faints the user and fully heals the next one; Roar drags out a random foe", () => {
  const wish = status("healingwish", "Healing Wish", { type: "psychic" });
  const st = createTeamBattle(team({ moves: [wish] }, {}), team({ moves: splashOnly }));
  st.bench.a[0].hp = 30;
  st.bench.a[0].status = "brn";
  const r = runTurn(st, 0, 0, seq([], 0.99));
  assert.equal(r.state.a.hp, 0);
  const next = switchIn(r.state, "a", 0);
  assert.equal(next.state.a.hp, 150);
  assert.equal(next.state.a.status, null);
  // Alone, it fails.
  assert.ok(runTurn(battle({ moves: [wish] }, { moves: [splash] }), 0, 0, seq([], 0.99)).events.some((e) => e.kind === "fail"));

  const roar = status("roar", "Roar", { priority: -6, flags: ["sound", "bypasssub"] });
  const foes = createTeamBattle(team({ moves: [roar] }), team({ moves: splashOnly }, {}, {}));
  const dragged = runTurn(foes, 0, 0, seq([], 0.99));
  assert.ok(dragged.events.some((e) => e.kind === "switch" && e.side === "b" && e.dragged));
  assert.equal(dragged.state.b.name, "M2");
  assert.ok(runTurn(battle({ moves: [roar] }, { moves: [splash] }), 0, 0, seq([], 0.99)).events.some((e) => e.kind === "fail"));
});

// --- Pivots ---

test("U-turn pauses the turn; the chosen Pokémon comes in and takes the slower foe's hit", () => {
  const uturn = move({ id: "uturn", name: "U-turn", type: "bug", power: 70 });
  const st = createTeamBattle(team({ moves: [uturn], stats: fast }, { types: ["ghost"] }), team({}));
  const r = runTurn(st, 0, 0, seq([], 0.99));
  assert.equal(r.state.pending?.side, "a");
  assert.ok(!r.events.some((e) => e.kind === "move" && e.side === "b"), "the foe hasn't moved yet");
  assert.equal(r.state.turn, 1);
  const done = resolvePivot(r.state, 0, seq([], 0.99));
  assert.equal(done.state.pending, null);
  assert.equal(done.state.a.name, "M1");
  // The foe's Tackle hits the Ghost that came in.
  assert.ok(done.events.some((e) => e.kind === "no-effect" && e.side === "a"));
  assert.equal(done.state.turn, 2);
  assert.equal(done.state.a.turnsActive, 0);
  // runTurn waits until the pivot is resolved.
  assert.deepEqual(runTurn(r.state, 0, 0).events, []);
});

test("alone, U-turn is just an attack; Parting Shot lowers the foe's stats before switching", () => {
  const uturn = move({ id: "uturn", name: "U-turn", type: "bug", power: 70 });
  assert.equal(runTurn(battle({ moves: [uturn] }, {}), 0, 0, seq([], 0.99)).state.pending, null);
  const shot = status("partingshot", "Parting Shot", { type: "dark", flags: ["sound", "bypasssub"] });
  const st = createTeamBattle(team({ moves: [shot], stats: fast }, {}), team({}));
  const r = runTurn(st, 0, 0, seq([], 0.99));
  assert.deepEqual([r.state.b.boosts.atk, r.state.b.boosts.spa], [-1, -1]);
  assert.equal(r.state.pending?.side, "a");
  // The AI (and the simulations) settle a pending pivot with its best matchup.
  assert.equal(replaceFainted(r.state).pending, null);
});

// --- Damaging moves with their own rules, freeze ---

const dmgTo = (events: BattleEvent[], side: string) => {
  const hit = events.find((e) => e.kind === "damage" && e.side === side);
  return hit?.kind === "damage" ? hit.amount : 0;
};

test("Explosion faints the user", () => {
  const boom = move({ id: "explosion", name: "Explosion", power: 250 });
  const r = runTurn(createTeamBattle(team({ moves: [boom] }, {}), team({ hp: 999, maxHp: 999, moves: splashOnly })), 0, 0, seq([], 0.99));
  assert.ok(dmgTo(r.events, "b") > 0);
  assert.equal(r.state.a.hp, 0);
  assert.ok(needsReplacement(r.state, "a"));
});

test("Solar Beam charges for a turn, except in sun", () => {
  const beam = move({ id: "solarbeam", name: "Solar Beam", type: "grass", category: "special", power: 120 });
  const st = battle({ moves: [beam, move({})] }, { hp: 999, maxHp: 999, moves: [splash] });
  const t1 = runTurn(st, 0, 0, seq([], 0.99));
  assert.equal(dmgTo(t1.events, "b"), 0);
  assert.equal(t1.state.a.charging, 0);
  // Picks Tackle, but the beam fires; PP spent once.
  const t2 = runTurn(t1.state, 1, 0, seq([], 0.99));
  assert.ok(dmgTo(t2.events, "b") > 0);
  assert.ok(t2.events.some((e) => e.kind === "move" && e.side === "a" && e.move === "Solar Beam"));
  assert.equal(t2.state.a.moves[0].ppLeft, beam.pp - 1);
  const sunny = battle({ moves: [beam] }, { hp: 999, maxHp: 999, moves: [splash] });
  sunny.weather = { kind: "sun", turns: 5 };
  assert.ok(dmgTo(runTurn(sunny, 0, 0, seq([], 0.99)).events, "b") > 0);
});

test("Counter returns double the physical damage taken this turn", () => {
  const counter = move({ id: "counter", name: "Counter", type: "fighting", power: 0, priority: -5 });
  const r = runTurn(battle({ moves: [counter] }, { hp: 999, maxHp: 999 }), 0, 0, seq([], 0.99));
  assert.equal(dmgTo(r.events, "b"), 2 * dmgTo(r.events, "a"));
  const special = move({ id: "swift", name: "Swift", category: "special", power: 60 });
  const miss = runTurn(battle({ moves: [counter] }, { moves: [special] }), 0, 0, seq([], 0.99));
  assert.ok(miss.events.some((e) => e.kind === "fail" && e.side === "a"));
});

test("variable power: Facade, Hex, Low Kick and Eruption", () => {
  const hit = (m: BattleMove, a: Partial<BattlePokemon>, b: Partial<BattlePokemon>, setup?: (st: BattleState) => void) => {
    const st = battle({ moves: [m], stats: fast, ...a }, { hp: 999, maxHp: 999, moves: [splash], ...b });
    setup?.(st);
    return dmgTo(runTurn(st, 0, 0, seq([], 0.99)).events, "b");
  };
  const facade = move({ id: "facade", name: "Facade", power: 70 });
  // Burned: double power and no burn halving.
  assert.ok(hit(facade, {}, {}, (st) => (st.a.status = "brn")) > 1.8 * hit(facade, {}, {}));
  const hex = move({ id: "hex", name: "Hex", type: "ghost", category: "special", power: 65 });
  assert.ok(hit(hex, {}, { types: ["psychic"] }, (st) => (st.b.status = "par")) > 1.8 * hit(hex, {}, { types: ["psychic"] }));
  const kick = move({ id: "lowkick", name: "Low Kick", type: "fighting", power: 0 });
  assert.ok(hit(kick, {}, { weight: 250 }) > 4 * hit(kick, {}, { weight: 5 }));
  const eruption = move({ id: "eruption", name: "Eruption", type: "fire", category: "special", power: 150 });
  assert.ok(hit(eruption, {}, {}) > 3 * hit(eruption, {}, {}, (st) => (st.a.hp = 30)));
});

test("Psyshock hits Defense, Body Press uses Defense, Foul Play uses the target's Attack", () => {
  const st = battle({ stats: { atk: 50, def: 200, spa: 100, spd: 100, spe: 100 } }, { stats: { atk: 200, def: 100, spa: 100, spd: 300, spe: 100 } });
  const f = (m: BattleMove) => calcDamage(st.a, st.b, { ...m, ppLeft: 1 }, seq([0.99]), false);
  const psyshock = move({ id: "psyshock", name: "Psyshock", type: "psychic", category: "special", power: 80 });
  const psychic = move({ id: "psychic", name: "Psychic", type: "psychic", category: "special", power: 80 });
  assert.ok(f(psyshock) > 2 * f(psychic));
  const press = move({ id: "bodypress", name: "Body Press", type: "fighting", power: 80 });
  const tackle80 = move({ id: "strength", name: "Strength", type: "fighting", power: 80 });
  assert.ok(f(press) > 3 * f(tackle80));
  const foul = move({ id: "foulplay", name: "Foul Play", type: "dark", power: 95 });
  const crunch = move({ id: "crunch", name: "Crunch", type: "dark", power: 95 });
  assert.ok(f(foul) > 3 * f(crunch));
});

test("freeze: can't move, thaws 20% of the time, and Fire moves thaw it", () => {
  const st = battle({}, { moves: [splash] });
  st.a.status = "frz";
  // Speed tie roll first, then the thaw roll: 0.99 ≥ 0.2 stays frozen.
  const stuck = runTurn(st, 0, 0, seq([0.5], 0.99));
  assert.ok(stuck.events.some((e) => e.kind === "cant-move" && e.side === "a" && e.reason === "frz"));
  const thawed = runTurn(st, 0, 0, seq([0.1, 0.1], 0.99));
  assert.equal(thawed.state.a.status, null);
  const ember = move({ id: "ember", name: "Ember", type: "fire", category: "special", power: 40 });
  const melt = battle({ moves: [ember] }, {});
  melt.b.status = "frz";
  assert.equal(runTurn(melt, 0, 0, seq([0.1, 0.99], 0.99)).state.b.status, null);
  // Ice types can't be frozen.
  const beam = move({ id: "icebeam", name: "Ice Beam", type: "ice", category: "special", power: 90, secondary: [{ chance: 100, status: "frz" }] });
  assert.equal(runTurn(battle({ moves: [beam] }, { types: ["ice"], moves: [splash] }), 0, 0, seq([], 0.99)).state.b.status, null);
  assert.equal(runTurn(battle({ moves: [beam] }, { hp: 999, maxHp: 999, moves: [splash] }), 0, 0, seq([], 0.99)).state.b.status, "frz");
});

// --- Abilities ---

const earthquake = move({ id: "earthquake", name: "Earthquake", type: "ground", power: 100 });

test("Intimidate on entry; Clear Body blocks it and Defiant answers it", () => {
  const begun = beginBattle(battle({ ability: "Intimidate" }, {}));
  assert.equal(begun.state.b.boosts.atk, -1);
  assert.ok(begun.events.some((e) => e.kind === "ability" && e.side === "a" && e.ability === "Intimidate"));
  assert.equal(beginBattle(battle({ ability: "Intimidate" }, { ability: "Clear Body" })).state.b.boosts.atk, 0);
  assert.equal(beginBattle(battle({ ability: "Intimidate" }, { ability: "Defiant" })).state.b.boosts.atk, 1);
  // runTurn does it on the first turn if the screen didn't.
  assert.equal(runTurn(battle({ ability: "Intimidate", moves: [splash] }, { moves: [splash] }), 0, 0, seq([], 0.99)).state.b.boosts.atk, -1);
});

test("Levitate, Volt Absorb and Flash Fire; Mold Breaker ignores them", () => {
  const lev = runTurn(battle({ moves: [earthquake] }, { ability: "Levitate", moves: [splash] }), 0, 0, seq([], 0.99));
  assert.ok(lev.events.some((e) => e.kind === "no-effect" && e.side === "b"));
  assert.ok(runTurn(battle({ ability: "Mold Breaker", moves: [earthquake] }, { ability: "Levitate", moves: [splash] }), 0, 0, seq([], 0.99)).state.b.hp < 150);
  const bolt = move({ id: "thunderbolt", name: "Thunderbolt", type: "electric", category: "special", power: 90 });
  const absorb = battle({ moves: [bolt] }, { ability: "Volt Absorb", moves: [splash] });
  absorb.b.hp = 100;
  assert.equal(runTurn(absorb, 0, 0, seq([], 0.99)).state.b.hp, 137);
  const ember = move({ id: "ember", name: "Ember", type: "fire", category: "special", power: 40 });
  const ff = runTurn(battle({ moves: [ember] }, { ability: "Flash Fire", moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(ff.state.b.hp, 150);
  assert.ok(ff.state.b.flashFire);
});

test("damage abilities: Huge Power, Thick Fat, Multiscale, Adaptability", () => {
  const ember = move({ id: "ember", name: "Ember", type: "fire", category: "special", power: 40 });
  const d = (a: Partial<BattlePokemon>, b: Partial<BattlePokemon>, m: BattleMove = move({})) => {
    const st = battle(a, b);
    return calcDamage(st.a, st.b, { ...m, ppLeft: 1 }, seq([0.99]), false);
  };
  assert.ok(d({ ability: "Huge Power" }, {}) > 1.9 * d({}, {}));
  assert.ok(d({}, { ability: "Thick Fat" }, ember) < 0.6 * d({}, {}, ember));
  assert.ok(d({}, { ability: "Multiscale" }) < 0.6 * d({}, {}));
  assert.ok(d({ ability: "Adaptability" }, {}) > 1.3 * d({}, {}));
});

test("Sturdy survives a knockout blow from full HP", () => {
  const r = runTurn(battle({ moves: [move({ power: 250 })] }, { ability: "Sturdy", moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(r.state.b.hp, 1);
  assert.ok(r.events.some((e) => e.kind === "effect" && e.effect === "sturdy"));
});

test("contact: Static paralyzes (30%), Rough Skin hurts the attacker", () => {
  // Order roll, then crit and damage rolls, then Static's 30% roll.
  const st = battle({ moves: [move({ flags: ["contact"] })], stats: fast }, { ability: "Static", hp: 999, maxHp: 999, moves: [splash] });
  assert.equal(runTurn(st, 0, 0, seq([0.99, 0.99, 0.1], 0.99)).state.a.status, "par");
  assert.equal(runTurn(st, 0, 0, seq([0.99, 0.99, 0.5], 0.99)).state.a.status, null);
  const rough = runTurn(battle({ moves: [move({ flags: ["contact"] })], stats: fast }, { ability: "Rough Skin", hp: 999, maxHp: 999, moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(rough.state.a.hp, 150 - 18);
});

test("Drizzle sets rain on entry and Swift Swim doubles Speed in it", () => {
  const st = beginBattle(battle({ ability: "Drizzle" }, { ability: "Swift Swim" })).state;
  assert.equal(st.weather?.kind, "rain");
  assert.equal(effectiveSpeed(st.b, "rain"), 200);
});

test("Speed Boost, Regenerator and Natural Cure", () => {
  let st = createTeamBattle(team({ ability: "Speed Boost", moves: splashOnly }, {}), team({ moves: splashOnly }));
  st = runTurn(st, 0, 0, seq([], 0.99)).state;
  assert.equal(st.a.boosts.spe, 1);
  const regen = createTeamBattle(team({ ability: "Regenerator" }, {}), team({ moves: splashOnly }));
  regen.a.hp = 50;
  regen.a.status = "par";
  assert.equal(runTurn(regen, { switchTo: 0 }, 0, seq([], 0.99)).state.bench.a[0].hp, 100);
  const cure = createTeamBattle(team({ ability: "Natural Cure" }, {}), team({ moves: splashOnly }));
  cure.a.status = "tox";
  assert.equal(runTurn(cure, { switchTo: 0 }, 0, seq([], 0.99)).state.bench.a[0].status, null);
});

test("Truant skips every other turn", () => {
  let st = battle({ ability: "Truant", hp: 999, maxHp: 999 }, { hp: 999, maxHp: 999, moves: [splash] });
  const moved: boolean[] = [];
  for (let i = 0; i < 4; i++) {
    const r = runTurn(st, 0, 0, seq([], 0.99));
    moved.push(r.events.some((e) => e.kind === "move" && e.side === "a"));
    st = r.state;
  }
  assert.deepEqual(moved, [true, false, true, false]);
});

test("Magic Guard, Insomnia, Contrary and Prankster", () => {
  const recoil = move({ id: "doubleedge", name: "Double-Edge", power: 120, recoil: [33, 100] });
  const guard = battle({ ability: "Magic Guard", moves: [recoil] }, { hp: 999, maxHp: 999, moves: [splash] });
  guard.a.status = "psn";
  assert.equal(runTurn(guard, 0, 0, seq([], 0.99)).state.a.hp, 150);
  const spore = move({ id: "spore", name: "Spore", type: "grass", power: 0, category: "status", status: "slp" });
  assert.equal(runTurn(battle({ moves: [spore] }, { ability: "Insomnia", moves: [splash] }), 0, 0, seq([], 0.99)).state.b.status, null);
  const growl = status("growl", "Growl", { boosts: { target: "foe", stats: { atk: -1 } } });
  assert.equal(runTurn(battle({ moves: [growl] }, { ability: "Contrary", moves: [splash] }), 0, 0, seq([], 0.99)).state.b.boosts.atk, 1);
  // Prankster: the slower user's status move goes first, but not against a Dark type.
  const wave = status("thunderwave", "Thunder Wave", { type: "electric", status: "par" });
  const pr = runTurn(battle({ ability: "Prankster", moves: [wave], stats: slow }, { hp: 999, maxHp: 999 }), 0, 0, seq([], 0.99));
  assert.equal(pr.events.find((e) => e.kind === "move")?.side, "a");
  assert.equal(runTurn(battle({ ability: "Prankster", moves: [wave] }, { types: ["dark"], moves: [splash] }), 0, 0, seq([], 0.99)).state.b.status, null);
});

test("Shadow Tag traps the foe; Imposter transforms on entry; Disguise takes the first hit", () => {
  const trap = createTeamBattle(team({}, {}), team({ ability: "Shadow Tag" }));
  assert.equal(canSwitch(trap, "a"), false);
  const ditto = beginBattle(battle({ ability: "Imposter", moves: [status("transform", "Transform")] }, { types: ["dragon"], stats: fast }));
  assert.deepEqual(ditto.state.a.types, ["dragon"]);
  const mimikyu = runTurn(battle({ moves: [move({ power: 250 })] }, { ability: "Disguise", moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(mimikyu.state.b.hp, 150 - 18);
  assert.equal(mimikyu.state.b.disguised, false);
});

// --- Held items ---

test("Leftovers heal 1/16; Black Sludge hurts non-Poison types", () => {
  const st = battle({ item: "Leftovers", moves: [splash] }, { item: "Black Sludge", moves: [splash] });
  st.a.hp = 100;
  const r = runTurn(st, 0, 0, seq([], 0.99));
  assert.equal(r.state.a.hp, 109);
  assert.equal(r.state.b.hp, 150 - 18);
});

test("Life Orb: 1.3× damage and 1/10 recoil; Choice Band: 1.5× and locked into the first move", () => {
  const d = (item?: string) => {
    const st = battle({ item }, {});
    return calcDamage(st.a, st.b, st.a.moves[0], seq([0.99]), false);
  };
  assert.ok(d("Life Orb") >= Math.floor(d() * 1.3) - 1);
  assert.ok(d("Choice Band") >= Math.floor(d() * 1.5) - 1);
  const orb = runTurn(battle({ item: "Life Orb", stats: fast }, { hp: 999, maxHp: 999, moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(orb.state.a.hp, 135);
  const band = battle({ item: "Choice Band", moves: [move({}), move({ id: "slam", name: "Slam", power: 80 })] }, { hp: 999, maxHp: 999, moves: [splash] });
  const t1 = runTurn(band, 0, 0, seq([], 0.99));
  assert.equal(t1.state.a.choiceLock, 0);
  const t2 = runTurn(t1.state, 1, 0, seq([], 0.99));
  assert.ok(t2.events.some((e) => e.kind === "move" && e.side === "a" && e.move === "Tackle"));
  assert.equal(chooseMove(t2.state.a, t2.state.b, seq([0.9])), 0);
});

test("Focus Sash survives from full HP; Sitrus Berry heals at half; Lum Berry cures", () => {
  const sash = runTurn(battle({ moves: [move({ power: 250 })] }, { item: "Focus Sash", moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(sash.state.b.hp, 1);
  assert.equal(sash.state.b.item, "");
  const sitrus = runTurn(battle({ moves: [move({ power: 140 })], stats: fast }, { item: "Sitrus Berry", moves: [splash] }), 0, 0, seq([], 0.99));
  assert.ok(sitrus.events.some((e) => e.kind === "held" && e.effect === "berry"));
  const wisp = status("willowisp", "Will-O-Wisp", { type: "fire", status: "brn" });
  const lum = runTurn(battle({ moves: [wisp], stats: fast }, { item: "Lum Berry", moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(lum.state.b.status, null);
  assert.equal(lum.state.b.item, "");
});

test("Heavy-Duty Boots skip hazards; an Air Balloon floats until it's hit", () => {
  const st = createTeamBattle(team({ moves: splashOnly }), team({ moves: splashOnly }, { item: "Heavy-Duty Boots" }));
  st.field.b.stealthRock = true;
  assert.equal(runTurn(st, 0, { switchTo: 0 }, seq([], 0.99)).state.b.hp, 150);
  const balloon = battle({ moves: [earthquake, move({})], stats: fast }, { item: "Air Balloon", hp: 999, maxHp: 999, moves: [splash] });
  const t1 = runTurn(balloon, 0, 0, seq([], 0.99));
  assert.ok(t1.events.some((e) => e.kind === "no-effect" && e.side === "b"));
  const t2 = runTurn(t1.state, 1, 0, seq([], 0.99));
  assert.equal(t2.state.b.item, "");
  assert.ok(runTurn(t2.state, 0, 0, seq([], 0.99)).events.some((e) => e.kind === "damage" && e.side === "b" && e.amount > 0));
});

test("Assault Vest blocks status moves; Eviolite only helps a Pokémon that can still evolve", () => {
  const vest = runTurn(battle({ item: "Assault Vest", moves: [splash] }, { moves: [splash] }), 0, 0, seq([], 0.99));
  assert.ok(vest.events.some((e) => e.kind === "effect" && e.effect === "vest-block"));
  const ember = move({ id: "ember", name: "Ember", type: "fire", category: "special", power: 40 });
  const d = (b: Partial<BattlePokemon>) => {
    const st = battle({}, b);
    return calcDamage(st.a, st.b, { ...ember, ppLeft: 1 }, seq([0.99]), false);
  };
  assert.ok(d({ item: "Eviolite", nfe: true }) < d({ item: "Eviolite" }));
});

test("Knock Off hits harder and removes the item; Trick swaps items", () => {
  const knock = move({ id: "knockoff", name: "Knock Off", type: "dark", power: 65, flags: ["contact"] });
  const r = runTurn(battle({ moves: [knock], stats: fast }, { item: "Leftovers", hp: 999, maxHp: 999, moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(r.state.b.item, "");
  assert.ok(r.events.some((e) => e.kind === "held" && e.effect === "knocked-off"));
  const trick = status("trick", "Trick", { type: "psychic" });
  const t = runTurn(battle({ item: "Choice Scarf", moves: [trick] }, { item: "Leftovers", moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(t.state.a.item, "leftovers");
  assert.equal(t.state.b.item, "choicescarf");
});

test("Weakness Policy, Rocky Helmet and Red Card react to hits", () => {
  const water = move({ id: "surf", name: "Surf", type: "water", category: "special", power: 90 });
  const wp = runTurn(battle({ moves: [water] }, { types: ["fire"], item: "Weakness Policy", hp: 999, maxHp: 999, moves: [splash] }), 0, 0, seq([], 0.99));
  assert.deepEqual([wp.state.b.boosts.atk, wp.state.b.boosts.spa], [2, 2]);
  const helmet = runTurn(battle({ moves: [move({ flags: ["contact"] })], stats: fast }, { item: "Rocky Helmet", hp: 999, maxHp: 999, moves: [splash] }), 0, 0, seq([], 0.99));
  assert.equal(helmet.state.a.hp, 150 - 25);
  const card = runTurn(createTeamBattle(team({ stats: fast }, {}), team({ item: "Red Card", hp: 999, maxHp: 999, moves: splashOnly })), 0, 0, seq([], 0.99));
  assert.ok(card.events.some((e) => e.kind === "switch" && e.side === "a" && e.dragged));
});

test("Tailwind doubles the side's Speed; Shed Tail passes a Substitute", () => {
  const wind = status("tailwind", "Tailwind", { type: "flying", flags: ["wind"] });
  const st = battle({ moves: [wind, move({})], stats: { ...slow, spe: 60 } }, { hp: 999, maxHp: 999 });
  const t1 = runTurn(st, 0, 0, seq([], 0.99));
  assert.equal(t1.state.field.a.tailwind, 3);
  assert.deepEqual(turnOrder(t1.state, t1.state.a.moves[1], t1.state.b.moves[0], seq([])), ["a", "b"]);
  const tail = status("shedtail", "Shed Tail");
  const shed = runTurn(createTeamBattle(team({ moves: [tail] }, {}), team({ moves: splashOnly })), 0, 0, seq([], 0.99));
  assert.equal(shed.state.a.hp, 75);
  const next = resolvePivot(shed.state, 0, seq([], 0.99));
  assert.equal(next.state.a.substitute, 37);
});
