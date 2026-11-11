import { effectiveness } from "../typeChart.ts";
import { abilityBlock, moveType, statusBlocked } from "./abilities.ts";
import { CHOICE } from "./items.ts";
import {
  type BattleState,
  bypassesSub,
  calcDamage,
  CHARGE,
  canInflict,
  COUNTERS,
  canSwitch,
  type Choice,
  effectiveSpeed,
  effectivenessAgainst,
  type Fighter,
  FIRST_TURN_ONLY,
  type FighterMove,
  moveImmune,
  needsReplacement,
  powerAgainst,
  priorityOf,
  resolvePivot,
  type Rng,
  SELF_KO,
  type Side,
  switchIn,
  type Weather,
  weatherAccuracy,
  weatherFactor,
  weatherOf as engineWeather,
} from "./engine.ts";
import type { Status } from "./types.ts";

const isStatusName = (s: string): s is Status => ["brn", "par", "psn", "tox", "slp", "frz"].includes(s);

/** Chance of a random move instead of the best one, so the foe isn't predictable. */
const RANDOMNESS = 0.15;
/** Switch out when a bench Pokémon's matchup is this much better (and the current one is losing). */
const SWITCH_MARGIN = 0.6;
const SWITCH_CHANCE = 0.7;
/** Same stand-in power the engine uses for variable-power moves. */
const FALLBACK_POWER = 60;

const isAttack = (m: FighterMove) => m.category !== "status" || m.fixedDamage !== undefined;

/** rng value that gives the 92% roll, about the average of 85-100%. */
const AVERAGE_ROLL = 0.47;

/** Average number of hits (2-5 hit moves: 3.1, or 5 with Skill Link). */
const expectedHits = (m: FighterMove, me: Fighter) =>
  typeof m.multihit === "number" ? m.multihit : !m.multihit ? 1 : me.ability === "skilllink" ? m.multihit[1] : m.multihit[0] === 2 && m.multihit[1] === 5 ? 3.1 : (m.multihit[0] + m.multihit[1]) / 2;

/** What the AI knows beyond the two Pokémon out: the rest of the battle and which side it plays. */
export interface AiContext {
  st: BattleState;
  side: Side;
}

const weatherOf = (ctx?: AiContext): Weather | null => (ctx ? engineWeather(ctx.st) : null);

/** Accuracy the move will have right now. */
const accuracyOf = (m: FighterMove, ctx?: AiContext) => weatherAccuracy(m, weatherOf(ctx));

/** Average damage if it hits (accuracy not included). */
function damageIfHits(m: FighterMove, me: Fighter, foe: Fighter, ctx?: AiContext): number {
  if (FIRST_TURN_ONLY.has(m.id) && me.turnsActive > 0) return 0;
  if (m.id === "superfang" || m.id === "ruination" || m.id === "naturesmadness") {
    return effectiveness(m.type, foe.types) === 0 ? 0 : Math.floor(foe.hp / 2);
  }
  if (m.fixedDamage !== undefined) {
    if (effectiveness(m.type, foe.types) === 0) return 0;
    return m.fixedDamage === "level" ? me.level : m.fixedDamage;
  }
  if (m.id in COUNTERS) {
    // Only pays off if the foe hits back with the right kind of attack.
    const [category, multiplier] = COUNTERS[m.id];
    const answered = foe.moves.filter((x) => isAttack(x) && (!category || x.category === category));
    if (answered.length === 0 || effectiveness(m.type, foe.types) === 0) return 0;
    return multiplier * 0.5 * Math.max(...answered.map((x) => damageIfHits(x, foe, me, ctx)));
  }
  const weather = weatherOf(ctx);
  const type = moveType(me, m);
  const eff = type === "typeless" ? 1 : effectivenessAgainst(me, type, foe);
  if (eff === 0 || abilityBlock(me, foe, m, priorityOf(me, m), eff)) return 0;
  const power = powerAgainst(m, me, foe);
  const move = { ...m, power: power > 0 ? power : FALLBACK_POWER };
  // The engine's own formula at an average roll, times the expected number of hits.
  const foeSide: Side = ctx?.side === "a" ? "b" : "a";
  const field = ctx?.st.field[foeSide];
  const screen = !!field && me.ability !== "infiltrator" && (field.auroraVeil > 0 || (m.category === "physical" ? field.reflect > 0 : field.lightScreen > 0));
  let damage = calcDamage(me, foe, move, () => AVERAGE_ROLL, false, { weather, screen }) * expectedHits(m, me);
  // Two turns for one hit (Solar moves are instant in sun).
  const instant = (m.id === "solarbeam" || m.id === "solarblade") && weatherOf(ctx) === "sun";
  if (CHARGE.has(m.id) && !instant && me.charging === null) damage /= 2;
  return damage;
}

const HALF_HEALS = new Set(["synthesis", "moonlight", "morningsun", "shoreup"]);
/** Status moves aimed at the foe (a Substitute blocks them unless they go through it). */
const AIMED = new Set(["encore", "taunt", "yawn", "strengthsap", "transform", "partingshot"]);
const statusOf = (m: FighterMove) => m.category === "status" && m.fixedDamage === undefined;

const HAZARDS = new Set(["stealthrock", "spikes", "toxicspikes", "stickyweb"]);
const WEATHER_OF: Record<string, Weather> = { sunnyday: "sun", raindance: "rain", sandstorm: "sand", snowscape: "snow", hail: "snow" };

/** Whether the weather move helps `me` more than the foe. */
function weatherHelps(weather: Weather, me: Fighter, foe: Fighter): boolean {
  const gain = (f: Fighter) => Math.max(0, ...f.moves.filter(isAttack).map((m) => weatherFactor(weather, m.type))) - 1;
  if (weather === "sand") return me.types.some((t) => t === "rock" || t === "ground" || t === "steel") && !foe.types.some((t) => t === "rock" || t === "ground" || t === "steel");
  if (weather === "snow") return me.types.includes("ice") && !foe.types.includes("ice");
  return gain(me) > gain(foe);
}

/** Field moves need the whole battle to judge (hazards only matter with a bench, for example). */
function fieldUseful(m: FighterMove, me: Fighter, foe: Fighter, ctx: AiContext): boolean {
  const { st, side } = ctx;
  const foeSide = side === "a" ? "b" : "a";
  const mine = st.field[side];
  const theirs = st.field[foeSide];
  const foeBench = st.bench[foeSide].some((f) => f.hp > 0);
  if (HAZARDS.has(m.id)) {
    if (!foeBench) return false;
    return m.id === "stealthrock" ? !theirs.stealthRock : m.id === "spikes" ? theirs.spikes < 3 : m.id === "toxicspikes" ? theirs.toxicSpikes < 2 : !theirs.stickyWeb;
  }
  if (m.id in WEATHER_OF) return st.weather?.kind !== WEATHER_OF[m.id] && weatherHelps(WEATHER_OF[m.id], me, foe);
  const foeHits = foe.moves.filter(isAttack);
  switch (m.id) {
    case "defog":
      return mine.stealthRock || mine.spikes > 0 || mine.toxicSpikes > 0 || mine.stickyWeb || theirs.reflect > 0 || theirs.lightScreen > 0;
    case "reflect":
      return mine.reflect === 0 && mine.auroraVeil === 0 && foeHits.some((x) => x.category === "physical");
    case "lightscreen":
      return mine.lightScreen === 0 && mine.auroraVeil === 0 && foeHits.some((x) => x.category === "special");
    case "auroraveil":
      return mine.auroraVeil === 0 && st.weather?.kind === "snow";
    case "wish":
      return !mine.wish && me.hp < me.maxHp * 0.7;
    case "healingwish":
    case "lunardance":
      return me.hp < me.maxHp * 0.3 && st.bench[side].some((f) => f.hp > 0 && f.hp < f.maxHp * 0.6);
    case "roar":
    case "whirlwind":
      return foeBench && (Object.values(foe.boosts).reduce((a, b) => a + b, 0) > 0 || theirs.stealthRock || theirs.spikes > 0);
    case "trickroom":
      return st.trickRoom === 0 && effectiveSpeed(me) < effectiveSpeed(foe);
    case "tailwind":
      return mine.tailwind === 0 && effectiveSpeed(me) <= effectiveSpeed(foe) && effectiveSpeed(me) * 2 > effectiveSpeed(foe);
    case "shedtail":
      return me.hp > me.maxHp * 0.6 && st.bench[side].some((f) => f.hp > 0);
    case "partingshot":
    case "teleport":
    case "chillyreception":
      // Worth it to get out of a losing matchup.
      return st.bench[side].some((f) => f.hp > 0) && matchup(me, foe) < 0;
  }
  return false;
}

/** Would this status move do anything to the foe right now? */
function statusUseful(m: FighterMove, me: Fighter, foe: Fighter, ctx?: AiContext): boolean {
  if (moveImmune(m, foe)) return false;
  if (me.taunt > 0 || me.item === "assaultvest") return false;
  const aimed = AIMED.has(m.id) || !!m.status || m.volatile === "confusion" || m.volatile === "leechseed" || m.boosts?.target === "foe";
  if (aimed && foe.substitute > 0 && !bypassesSub(m)) return false;
  // Volt Absorb, Good as Gold, Prankster into a Dark type...
  if (aimed && (abilityBlock(me, foe, m, priorityOf(me, m), 1) || (me.ability === "prankster" && foe.types.includes("dark")))) return false;
  if (m.status && isStatusName(m.status) && statusBlocked(foe, m.status, weatherOf(ctx))) return false;
  if (HALF_HEALS.has(m.id)) return me.hp < me.maxHp / 2;
  if (ctx && fieldUseful(m, me, foe, ctx)) return true;
  switch (m.id) {
    case "substitute":
      return me.substitute === 0 && me.hp > me.maxHp / 2;
    case "taunt":
      return foe.taunt === 0 && foe.moves.some((x) => statusOf(x) && x.ppLeft > 0);
    case "encore": {
      // Lock the foe into a status move it just used.
      const last = foe.lastMove === null ? null : foe.moves[foe.lastMove];
      return !foe.encore && !!last && statusOf(last) && last.ppLeft > 0;
    }
    case "yawn":
      return foe.drowsy === 0 && canInflict("slp", foe);
    case "strengthsap":
      return me.hp < me.maxHp * 0.6 && foe.boosts.atk > -6;
    case "healbell":
    case "aromatherapy":
      return me.status !== null && me.status !== "slp";
    case "takeheart":
      return me.boosts.spa < 4 || (me.status !== null && me.status !== "slp");
    case "tidyup":
      return me.boosts.atk < 4 || foe.substitute > 0;
    case "destinybond":
      return me.hp < me.maxHp * 0.3 && effectiveSpeed(me) > effectiveSpeed(foe) && (me.lastMove === null || me.moves[me.lastMove].id !== "destinybond");
    case "magnetrise":
      return me.magnetRise === 0 && foe.moves.some((x) => x.type === "ground" && !statusOf(x));
    case "curse":
      return me.types.includes("ghost") ? !foe.cursed && me.hp > me.maxHp * 0.6 : me.boosts.atk < 4;
    case "transform":
      return !me.transformed;
    case "trick":
    case "switcheroo":
      // Hand a Choice item to a foe that relies on variety.
      return CHOICE.has(me.item) && !CHOICE.has(foe.item) && foe.ability !== "stickyhold" && foe.substitute === 0;
    case "sleeptalk":
      return me.status === "slp" && me.sleepTurns > 0;
    case "revivalblessing":
      return false; // scored by the team-aware chooseAction

    case "rest":
      return me.hp < me.maxHp / 2 || (me.status !== null && me.status !== "slp");
    case "painsplit":
      return me.hp < foe.hp;
    case "bellydrum":
      return me.hp > me.maxHp * 0.6 && me.boosts.atk < 6;
    case "haze": {
      const sum = (f: Fighter) => Object.values(f.boosts).reduce((a, b) => a + b, 0);
      return sum(foe) > 0 || sum(me) < 0;
    }
  }
  if (m.status) return canInflict(m.status, foe);
  if (m.volatile === "confusion") return foe.confusion === 0;
  if (m.volatile === "leechseed") return !foe.seeded && !foe.types.includes("grass");
  if (m.volatile === "protect") return me.protectStreak === 0;
  if (m.heal) return me.hp < me.maxHp / 2;
  if (m.boosts) {
    const stats = Object.keys(m.boosts.stats) as (keyof Fighter["boosts"])[];
    return m.boosts.target === "self" ? stats.some((s) => me.boosts[s] < 4) : stats.some((s) => foe.boosts[s] > -4);
  }
  return false;
}

/** Status moves are worth this share of the best hit when useful. */
const STATUS_VALUE = (m: FighterMove) =>
  m.id === "transform" || m.id === "sleeptalk"
    ? 2
    : m.heal || HALF_HEALS.has(m.id) || m.id === "rest" || m.id === "painsplit" || m.id === "strengthsap"
      ? 0.9
      : m.status || m.id === "yawn" || m.id === "destinybond"
        ? 0.6
        : m.volatile === "protect" || m.id === "substitute"
          ? 0.3
          : 0.5;

/**
 * Foe AI. If an attack would knock you out, it takes the surest one (most
 * accurate, then priority if you're faster). Otherwise it picks the best
 * expected damage, with status moves scored when they'd actually work, a
 * little noise between close options and 15% random moves.
 */
export function chooseMove(me: Fighter, foe: Fighter, rng: Rng = Math.random, ctx?: AiContext): number {
  const usable = me.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.ppLeft > 0);
  if (usable.length === 0) return 0;
  // A Choice item (or Gorilla Tactics) only allows the locked move.
  if (me.choiceLock !== null && me.moves[me.choiceLock]?.ppLeft > 0) return me.choiceLock;
  if (rng() < RANDOMNESS) return usable[Math.floor(rng() * usable.length)].i;

  // Finish it off with the most reliable KO.
  const kos = usable.filter(({ m }) => isAttack(m) && damageIfHits(m, me, foe, ctx) >= foe.hp);
  if (kos.length) {
    const foeFaster = effectiveSpeed(foe) > effectiveSpeed(me);
    kos.sort((x, y) => accuracyOf(y.m, ctx) - accuracyOf(x.m, ctx) || (foeFaster ? y.m.priority - x.m.priority : 0));
    return kos[0].i;
  }

  const bestHit = Math.max(1, ...usable.filter(({ m }) => isAttack(m)).map(({ m }) => damageIfHits(m, me, foe, ctx) * accuracyOf(m, ctx)));
  // Fainting on purpose only makes sense when it's about to go down anyway.
  const sacrifice = (m: FighterMove) => (SELF_KO.has(m.id) && me.hp > me.maxHp * 0.3 ? 0.3 : 1);
  let best = usable[0].i;
  let bestScore = -1;
  for (const { m, i } of usable) {
    const score =
      (isAttack(m) ? damageIfHits(m, me, foe, ctx) * accuracyOf(m, ctx) : statusUseful(m, me, foe, ctx) ? bestHit * STATUS_VALUE(m) : 0) *
      sacrifice(m) *
      (0.9 + rng() * 0.2); // a little noise between similar options
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/** Share of the target's current HP the attacker's best move takes per turn (capped at 1). */
function pressure(me: Fighter, foe: Fighter): number {
  const usable = me.moves.filter((m) => m.ppLeft > 0 && isAttack(m));
  const best = Math.max(0, ...usable.map((m) => damageIfHits(m, me, foe) * m.accuracy));
  return Math.min(1, best / Math.max(1, foe.hp));
}

/**
 * How good `me` looks against `foe`, from about −1 (loses badly) to +1: the
 * pressure it puts on the foe minus the pressure it takes, and a bonus for
 * moving first.
 */
export function matchup(me: Fighter, foe: Fighter): number {
  const faster = effectiveSpeed(me) > effectiveSpeed(foe) ? 0.15 : effectiveSpeed(me) < effectiveSpeed(foe) ? -0.15 : 0;
  return pressure(me, foe) - pressure(foe, me) + faster;
}

/** The bench slot with the best matchup against the foe (fainted ones skipped), or −1. */
export function chooseReplacement(bench: Fighter[], foe: Fighter): number {
  let best = -1;
  let bestScore = -Infinity;
  bench.forEach((f, i) => {
    if (f.hp <= 0) return;
    const score = matchup(f, foe);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/**
 * The AI's full choice for `side`: usually a move (see `chooseMove`), but it
 * switches out of a losing matchup when a bench Pokémon is clearly better,
 * not right after coming in, and not always (70%), so it isn't predictable.
 */
export function chooseAction(st: BattleState, side: Side, rng: Rng = Math.random): Choice {
  const me = st[side];
  const foe = st[side === "a" ? "b" : "a"];
  if (canSwitch(st, side) && me.choiceLock !== null) {
    // Locked into a move that barely works here: come back in later.
    const locked = me.moves[me.choiceLock];
    const ctx = { st, side };
    const weak = isAttack(locked) ? damageIfHits(locked, me, foe, ctx) * accuracyOf(locked, ctx) < foe.hp * 0.2 : !statusUseful(locked, me, foe, ctx);
    const slot = chooseReplacement(st.bench[side], foe);
    if (weak && slot >= 0 && rng() < SWITCH_CHANCE) return { switchTo: slot };
  }
  if (canSwitch(st, side) && me.turnsActive > 0) {
    const current = matchup(me, foe);
    const slot = chooseReplacement(st.bench[side], foe);
    // The incoming Pokémon takes a hit on the way in, so it has to be clearly better.
    if (slot >= 0 && current < 0 && matchup(st.bench[side][slot], foe) - current > SWITCH_MARGIN && rng() < SWITCH_CHANCE) {
      return { switchTo: slot };
    }
  }
  // Revival Blessing is worth a turn whenever a teammate is down.
  const revive = me.moves.findIndex((m) => m.id === "revivalblessing" && m.ppLeft > 0);
  if (revive >= 0 && me.taunt === 0 && st.bench[side].some((f) => f.hp <= 0)) return revive;
  return chooseMove(me, foe, rng, { st, side });
}

/**
 * Finishes a turn paused by a pivot (the best matchup comes in), then sends
 * out the best replacement for every fainted Pokémon (both sides).
 */
export function replaceFainted(st: BattleState, sides: Side[] = ["a", "b"], rng: Rng = Math.random): BattleState {
  while (st.pending) {
    const { side } = st.pending;
    st = resolvePivot(st, chooseReplacement(st.bench[side], st[side === "a" ? "b" : "a"]), rng).state;
  }
  for (const side of sides) {
    if (needsReplacement(st, side)) st = switchIn(st, side, chooseReplacement(st.bench[side], st[side === "a" ? "b" : "a"])).state;
  }
  return st;
}
