import { effectiveness } from "../typeChart.ts";
import type { BattleMove, BattlePokemon, Boosts, StatName, Status } from "./types.ts";

/**
 * 1v1 battle engine with the standard (gen 5+) rules: move priority, then
 * speed (paralysis halves it, ties are random); the damage formula with the
 * 85–100% roll, STAB, type effectiveness, critical hits and burn; accuracy;
 * stat stages; burn, paralysis, poison, bad poison and sleep with their type
 * immunities; flinching, confusion, Protect, Leech Seed, moves that lock the
 * user in (Outrage) or need a recharge turn (Hyper Beam); drain, recoil,
 * healing, multi-hit, fixed-damage moves, chance effects and PP. Abilities and
 * items are not modeled; other effects (Substitute, hazards, weather, Taunt...)
 * just fail. Switching doesn't exist in 1v1.
 *
 * Pure: `runTurn` returns a new state plus the events that happened, in
 * order, for the screen to play back.
 */

export type Side = "a" | "b";
export type Rng = () => number;

export interface FighterMove extends BattleMove {
  ppLeft: number;
}

export interface Fighter {
  name: string;
  dexId: number;
  level: number;
  types: string[];
  hp: number;
  maxHp: number;
  stats: Record<StatName, number>;
  boosts: Record<StatName, number>;
  status: Status | null;
  /** Turns of sleep left. */
  sleepTurns: number;
  /** Bad poison counter (damage = n/16). */
  toxicTurns: number;
  /** Turns of confusion left (0 = not confused). */
  confusion: number;
  /** Locked into a move (Outrage...): its index and the turns left after this one. */
  locked: { index: number; turnsLeft: number } | null;
  mustRecharge: boolean;
  seeded: boolean;
  /** Successful Protects in a row (each one halves... thirds the next chance). */
  protectStreak: number;
  /** Per-turn flags. */
  protected: boolean;
  flinched: boolean;
  moves: FighterMove[];
}

export interface BattleState {
  turn: number;
  a: Fighter;
  b: Fighter;
  winner: Side | null;
}

export type BattleEvent =
  | { kind: "move"; side: Side; move: string }
  | { kind: "miss"; side: Side }
  | { kind: "damage"; side: Side; amount: number; hp: number; effectiveness: number; crit: boolean; hits: number }
  | { kind: "no-effect"; side: Side }
  | { kind: "fail"; side: Side }
  | { kind: "heal"; side: Side; amount: number; hp: number }
  | { kind: "recoil"; side: Side; amount: number; hp: number }
  | { kind: "boost"; side: Side; stat: StatName; change: number; requested: number }
  | { kind: "status"; side: Side; status: Status }
  | { kind: "cant-move"; side: Side; reason: "par" | "slp" | "flinch" | "recharge" }
  | { kind: "confused"; side: Side; fatigue: boolean }
  | { kind: "confusion"; side: Side }
  | { kind: "confusion-end"; side: Side }
  | { kind: "self-hit"; side: Side; amount: number; hp: number }
  | { kind: "protect"; side: Side }
  | { kind: "protected"; side: Side }
  | { kind: "seeded"; side: Side }
  | { kind: "leech"; side: Side; amount: number; hp: number; healerHp: number }
  | { kind: "wake"; side: Side }
  | { kind: "residual"; side: Side; status: Status; amount: number; hp: number }
  | { kind: "faint"; side: Side };

const STATS: StatName[] = ["atk", "def", "spa", "spd", "spe"];
const STAB = 1.5;
const CRIT_MULTIPLIER = 1.5;
/** Variable-power moves (Low Kick, Gyro Ball...) use this base power. */
const FALLBACK_POWER = 60;
const PARALYSIS_SKIP = 0.25;
const CONFUSION_SELF_HIT = 1 / 3;
const STRUGGLE: FighterMove = {
  id: "struggle",
  name: "Struggle",
  type: "typeless",
  power: 50,
  category: "physical",
  accuracy: 1,
  priority: 0,
  pp: 1,
  ppLeft: 1,
};

const CONFUSION_HIT: FighterMove = { ...STRUGGLE, id: "confusion", name: "Confusion", power: 40 };

export const other = (side: Side): Side => (side === "a" ? "b" : "a");

/** Stage multiplier: +1 = ×1.5, +2 = ×2, −1 = ×2/3 ... */
export const stageMultiplier = (stage: number) => (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage));

export function createFighter(p: BattlePokemon): Fighter {
  return {
    name: p.name,
    dexId: p.dexId,
    level: p.level,
    types: p.types,
    hp: p.maxHp,
    maxHp: p.maxHp,
    stats: { ...p.stats },
    boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    status: null,
    sleepTurns: 0,
    toxicTurns: 0,
    confusion: 0,
    locked: null,
    mustRecharge: false,
    seeded: false,
    protectStreak: 0,
    protected: false,
    flinched: false,
    moves: p.moves.map((m) => ({ ...m, ppLeft: m.pp })),
  };
}

export const createBattle = (a: BattlePokemon, b: BattlePokemon): BattleState => ({
  turn: 1,
  a: createFighter(a),
  b: createFighter(b),
  winner: null,
});

export const effectiveSpeed = (f: Fighter) => f.stats.spe * stageMultiplier(f.boosts.spe) * (f.status === "par" ? 0.5 : 1);

/** The move that will actually be used (Struggle when out of PP). */
export function resolveMove(f: Fighter, index: number): FighterMove {
  const chosen = f.moves[index];
  if (chosen && chosen.ppLeft > 0) return chosen;
  return f.moves.find((m) => m.ppLeft > 0) ?? STRUGGLE;
}

/** Who acts first: higher priority, then higher speed, ties at random. */
export function turnOrder(state: BattleState, moveA: FighterMove, moveB: FighterMove, rng: Rng): Side[] {
  if (moveA.priority !== moveB.priority) return moveA.priority > moveB.priority ? ["a", "b"] : ["b", "a"];
  const sa = effectiveSpeed(state.a);
  const sb = effectiveSpeed(state.b);
  if (sa !== sb) return sa > sb ? ["a", "b"] : ["b", "a"];
  return rng() < 0.5 ? ["a", "b"] : ["b", "a"];
}

const critChance = (ratio = 1) => (ratio >= 4 ? 1 : ratio === 3 ? 0.5 : ratio === 2 ? 1 / 8 : 1 / 24);

/** Damage of one hit (gen 5+ formula, applied in the games' order with floors). */
export function calcDamage(user: Fighter, target: Fighter, move: FighterMove, rng: Rng, crit: boolean): number {
  const physical = move.category === "physical";
  const atkStat: StatName = physical ? "atk" : "spa";
  const defStat: StatName = physical ? "def" : "spd";
  // Critical hits ignore the attacker's drops and the defender's raises.
  const atkStage = crit ? Math.max(0, user.boosts[atkStat]) : user.boosts[atkStat];
  const defStage = crit ? Math.min(0, target.boosts[defStat]) : target.boosts[defStat];
  const attack = Math.max(1, Math.floor(user.stats[atkStat] * stageMultiplier(atkStage)));
  const defense = Math.max(1, Math.floor(target.stats[defStat] * stageMultiplier(defStage)));
  const power = move.power > 0 ? move.power : FALLBACK_POWER;

  let damage = Math.floor(Math.floor((Math.floor((2 * user.level) / 5 + 2) * power * attack) / defense) / 50) + 2;
  if (crit) damage = Math.floor(damage * CRIT_MULTIPLIER);
  damage = Math.floor((damage * (85 + Math.floor(rng() * 16))) / 100);
  if (user.types.includes(move.type)) damage = Math.floor(damage * STAB);
  damage = Math.floor(damage * effectiveness(move.type, target.types));
  if (physical && user.status === "brn") damage = Math.floor(damage / 2);
  return Math.max(1, damage);
}

function hitCount(move: FighterMove, rng: Rng): number {
  if (typeof move.multihit === "number") return move.multihit;
  if (!move.multihit) return 1;
  const [min, max] = move.multihit;
  if (min === 2 && max === 5) {
    // 2 and 3 hits: 35% each; 4 and 5 hits: 15% each.
    const r = rng();
    return r < 0.35 ? 2 : r < 0.7 ? 3 : r < 0.85 ? 4 : 5;
  }
  return min + Math.floor(rng() * (max - min + 1));
}

const IMMUNE: Record<Status, string[]> = {
  brn: ["fire"],
  par: ["electric"],
  psn: ["poison", "steel"],
  tox: ["poison", "steel"],
  slp: [],
};

/** Powder and spore moves don't affect Grass types (gen 6+). */
const POWDER = new Set(["sleeppowder", "stunspore", "poisonpowder", "spore", "cottonspore", "ragepowder", "magicpowder", "powder"]);

/** Status moves that a type is immune to by the move itself (not the status). */
export function moveImmune(move: Pick<FighterMove, "id">, target: Pick<Fighter, "types">): boolean {
  if (POWDER.has(move.id) && target.types.includes("grass")) return true;
  return move.id === "thunderwave" && target.types.includes("ground");
}

/** Whether `status` could be inflicted on the target right now. */
export function canInflict(status: string, target: Pick<Fighter, "types" | "status" | "hp">): boolean {
  return isStatus(status) && target.status === null && target.hp > 0 && !IMMUNE[status].some((t) => target.types.includes(t));
}

const isStatus = (s: string | undefined): s is Status => s === "brn" || s === "par" || s === "psn" || s === "tox" || s === "slp";

/** Inflicts a status if possible. `announceFailure` for status moves (not chance effects). */
function tryStatus(st: BattleState, side: Side, status: string, rng: Rng, events: BattleEvent[], announceFailure: boolean) {
  const target = st[side];
  if (!isStatus(status) || !canInflict(status, target)) {
    if (announceFailure) events.push({ kind: "fail", side: other(side) });
    return;
  }
  target.status = status;
  if (status === "slp") target.sleepTurns = 1 + Math.floor(rng() * 3);
  if (status === "tox") target.toxicTurns = 0;
  events.push({ kind: "status", side, status });
}

function applyBoosts(st: BattleState, side: Side, boosts: Boosts, events: BattleEvent[]) {
  const f = st[side];
  for (const stat of STATS) {
    const requested = boosts[stat];
    if (!requested) continue;
    const before = f.boosts[stat];
    f.boosts[stat] = Math.max(-6, Math.min(6, before + requested));
    events.push({ kind: "boost", side, stat, change: f.boosts[stat] - before, requested });
  }
}

function heal(st: BattleState, side: Side, amount: number, events: BattleEvent[]) {
  const f = st[side];
  const healed = Math.min(f.maxHp - f.hp, Math.max(1, amount));
  if (healed <= 0) return;
  f.hp += healed;
  events.push({ kind: "heal", side, amount: healed, hp: f.hp });
}

/** Sleep / paralysis checks. Returns false if the Pokémon can't move this turn. */
function canMove(st: BattleState, side: Side, rng: Rng, events: BattleEvent[]): boolean {
  const f = st[side];
  if (f.status === "slp") {
    if (f.sleepTurns <= 0) {
      f.status = null;
      events.push({ kind: "wake", side });
    } else {
      f.sleepTurns--;
      events.push({ kind: "cant-move", side, reason: "slp" });
      return false;
    }
  }
  if (f.status === "par" && rng() < PARALYSIS_SKIP) {
    events.push({ kind: "cant-move", side, reason: "par" });
    return false;
  }
  return true;
}

function performMove(st: BattleState, side: Side, move: FighterMove, rng: Rng, events: BattleEvent[], foeMovesLater: boolean) {
  const user = st[side];
  const foeSide = other(side);
  const foe = st[foeSide];
  if (user.mustRecharge) {
    user.mustRecharge = false;
    events.push({ kind: "cant-move", side, reason: "recharge" });
    return;
  }
  if (!canMove(st, side, rng, events)) {
    user.locked = null;
    return;
  }
  if (user.flinched) {
    user.locked = null;
    events.push({ kind: "cant-move", side, reason: "flinch" });
    return;
  }
  if (user.confusion > 0) {
    user.confusion--;
    if (user.confusion === 0) {
      events.push({ kind: "confusion-end", side });
    } else {
      events.push({ kind: "confusion", side });
      if (rng() < CONFUSION_SELF_HIT) {
        // 40-power typeless physical hit on itself, no crit.
        const amount = Math.min(user.hp, calcDamage(user, user, CONFUSION_HIT, rng, false));
        user.hp -= amount;
        user.locked = null;
        events.push({ kind: "self-hit", side, amount, hp: user.hp });
        return;
      }
    }
  }

  // PP is only spent on the first turn of a locked move.
  const continuing = user.locked !== null;
  if (move !== STRUGGLE && !continuing) move.ppLeft--;
  if (move.volatile !== "protect") user.protectStreak = 0;
  events.push({ kind: "move", side, move: move.name });

  // Focus Punch fails if the user was hit earlier this turn.
  if (move.id === "focuspunch" && events.some((e) => e.kind === "damage" && e.side === side)) {
    events.push({ kind: "fail", side });
    return;
  }

  const targetsFoe = move.category !== "status" || move.fixedDamage !== undefined || move.status || move.volatile === "confusion" ||
    move.volatile === "leechseed" || move.boosts?.target === "foe";
  if (targetsFoe && foe.protected) {
    events.push({ kind: "protected", side: foeSide });
    user.locked = null;
    return;
  }

  if (move.accuracy < 1 && rng() >= move.accuracy) {
    events.push({ kind: "miss", side });
    user.locked = null;
    return;
  }

  const damaging = move.category !== "status" || move.fixedDamage !== undefined;
  if (!damaging && targetsFoe && moveImmune(move, foe)) {
    events.push({ kind: "no-effect", side: foeSide });
    return;
  }
  if (!damaging) {
    if (move.heal) {
      if (user.hp >= user.maxHp) events.push({ kind: "fail", side });
      else heal(st, side, Math.floor((user.maxHp * move.heal[0]) / move.heal[1]), events);
    } else if (move.boosts) {
      applyBoosts(st, move.boosts.target === "self" ? side : foeSide, move.boosts.stats, events);
    } else if (move.status) {
      tryStatus(st, foeSide, move.status, rng, events, true);
    } else if (move.volatile === "protect") {
      // Each Protect in a row is three times less likely to work.
      if (rng() < 1 / 3 ** user.protectStreak) {
        user.protected = true;
        user.protectStreak++;
        events.push({ kind: "protect", side });
      } else {
        user.protectStreak = 0;
        events.push({ kind: "fail", side });
      }
    } else if (move.volatile === "confusion") {
      if (foe.confusion > 0) events.push({ kind: "fail", side });
      else confuse(foe, foeSide, rng, events, false);
    } else if (move.volatile === "leechseed") {
      if (foe.types.includes("grass")) events.push({ kind: "no-effect", side: foeSide });
      else if (foe.seeded) events.push({ kind: "fail", side });
      else {
        foe.seeded = true;
        events.push({ kind: "seeded", side: foeSide });
      }
    } else {
      events.push({ kind: "fail", side });
    }
    return;
  }

  const eff = move.type === "typeless" ? 1 : effectiveness(move.type, foe.types);
  if (eff === 0) {
    events.push({ kind: "no-effect", side: foeSide });
    user.locked = null;
    return;
  }

  const hits = hitCount(move, rng);
  let total = 0;
  let crit = false;
  let landed = 0;
  for (let i = 0; i < hits && foe.hp > 0; i++) {
    let damage: number;
    if (move.fixedDamage !== undefined) {
      damage = move.fixedDamage === "level" ? user.level : move.fixedDamage;
    } else {
      const isCrit = rng() < critChance(move.critRatio);
      crit ||= isCrit;
      damage = calcDamage(user, foe, move, rng, isCrit);
    }
    damage = Math.min(damage, foe.hp);
    foe.hp -= damage;
    total += damage;
    landed++;
  }
  events.push({
    kind: "damage",
    side: foeSide,
    amount: total,
    hp: foe.hp,
    effectiveness: move.fixedDamage !== undefined ? 1 : eff,
    crit,
    hits: landed,
  });

  if (move.drain) heal(st, side, Math.floor((total * move.drain[0]) / move.drain[1]), events);
  const recoil =
    move === STRUGGLE ? Math.floor(user.maxHp / 4) : move.recoil ? Math.floor((total * move.recoil[0]) / move.recoil[1]) : 0;
  if (recoil > 0 || move.recoil) {
    const amount = Math.min(user.hp, Math.max(1, recoil));
    user.hp -= amount;
    events.push({ kind: "recoil", side, amount, hp: user.hp });
  }
  if (move.selfBoosts && user.hp > 0) applyBoosts(st, side, move.selfBoosts, events);

  for (const sec of move.secondary ?? []) {
    if (rng() * 100 >= sec.chance) continue;
    if (sec.status && foe.hp > 0) tryStatus(st, foeSide, sec.status, rng, events, false);
    if (sec.boosts && foe.hp > 0) applyBoosts(st, foeSide, sec.boosts, events);
    if (sec.selfBoosts && user.hp > 0) applyBoosts(st, side, sec.selfBoosts, events);
    // Flinching only matters if the foe hasn't moved yet this turn.
    if (sec.volatile === "flinch" && foeMovesLater) foe.flinched = true;
    if (sec.volatile === "confusion" && foe.hp > 0 && foe.confusion === 0) confuse(foe, foeSide, rng, events, false);
  }

  if (move.recharge) user.mustRecharge = true;
  if (move.locked) {
    if (!user.locked) user.locked = { index: user.moves.indexOf(move), turnsLeft: 1 + Math.floor(rng() * 2) };
    else user.locked.turnsLeft--;
    if (user.locked.turnsLeft <= 0) {
      user.locked = null;
      if (user.confusion === 0 && user.hp > 0) confuse(user, side, rng, events, true);
    }
  }
}

function confuse(f: Fighter, side: Side, rng: Rng, events: BattleEvent[], fatigue: boolean) {
  // Lasts 1-4 turns after this one (the counter ticks before each move).
  f.confusion = 2 + Math.floor(rng() * 4);
  events.push({ kind: "confused", side, fatigue });
}

/** Burn 1/16, poison 1/8, bad poison n/16, Leech Seed 1/8 at the end of the turn. */
function residual(st: BattleState, side: Side, events: BattleEvent[]) {
  const f = st[side];
  const healer = st[other(side)];
  if (f.hp > 0 && f.seeded && healer.hp > 0) {
    const amount = Math.min(f.hp, Math.max(1, Math.floor(f.maxHp / 8)));
    f.hp -= amount;
    healer.hp = Math.min(healer.maxHp, healer.hp + amount);
    events.push({ kind: "leech", side, amount, hp: f.hp, healerHp: healer.hp });
  }
  if (f.hp <= 0 || !f.status || f.status === "par" || f.status === "slp") return;
  let fraction = f.status === "brn" ? 1 / 16 : f.status === "psn" ? 1 / 8 : 0;
  if (f.status === "tox") {
    f.toxicTurns++;
    fraction = f.toxicTurns / 16;
  }
  const amount = Math.min(f.hp, Math.max(1, Math.floor(f.maxHp * fraction)));
  f.hp -= amount;
  events.push({ kind: "residual", side, status: f.status, amount, hp: f.hp });
}

/** Records faints; returns true if the battle is over. */
function checkFaints(st: BattleState, events: BattleEvent[], order: Side[]): boolean {
  for (const side of order) {
    if (st[side].hp <= 0 && !events.some((e) => e.kind === "faint" && e.side === side)) {
      events.push({ kind: "faint", side });
      // The one still standing wins; if both fall, the one that fell last.
      st.winner = st[other(side)].hp > 0 ? other(side) : side;
    }
  }
  return st.winner !== null;
}

/**
 * Plays one turn: both sides use the move at the given index (Struggle if out
 * of PP). Doesn't mutate `state`.
 */
export function runTurn(state: BattleState, choiceA: number, choiceB: number, rng: Rng = Math.random): { state: BattleState; events: BattleEvent[] } {
  const st: BattleState = structuredClone(state);
  const events: BattleEvent[] = [];
  if (st.winner) return { state: st, events };

  for (const f of [st.a, st.b]) {
    f.protected = false;
    f.flinched = false;
  }
  // A locked-in Pokémon repeats its move whatever was chosen.
  const pick = (f: Fighter, choice: number) => (f.locked ? f.moves[f.locked.index] : resolveMove(f, choice));
  const moves = { a: pick(st.a, choiceA), b: pick(st.b, choiceB) };
  const order = turnOrder(st, moves.a, moves.b, rng);
  for (const [i, side] of order.entries()) {
    if (st[side].hp <= 0) continue;
    performMove(st, side, moves[side], rng, events, i === 0);
    if (checkFaints(st, events, [other(side), side])) return { state: st, events };
  }
  for (const side of order) residual(st, side, events);
  checkFaints(st, events, order);
  st.turn++;
  return { state: st, events };
}
