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

/** The attacker's best move against the defender (by expected damage). */
export function bestMove(attacker: Combatant, defender: Combatant) {
  let best: { move: MoveInfo | null; damage: number } = { move: null, damage: 0 };
  for (const move of attacker.moves) {
    const damage = expectedDamage(move, attacker, defender);
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

/** Effective speed for turn order (paralysis halves it). */
const speedOf = (c: Combatant) => c.stats.spe * (c.status === "par" ? 0.5 : 1);

/** 1 if A moves first with its best move, 0 if B does, 0.5 on a speed tie. */
export function movesFirst(snapshot: BattleSnapshot): number {
  const pa = bestMove(snapshot.a, snapshot.b).move?.priority ?? 0;
  const pb = bestMove(snapshot.b, snapshot.a).move?.priority ?? 0;
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
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

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
  };
}

/** Same state seen from B's side. */
export const swapSides = (s: BattleSnapshot): BattleSnapshot => ({ turn: s.turn, a: s.b, b: s.a });

/** Features as an array in FEATURE_NAMES order. */
export const featureVector = (s: BattleSnapshot) => {
  const f = battleFeatures(s);
  return FEATURE_NAMES.map((name) => f[name]);
};
