import { expectedMoveDamage } from "./battle/ai.ts";
import { canInflict, createFighter, effectiveSpeed, type Fighter, type FighterMove, moveImmune, priorityOf } from "./battle/engine.ts";
import type { BattleMove, BattlePokemon } from "./battle/types.ts";
import { effectiveness } from "./typeChart.ts";

/**
 * Battle state contract shared by the battle engine, the ML dataset generator
 * and the win-probability client. Any engine that can produce a
 * BattleSnapshot gets win predictions; the features below are computed from
 * it in one place (here), so training and serving can't drift apart.
 */

export interface MoveInfo {
  type: string;
  /** 0 for status moves. */
  power: number;
  category: "physical" | "special" | "status";
  /** 0..1 (1 for moves that never miss). */
  accuracy: number;
  priority: number;
}

export interface Combatant {
  dexId: number;
  level: number;
  types: string[];
  hp: number;
  maxHp: number;
  /** Actual (not base) stats. */
  stats: { atk: number; def: number; spa: number; spd: number; spe: number };
  /** Non-volatile status ("brn", "par", "slp", "psn", "tox", "frz") or null. */
  status: string | null;
  moves: MoveInfo[];
}

/** 1v1 state from side A's point of view. */
export interface BattleSnapshot {
  turn: number;
  a: Combatant;
  b: Combatant;
}

/** Turns-to-KO is capped so "can't hurt it" stays a finite number. */
export const MAX_TURNS = 20;
const STAB = 1.5;
/** Damage shares above this (several KOs' worth) carry no extra information. */
const MAX_DAMAGE_SHARE = 3;
/** Mean of the 0.85..1.00 damage roll. */
const AVERAGE_ROLL = 0.925;

/**
 * Expected damage of one move (gen 5+ formula, average roll, no crits),
 * including accuracy, STAB, type effectiveness, burn and paralysis-free speed.
 */
export function expectedDamage(move: MoveInfo, attacker: Combatant, defender: Combatant): number {
  if (move.category === "status" || move.power <= 0) return 0;
  const physical = move.category === "physical";
  const attack = physical ? attacker.stats.atk : attacker.stats.spa;
  const defense = Math.max(1, physical ? defender.stats.def : defender.stats.spd);
  const base = Math.floor(Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * move.power * attack) / defense) / 50) + 2;
  const stab = attacker.types.includes(move.type) ? STAB : 1;
  const burn = physical && attacker.status === "brn" ? 0.5 : 1;
  return base * AVERAGE_ROLL * stab * effectiveness(move.type, defender.types) * burn * move.accuracy;
}

/**
 * The app's battle sets carry the ability and held item: for them, damage,
 * speed and priority come from the battle engine itself (Huge Power, Choice
 * Scarf, Levitate...). Plain combatants (the Showdown datasets) use the
 * formula above.
 */
const fullSet = (c: Combatant): c is BattlePokemon => typeof (c as BattlePokemon).ability === "string";

const fighters = new WeakMap<Combatant, Fighter>();
/** The combatant as an engine fighter, in its current HP and status. */
function fighter(c: BattlePokemon): Fighter {
  let f = fighters.get(c);
  if (!f) {
    f = createFighter(c);
    fighters.set(c, f);
  }
  f.hp = c.hp;
  f.status = (c.status as Fighter["status"]) ?? null;
  return f;
}

/** Expected damage of one of the attacker's moves (engine rules for full sets). */
function moveDamage(move: MoveInfo, attacker: Combatant, defender: Combatant): number {
  if (fullSet(attacker) && fullSet(defender)) {
    const me = fighter(attacker);
    const m = me.moves[attacker.moves.indexOf(move as BattleMove)];
    return m ? expectedMoveDamage(m, me, fighter(defender)) : 0;
  }
  return expectedDamage(move, attacker, defender);
}

/** The attacker's best move against the defender (by expected damage). */
export function bestMove(attacker: Combatant, defender: Combatant) {
  let best: { move: MoveInfo | null; damage: number } = { move: null, damage: 0 };
  for (const move of attacker.moves) {
    const damage = moveDamage(move, attacker, defender);
    if (damage > best.damage) best = { move, damage };
  }
  return best;
}

/** Turns the attacker needs to KO the defender at its current HP (capped). */
export function turnsToKo(attacker: Combatant, defender: Combatant): number {
  const { damage } = bestMove(attacker, defender);
  if (damage <= 0) return MAX_TURNS;
  return Math.min(MAX_TURNS, Math.ceil(defender.hp / damage));
}

/** Effective speed for turn order (paralysis halves it; full sets add abilities and items). */
const speedOf = (c: Combatant) => (fullSet(c) ? effectiveSpeed(fighter(c)) : c.stats.spe * (c.status === "par" ? 0.5 : 1));

const priority = (c: Combatant, move: MoveInfo | null) =>
  !move ? 0 : fullSet(c) ? priorityOf(fighter(c), move as FighterMove) : move.priority;

/** 1 if A moves first with its best move, 0 if B does, 0.5 on a speed tie. */
export function movesFirst(snapshot: BattleSnapshot): number {
  const pa = priority(snapshot.a, bestMove(snapshot.a, snapshot.b).move);
  const pb = priority(snapshot.b, bestMove(snapshot.b, snapshot.a).move);
  if (pa !== pb) return pa > pb ? 1 : 0;
  const sa = speedOf(snapshot.a);
  const sb = speedOf(snapshot.b);
  return sa === sb ? 0.5 : sa > sb ? 1 : 0;
}

const bestEffectiveness = (attacker: Combatant, defender: Combatant) =>
  Math.max(0, ...attacker.moves.filter((m) => m.category !== "status" && m.power > 0).map((m) => effectiveness(m.type, defender.types)));

const statTotal = (c: Combatant) => c.maxHp + c.stats.atk + c.stats.def + c.stats.spa + c.stats.spd + c.stats.spe;
const log2 = (x: number) => Math.log2(Math.max(x, 1 / 8));

/** Feature order the model is trained with. Append only; never reorder. */
export const FEATURE_NAMES = [
  "ttk_a",
  "ttk_b",
  "ttk_diff",
  "moves_first",
  "race_win",
  "hp_a",
  "hp_b",
  "hp_diff",
  "eff_a",
  "eff_b",
  "eff_diff",
  "stat_ratio",
  "level_diff",
  "status_a",
  "status_b",
  "turn",
  "dmg_a",
  "dmg_b",
  "dmg_diff",
  "ohko_a",
  "ohko_b",
  "speed_ratio",
  "acc_a",
  "acc_b",
  "prio_a",
  "prio_b",
  "heal_a",
  "heal_b",
  "setup_a",
  "setup_b",
  "inflict_a",
  "inflict_b",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Move details beyond MoveInfo, present when moves come from the battle sets. */
const extra = (m: MoveInfo) => m as MoveInfo & Partial<BattleMove>;

/** Strategy flags from the moveset: things the damage race doesn't see. */
function moveFlags(me: Combatant, foe: Combatant) {
  const best = bestMove(me, foe).move;
  const moves = me.moves.map(extra);
  return {
    // How reliable the best hit is.
    acc: best ? best.accuracy : 0,
    // A damaging priority move (finishes faster foes).
    prio: moves.some((m) => m.category !== "status" && m.power > 0 && m.priority > 0) ? 1 : 0,
    // Recovers HP (Recover, Rest, drain, Leech Seed).
    heal: moves.some((m) => m.heal || m.drain || m.id === "rest" || m.volatile === "leechseed") ? 1 : 0,
    // Raises its own stats.
    setup: moves.some((m) => m.boosts?.target === "self" && Object.values(m.boosts.stats).some((v) => (v ?? 0) > 0)) ? 1 : 0,
    // A status move that would work on this foe.
    inflict: moves.some(
      (m) => m.category === "status" && m.status && !moveImmune({ id: m.id ?? "" }, foe) && canInflict(m.status, { ...foe, status: null }),
    )
      ? 1
      : 0,
  };
}

/**
 * Features from A's point of view. Most are differences (A − B) so swapping
 * the sides negates them; `swapSides` + flipped label is used to augment data.
 */
export function battleFeatures(s: BattleSnapshot): Record<FeatureName, number> {
  const ttkA = turnsToKo(s.a, s.b);
  const ttkB = turnsToKo(s.b, s.a);
  const first = movesFirst(s);
  const hpA = s.a.hp / s.a.maxHp;
  const hpB = s.b.hp / s.b.maxHp;
  const effA = log2(bestEffectiveness(s.a, s.b));
  const effB = log2(bestEffectiveness(s.b, s.a));
  // Continuous version of turns-to-KO: share of the foe's current HP the best
  // move takes (turns-to-KO rounds 51% and 99% to the same "2 turns").
  const dmgA = Math.min(MAX_DAMAGE_SHARE, bestMove(s.a, s.b).damage / Math.max(1, s.b.hp));
  const dmgB = Math.min(MAX_DAMAGE_SHARE, bestMove(s.b, s.a).damage / Math.max(1, s.a.hp));
  const flagsA = moveFlags(s.a, s.b);
  const flagsB = moveFlags(s.b, s.a);
  // Who wins the damage race if both just use their best move every turn.
  const race = ttkA < ttkB ? 1 : ttkA > ttkB ? 0 : first;
  return {
    ttk_a: ttkA,
    ttk_b: ttkB,
    ttk_diff: ttkB - ttkA,
    moves_first: first,
    race_win: race,
    hp_a: hpA,
    hp_b: hpB,
    hp_diff: hpA - hpB,
    eff_a: effA,
    eff_b: effB,
    eff_diff: effA - effB,
    stat_ratio: Math.log(statTotal(s.a) / statTotal(s.b)),
    level_diff: s.a.level - s.b.level,
    status_a: s.a.status ? 1 : 0,
    status_b: s.b.status ? 1 : 0,
    turn: s.turn,
    dmg_a: dmgA,
    dmg_b: dmgB,
    dmg_diff: dmgA - dmgB,
    ohko_a: dmgA >= 1 ? 1 : 0,
    ohko_b: dmgB >= 1 ? 1 : 0,
    speed_ratio: Math.log(Math.max(1, speedOf(s.a)) / Math.max(1, speedOf(s.b))),
    acc_a: flagsA.acc,
    acc_b: flagsB.acc,
    prio_a: flagsA.prio,
    prio_b: flagsB.prio,
    heal_a: flagsA.heal,
    heal_b: flagsB.heal,
    setup_a: flagsA.setup,
    setup_b: flagsB.setup,
    inflict_a: flagsA.inflict,
    inflict_b: flagsB.inflict,
  };
}

/** Same state seen from B's side. */
export const swapSides = (s: BattleSnapshot): BattleSnapshot => ({ turn: s.turn, a: s.b, b: s.a });

/** Features as an array in FEATURE_NAMES order. */
export const featureVector = (s: BattleSnapshot) => {
  const f = battleFeatures(s);
  return FEATURE_NAMES.map((name) => f[name]);
};
