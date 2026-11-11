import { effectiveness } from "../typeChart.ts";
import {
  abilityBlock,
  attackModifier,
  blocksDrop,
  CONTACT_STATUS,
  defenseModifier,
  finalModifier,
  INTIMIDATE_PROOF,
  MOLD_BREAKERS,
  moveType,
  ON_KO,
  powerModifier,
  priorityBonus,
  speedModifier,
  stab,
  statusBlocked,
  typeEffectiveness,
  WEATHER_NEGATORS,
  WEATHER_SETTERS,
} from "./abilities.ts";
import type { BattleMove, BattlePokemon, Boosts, StatName, Status } from "./types.ts";

/**
 * Battle engine (1v1 or teams) with the standard (gen 5+) rules: move priority, then
 * speed (paralysis halves it, ties are random); the damage formula with the
 * 85–100% roll, STAB, type effectiveness, critical hits and burn; accuracy;
 * stat stages; burn, paralysis, poison, bad poison and sleep with their type
 * immunities; flinching, confusion, Protect, Leech Seed, moves that lock the
 * user in (Outrage) or need a recharge turn (Hyper Beam); drain, recoil,
 * healing, multi-hit, fixed-damage moves, chance effects and PP. Abilities and
 * items are not modeled. Special moves handled: Fake Out / First Impression
 * (first turn only), Sucker Punch, Focus Punch, Rest, Super Fang / Ruination,
 * Pain Split, Belly Drum, Haze, Substitute, Encore, Taunt, Yawn, Curse,
 * Destiny Bond, Sleep Talk, Transform, Strength Sap, Synthesis and the other
 * half-HP heals, Heal Bell, Take Heart, Tidy Up, Magnet Rise and Revival
 * Blessing. The field: entry hazards (Stealth Rock, Spikes, Toxic Spikes,
 * Sticky Web) and the moves that clear them, Reflect / Light Screen / Aurora
 * Veil, Wish, Healing Wish, Roar / Whirlwind / Dragon Tail, Trick Room and
 * weather (sun, rain, sand, snow) with its effects on damage, accuracy,
 * healing and Weather Ball. Pivots (U-turn, Volt Switch, Flip Turn, Parting
 * Shot, Chilly Reception, Teleport) pause the turn: `state.pending` says who
 * must pick a replacement, and `resolvePivot` finishes the turn. Damaging
 * moves with their own rules: Explosion, two-turn moves (Solar Beam...),
 * Counter / Mirror Coat, variable power (Eruption, Facade, Hex, Low Kick,
 * Heavy Slam, Stored Power, Rage Fist, Triple Axel...), Psyshock, Body Press,
 * Foul Play and Clear Smog. Freeze: can't move, 20% to thaw each turn, Fire
 * moves thaw it. Abilities (see abilities.ts for the modifiers): entry
 * effects (Intimidate, weather setters, Download, Trace, Imposter...),
 * immunities and absorbers, contact punishment, stat-drop guards, Defiant,
 * end-of-turn effects (Speed Boost, Poison Heal...), Regenerator / Natural
 * Cure on switching out, Sturdy, Disguise, Truant, Slow Start, trapping,
 * Mold Breaker, Magic Guard, Sheer Force, Serene Grace and more. Other
 * effects just fail.
 *
 * Teams: each side has one Pokémon out (`a` / `b`) and the rest on its
 * `bench`. Switching and using an item take the whole turn and go before any
 * move; a fainted Pokémon is replaced between turns (`switchIn`). The battle
 * ends when a side has nobody left. In 1v1 the benches are empty.
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
  /** Turns this Pokémon has been in battle (Fake Out only works on the first). */
  turnsActive: number;
  /** HP left on its Substitute (0 = none). */
  substitute: number;
  /** Turns of Taunt left (no status moves). */
  taunt: number;
  /** Encore: must repeat this move for `turns` more turns. */
  encore: { index: number; turns: number } | null;
  /** Index of the last move it used (null: none yet, or Struggle). */
  lastMove: number | null;
  /** Yawn: falls asleep when this ticks down to 0 at the end of a turn. */
  drowsy: number;
  /** Destiny Bond is up until its next move. */
  destinyBond: boolean;
  /** Ghost-type Curse: loses 1/4 of its max HP every turn. */
  cursed: boolean;
  /** Turns of Magnet Rise left (Ground moves miss it). */
  magnetRise: number;
  /** Transform: the species it looks like and what it had before (restored on switching out). */
  transformed: { dexId: number; types: string[]; stats: Record<StatName, number>; moves: FighterMove[] } | null;
  weight: number;
  /** Its faint has been announced. */
  down: boolean;
  /** Charging a two-turn move (its index): it fires next turn. */
  charging: number | null;
  /** Damage taken from the foe's move this turn (Counter, Mirror Coat, Avalanche). */
  hurtBy: { amount: number; category: string } | null;
  /** Hits taken in the whole battle (Rage Fist). */
  timesHit: number;
  /** Its last move failed or missed (Stomping Tantrum). */
  moveFailed: boolean;
  /** Ability id ("intimidate"; "" for none) and its display name. */
  ability: string;
  abilityName: string;
  /** Its own ability (Trace can change `ability` until it switches out). */
  baseAbility: { id: string; name: string };
  /** Flash Fire powered up its Fire moves. */
  flashFire: boolean;
  /** Turns of Slow Start left. */
  slowStart: number;
  /** Truant: skips its next turn. */
  loafing: boolean;
  /** Disguise / Ice Face still up. */
  disguised: boolean;
  /** Booster Energy powered up Protosynthesis / Quark Drive. */
  boosterEnergy: boolean;
  /** Per-turn flags. */
  protected: boolean;
  flinched: boolean;
  moves: FighterMove[];
}

export type ItemId = "potion" | "fullheal";

export const ITEMS: Record<ItemId, { name: string; count: number }> = {
  /** Heals 60 HP (a Super Potion). */
  potion: { name: "Super Potion", count: 2 },
  /** Cures status and confusion. */
  fullheal: { name: "Full Heal", count: 1 },
};
const POTION_HP = 60;

export type Weather = "sun" | "rain" | "sand" | "snow";

/** What lies on one side of the field. */
export interface SideField {
  stealthRock: boolean;
  /** Layers (0-3). */
  spikes: number;
  /** Layers (0-2): 1 poisons, 2 badly poisons. */
  toxicSpikes: number;
  stickyWeb: boolean;
  /** Turns left of each screen. */
  reflect: number;
  lightScreen: number;
  auroraVeil: number;
  /** Wish: heals whoever is out when `turns` reaches 0. */
  wish: { turns: number; hp: number } | null;
  /** Healing Wish: the next Pokémon to come in is fully healed. */
  healingWish: boolean;
}

export interface BattleState {
  turn: number;
  /** The Pokémon out on each side. */
  a: Fighter;
  b: Fighter;
  /** The rest of each team (empty in 1v1). Switching swaps one with the active Pokémon. */
  bench: Record<Side, Fighter[]>;
  /** Items left on each side. */
  bag: Record<Side, Record<ItemId, number>>;
  field: Record<Side, SideField>;
  weather: { kind: Weather; turns: number } | null;
  /** Turns of Trick Room left (slower Pokémon move first). */
  trickRoom: number;
  /** A turn paused by a pivot move: `side` picks who comes in (`resolvePivot`). */
  pending: { side: Side; plan: TurnPlan } | null;
  /** The leads' entry abilities have kicked in (`beginBattle`). */
  started: boolean;
  winner: Side | null;
}

/** The rest of a turn, kept while it's paused. */
export interface TurnPlan {
  order: Side[];
  /** Move index each side is using (−1: Struggle; null: it switched or used an item). */
  moves: Record<Side, number | null>;
  /** Where in `order` to pick up. */
  next: number;
  /** Sides that brought a Pokémon in this turn. */
  fresh: Side[];
  speedOrder: Side[];
}

/** A move (its index), a switch to a bench slot, or an item on the active Pokémon. */
export type Choice = number | { switchTo: number } | { item: ItemId };

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
  | { kind: "cant-move"; side: Side; reason: "par" | "slp" | "frz" | "flinch" | "recharge" | "truant" }
  | { kind: "confused"; side: Side; fatigue: boolean }
  | { kind: "confusion"; side: Side }
  | { kind: "confusion-end"; side: Side }
  | { kind: "self-hit"; side: Side; amount: number; hp: number }
  | { kind: "protect"; side: Side }
  | { kind: "protected"; side: Side }
  | { kind: "seeded"; side: Side }
  | { kind: "haze"; side: Side }
  | { kind: "pain-split"; side: Side; hp: { a: number; b: number } }
  | { kind: "hp-cost"; side: Side; amount: number; hp: number }
  | { kind: "leech"; side: Side; amount: number; hp: number; healerHp: number }
  | { kind: "wake"; side: Side }
  | { kind: "residual"; side: Side; status: Status; amount: number; hp: number }
  | { kind: "faint"; side: Side }
  | {
      kind: "switch";
      side: Side;
      from: string;
      to: string;
      dexId: number;
      hp: number;
      maxHp: number;
      status: Status | null;
      forced: boolean;
      /** Roar, Whirlwind, Dragon Tail... */
      dragged?: boolean;
    }
  | { kind: "item"; side: Side; item: ItemId }
  | { kind: "cure"; side: Side }
  | { kind: "sub-damage"; side: Side; effectiveness: number; crit: boolean; broke: boolean }
  | { kind: "hurt"; side: Side; amount: number; hp: number; cause: HurtCause }
  | { kind: "transform"; side: Side; dexId: number }
  | { kind: "revive"; side: Side; name: string }
  | { kind: "effect"; side: Side; effect: Effect; move?: string }
  /** An ability kicks in (shown before what it does). */
  | { kind: "ability"; side: Side; ability: string }
  | { kind: "weather"; side: Side; weather: Weather; ended: boolean };

/** HP lost to something other than a hit or a status (each has its own message). */
export type HurtCause =
  | "curse"
  | "destiny-bond"
  | "stealthrock"
  | "spikes"
  | "sandstorm"
  | "contact"
  | "aftermath"
  | "sun"
  | "bad-dreams"
  | "liquid-ooze"
  | "disguise";

/** Text-only events: what changed is in the state, the screen just says it. */
export type Effect =
  | "substitute"
  | "substitute-fail"
  | "taunt"
  | "taunt-end"
  | "taunt-block"
  | "encore"
  | "encore-end"
  | "drowsy"
  | "destiny-bond"
  | "cursed"
  | "magnet-rise"
  | "magnet-rise-end"
  | "heal-bell"
  | "tidy-up"
  | "stealth-rock"
  | "spikes"
  | "toxic-spikes"
  | "sticky-web"
  | "sticky-web-caught"
  | "toxic-spikes-absorbed"
  | "hazards-gone"
  | "reflect"
  | "light-screen"
  | "aurora-veil"
  | "reflect-end"
  | "light-screen-end"
  | "aurora-veil-end"
  | "screens-broken"
  | "wish"
  | "wish-came-true"
  | "healing-wish"
  | "trick-room"
  | "trick-room-end"
  | "no-target"
  | "thaw"
  | "charging"
  | "stats-reset"
  | "sturdy"
  | "disguise"
  | "flash-fire"
  | "stats-protected"
  | "slow-start"
  | "slow-start-end"
  | "pressure"
  | "trace"
  | "weather-negated"
  | "immune";

const STATS: StatName[] = ["atk", "def", "spa", "spd", "spe"];
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
    turnsActive: 0,
    substitute: 0,
    taunt: 0,
    encore: null,
    lastMove: null,
    drowsy: 0,
    destinyBond: false,
    cursed: false,
    magnetRise: 0,
    transformed: null,
    weight: p.weight ?? 50,
    down: false,
    charging: null,
    hurtBy: null,
    timesHit: 0,
    moveFailed: false,
    ability: toId(p.ability ?? ""),
    abilityName: p.ability ?? "",
    baseAbility: { id: toId(p.ability ?? ""), name: p.ability ?? "" },
    flashFire: false,
    slowStart: 0,
    loafing: false,
    disguised: toId(p.ability ?? "") === "disguise" || toId(p.ability ?? "") === "iceface",
    boosterEnergy: false,
    protected: false,
    flinched: false,
    moves: p.moves.map((m) => ({ ...m, ppLeft: m.pp })),
  };
}

/** "Huge Power" → "hugepower". */
export const toId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const emptyField = (): SideField => ({
  stealthRock: false,
  spikes: 0,
  toxicSpikes: 0,
  stickyWeb: false,
  reflect: 0,
  lightScreen: 0,
  auroraVeil: 0,
  wish: null,
  healingWish: false,
});

const fullBag = (): Record<ItemId, number> => ({ potion: ITEMS.potion.count, fullheal: ITEMS.fullheal.count });

export const createBattle = (a: BattlePokemon, b: BattlePokemon): BattleState => createTeamBattle([a], [b]);

/** The first Pokémon of each team leads. */
export const createTeamBattle = (a: BattlePokemon[], b: BattlePokemon[]): BattleState => ({
  turn: 1,
  a: createFighter(a[0]),
  b: createFighter(b[0]),
  bench: { a: a.slice(1).map(createFighter), b: b.slice(1).map(createFighter) },
  bag: { a: fullBag(), b: fullBag() },
  field: { a: emptyField(), b: emptyField() },
  weather: null,
  trickRoom: 0,
  pending: null,
  started: false,
  winner: null,
});

/** Pokémon still able to fight on a side (active included). */
export const remaining = (st: BattleState, side: Side) => [st[side], ...st.bench[side]].filter((f) => f.hp > 0).length;

/** The active Pokémon fainted and there's someone on the bench to send out. */
export const needsReplacement = (st: BattleState, side: Side) => st[side].hp <= 0 && st.bench[side].some((f) => f.hp > 0);

/** Whether the active Pokémon may switch out by choice (not locked into a move or recharging). */
export const canSwitch = (st: BattleState, side: Side) =>
  !st[side].locked && !st[side].mustRecharge && st[side].charging === null && !trapped(st, side) && st.bench[side].some((f) => f.hp > 0);

/** Shadow Tag, Arena Trap (grounded foes) and Magnet Pull (Steel foes) keep the foe from switching; Ghosts slip out. */
export function trapped(st: BattleState, side: Side): boolean {
  const me = st[side];
  const foe = st[other(side)];
  if (foe.hp <= 0 || me.types.includes("ghost")) return false;
  if (foe.ability === "shadowtag") return me.ability !== "shadowtag";
  if (foe.ability === "arenatrap") return grounded(me);
  return foe.ability === "magnetpull" && me.types.includes("steel");
}

/** The weather in effect (Air Lock and Cloud Nine switch its effects off). */
export const weatherOf = (st: BattleState): Weather | null =>
  st.weather && !WEATHER_NEGATORS.has(st.a.ability) && !WEATHER_NEGATORS.has(st.b.ability) ? st.weather.kind : null;

/** Speed for turn order: stages, paralysis (Quick Feet ignores it) and the ability (Swift Swim...). */
export const effectiveSpeed = (f: Fighter, weather: Weather | null = null) =>
  f.stats.spe * stageMultiplier(f.boosts.spe) * (f.status === "par" && f.ability !== "quickfeet" ? 0.5 : 1) * speedModifier(f, weather);

/** Move priority with the user's ability (Prankster, Gale Wings, Triage). */
export const priorityOf = (f: Fighter, move: FighterMove) => move.priority + priorityBonus(f, move);

/** The move that will actually be used (Struggle when out of PP). */
export function resolveMove(f: Fighter, index: number): FighterMove {
  const chosen = f.moves[index];
  if (chosen && chosen.ppLeft > 0) return chosen;
  return f.moves.find((m) => m.ppLeft > 0) ?? STRUGGLE;
}

/** Who acts first: higher priority, then higher speed (lower under Trick Room), ties at random. */
export function turnOrder(state: BattleState, moveA: FighterMove, moveB: FighterMove, rng: Rng): Side[] {
  const pa = priorityOf(state.a, moveA);
  const pb = priorityOf(state.b, moveB);
  if (pa !== pb) return pa > pb ? ["a", "b"] : ["b", "a"];
  const weather = weatherOf(state);
  const sa = effectiveSpeed(state.a, weather);
  const sb = effectiveSpeed(state.b, weather);
  if (sa !== sb) return sa > sb !== state.trickRoom > 0 ? ["a", "b"] : ["b", "a"];
  return rng() < 0.5 ? ["a", "b"] : ["b", "a"];
}

const critChance = (ratio = 1) => (ratio >= 4 ? 1 : ratio === 3 ? 0.5 : ratio === 2 ? 1 / 8 : 1 / 24);

/** Crit odds for this hit: Super Luck raises the stage, Battle Armor / Shell Armor stop crits. */
const critFor = (user: Fighter, target: Fighter, move: FighterMove) =>
  (target.ability === "battlearmor" || target.ability === "shellarmor") && !MOLD_BREAKERS.has(user.ability)
    ? 0
    : critChance((move.critRatio ?? 1) + (user.ability === "superluck" ? 1 : 0));

/** What the field and the turn add to a hit: weather, a screen on the target's side, and what some abilities check. */
export interface DamageMods {
  weather?: Weather | null;
  screen?: boolean;
  /** The user moves after the target this turn (Analytic). */
  movesLast?: boolean;
  /** The target came in this turn (Stakeout). */
  targetFresh?: boolean;
  /** Fainted teammates of the user (Supreme Overlord). */
  faintedAllies?: number;
}

/** Modifiers for a hit on `targetSide` right now. */
const modsFor = (st: BattleState, targetSide: Side, move: FighterMove, events: BattleEvent[]): DamageMods => {
  const f = st.field[targetSide];
  const userSide = other(targetSide);
  return {
    weather: weatherOf(st),
    // Infiltrator slips past screens.
    screen: st[userSide].ability !== "infiltrator" && (f.auroraVeil > 0 || (move.category === "physical" ? f.reflect > 0 : f.lightScreen > 0)),
    movesLast: events.some((e) => e.kind === "move" && e.side === targetSide),
    targetFresh: events.some((e) => e.kind === "switch" && e.side === targetSide),
    faintedAllies: st.bench[userSide].filter((x) => x.hp <= 0).length,
  };
};

/** Damage of one hit (gen 5+ formula, applied in the games' order with floors). */
export function calcDamage(user: Fighter, target: Fighter, move: FighterMove, rng: Rng, crit: boolean, mods: DamageMods = {}): number {
  const physical = move.category === "physical";
  // Body Press attacks with Defense, Foul Play with the target's Attack, Psyshock hits Defense.
  const atkStat: StatName = move.id === "bodypress" ? "def" : physical ? "atk" : "spa";
  const defStat: StatName = physical || PSYSHOCK.has(move.id) ? "def" : "spd";
  const attacker = move.id === "foulplay" ? target : user;
  const weatherNow = mods.weather ?? null;
  // Mold Breaker ignores the target's ability; Unaware ignores the other side's stat stages.
  const ignoreTarget = MOLD_BREAKERS.has(user.ability);
  const targetUnaware = target.ability === "unaware" && !ignoreTarget;
  // Critical hits ignore the attacker's drops and the defender's raises.
  let atkStage = crit ? Math.max(0, attacker.boosts[atkStat]) : attacker.boosts[atkStat];
  let defStage = crit ? Math.min(0, target.boosts[defStat]) : target.boosts[defStat];
  if (targetUnaware) atkStage = 0;
  if (user.ability === "unaware") defStage = 0;
  const attack = Math.max(
    1,
    Math.floor(attacker.stats[atkStat] * stageMultiplier(atkStage) * attackModifier(user, target, move, weatherNow, ignoreTarget)),
  );
  // Sand raises Rock types' Sp. Def, snow raises Ice types' Defense.
  const weatherDef =
    (weatherNow === "sand" && defStat === "spd" && target.types.includes("rock")) ||
    (weatherNow === "snow" && defStat === "def" && target.types.includes("ice"))
      ? 1.5
      : 1;
  const defense = Math.max(
    1,
    Math.floor(target.stats[defStat] * stageMultiplier(defStage) * weatherDef * defenseModifier(user, target, weatherNow, ignoreTarget, defStat)),
  );
  const basePower = move.power > 0 ? move.power : FALLBACK_POWER;
  const power = Math.max(1, Math.floor(basePower * powerModifier(user, target, move, { ...mods, weather: weatherNow, ignoreTarget })));
  const type = moveType(user, move);

  let damage = Math.floor(Math.floor((Math.floor((2 * user.level) / 5 + 2) * power * attack) / defense) / 50) + 2;
  const weather = weatherFactor(weatherNow, type);
  if (weather !== 1) damage = Math.floor(damage * weather);
  // Sniper makes critical hits hit even harder.
  if (crit) damage = Math.floor(damage * CRIT_MULTIPLIER * (user.ability === "sniper" ? 1.5 : 1));
  damage = Math.floor((damage * (85 + Math.floor(rng() * 16))) / 100);
  if (type !== "typeless") damage = Math.floor(damage * stab(user, type));
  const eff = type === "typeless" ? 1 : effectivenessAgainst(user, type, target);
  damage = Math.floor(damage * eff);
  // Burn halves physical damage (Facade and Guts ignore it).
  if (physical && user.status === "brn" && move.id !== "facade" && user.ability !== "guts") damage = Math.floor(damage / 2);
  // Screens halve the damage (critical hits go through them).
  if (mods.screen && !crit) damage = Math.floor(damage / 2);
  damage = Math.floor(damage * finalModifier(user, target, move, eff, ignoreTarget));
  return Math.max(1, damage);
}

/** Special moves that hit the target's Defense. */
const PSYSHOCK = new Set(["psyshock", "psystrike", "secretsword"]);

/** Sun boosts Fire and weakens Water; rain does the opposite. */
export function weatherFactor(weather: Weather | null | undefined, type: string): number {
  if (weather === "sun") return type === "fire" ? 1.5 : type === "water" ? 0.5 : 1;
  if (weather === "rain") return type === "water" ? 1.5 : type === "fire" ? 0.5 : 1;
  return 1;
}

/** Accuracy after the weather: Thunder and Hurricane never miss in rain (50% in sun), Blizzard never misses in snow. */
export function weatherAccuracy(move: Pick<FighterMove, "id" | "accuracy">, weather: Weather | null | undefined): number {
  if (move.id === "thunder" || move.id === "hurricane" || move.id === "bleakwindstorm" || move.id === "wildboltstorm" || move.id === "sandsearstorm") {
    if (weather === "rain") return 1;
    if (weather === "sun" && (move.id === "thunder" || move.id === "hurricane")) return 0.5;
  }
  if (move.id === "blizzard" && weather === "snow") return 1;
  return move.accuracy;
}

/** Weather Ball: type and doubled power from the weather. */
const WEATHER_BALL: Record<Weather, string> = { sun: "fire", rain: "water", sand: "rock", snow: "ice" };

/** On the ground: hit by Spikes, Toxic Spikes, Sticky Web and Ground moves. */
export const grounded = (f: Pick<Fighter, "types" | "magnetRise">) => !f.types.includes("flying") && f.magnetRise === 0;

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
  frz: ["ice"],
};

/** Type effectiveness against this fighter right now (Magnet Rise lifts it off the ground). */
export const effectivenessOn = (type: string, target: Pick<Fighter, "types" | "magnetRise">) =>
  type === "typeless" ? 1 : type === "ground" && target.magnetRise > 0 ? 0 : effectiveness(type, target.types);

/** Effectiveness of the user's move (Scrappy lets Normal and Fighting hit Ghosts). */
export const effectivenessAgainst = (user: Pick<Fighter, "ability">, type: string, target: Pick<Fighter, "types" | "magnetRise">) =>
  type === "ground" && target.magnetRise > 0 ? 0 : typeEffectiveness(user, type, target.types);

/** Sound moves and a few others go through a Substitute. */
export const bypassesSub = (move: Pick<FighterMove, "flags">) => !!move.flags?.some((f) => f === "bypasssub" || f === "sound");

/** Status moves aimed at the foe that the generic effects below don't cover. */
const FOE_STATUS = new Set(["encore", "taunt", "yawn", "strengthsap", "transform", "partingshot"]);

/** Moves Sleep Talk can't call. */
const NO_SLEEP_TALK = new Set(["sleeptalk", "rest", "bellydrum", "focuspunch", "uproar", "solarbeam", "solarblade", "skyattack", "meteorbeam"]);

/** Moves that only work on the user's first turn out. */
export const FIRST_TURN_ONLY = new Set(["fakeout", "firstimpression"]);
/** Damage = half the target's current HP. */
const HALF_HP = new Set(["superfang", "ruination", "naturesmadness"]);

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

const isStatus = (s: string | undefined): s is Status =>
  s === "brn" || s === "par" || s === "psn" || s === "tox" || s === "slp" || s === "frz";

/**
 * Inflicts a status if possible. `announceFailure` for status moves (not
 * chance effects); `source` is the side causing it (Corrosion, Synchronize).
 */
function tryStatus(st: BattleState, side: Side, status: string, rng: Rng, events: BattleEvent[], announceFailure: boolean, source?: Side) {
  const target = st[side];
  const weather = weatherOf(st);
  // Corrosion poisons Poison and Steel types.
  const corrosive = source !== undefined && st[source].ability === "corrosion" && (status === "psn" || status === "tox");
  const typeOk = corrosive ? isStatus(status) && target.status === null && target.hp > 0 : canInflict(status, target);
  if (!isStatus(status) || !typeOk || (status === "frz" && weather === "sun")) {
    if (announceFailure) events.push({ kind: "fail", side: other(side) });
    return;
  }
  const moldBroken = source !== undefined && source !== side && MOLD_BREAKERS.has(st[source].ability);
  if (statusBlocked(target, status, weather) && !moldBroken) {
    if (announceFailure) {
      reveal(st, side, events);
      events.push({ kind: "no-effect", side });
    }
    return;
  }
  target.status = status;
  target.drowsy = 0;
  if (status === "slp") target.sleepTurns = 1 + Math.floor(rng() * 3);
  if (status === "tox") target.toxicTurns = 0;
  events.push({ kind: "status", side, status });
  // Synchronize passes burn, paralysis and poison back.
  if (source !== undefined && source !== side && target.ability === "synchronize" && status !== "slp" && status !== "frz") {
    reveal(st, side, events);
    tryStatus(st, source, status, rng, events, false);
  }
}

/** Shows the ability that's about to act. */
function reveal(st: BattleState, side: Side, events: BattleEvent[]) {
  const f = st[side];
  if (f.abilityName) events.push({ kind: "ability", side, ability: f.abilityName });
}

/** Magic Guard: no damage except from attacks. */
const indirectOk = (f: Fighter) => f.ability !== "magicguard";

/** Takes `amount` (capped by the HP left) for a reason other than a hit. Returns what it took. */
function hurt(st: BattleState, side: Side, amount: number, cause: HurtCause, events: BattleEvent[]): number {
  const f = st[side];
  if (f.hp <= 0 || !indirectOk(f)) return 0;
  const taken = Math.min(f.hp, Math.max(1, Math.floor(amount)));
  f.hp -= taken;
  events.push({ kind: "hurt", side, amount: taken, hp: f.hp, cause });
  return taken;
}

/**
 * Changes stat stages. `by` is the side causing it: drops from the foe are
 * stopped by Clear Body and the like and set off Defiant / Competitive.
 * Contrary flips the changes, Simple doubles them.
 */
function applyBoosts(st: BattleState, side: Side, boosts: Boosts, events: BattleEvent[], by: Side = side) {
  const f = st[side];
  const fromFoe = by !== side;
  const moldBroken = fromFoe && MOLD_BREAKERS.has(st[by].ability);
  let dropped = false;
  for (const stat of STATS) {
    let requested = boosts[stat];
    if (!requested) continue;
    if (f.ability === "contrary" && !moldBroken) requested = -requested;
    if (f.ability === "simple" && !moldBroken) requested *= 2;
    if (requested < 0 && fromFoe && blocksDrop(f, stat) && !moldBroken) {
      reveal(st, side, events);
      events.push({ kind: "effect", side, effect: "stats-protected" });
      continue;
    }
    const before = f.boosts[stat];
    f.boosts[stat] = Math.max(-6, Math.min(6, before + requested));
    events.push({ kind: "boost", side, stat, change: f.boosts[stat] - before, requested });
    if (requested < 0 && fromFoe && f.boosts[stat] < before) dropped = true;
  }
  if (dropped && (f.ability === "defiant" || f.ability === "competitive") && f.hp > 0) {
    reveal(st, side, events);
    applyBoosts(st, side, f.ability === "defiant" ? { atk: 2 } : { spa: 2 }, events);
  }
}

function heal(st: BattleState, side: Side, amount: number, events: BattleEvent[]) {
  const f = st[side];
  const healed = Math.min(f.maxHp - f.hp, Math.max(1, Math.floor(amount)));
  if (healed <= 0) return;
  f.hp += healed;
  events.push({ kind: "heal", side, amount: healed, hp: f.hp });
}

/**
 * Sleep / paralysis checks. Returns false if the Pokémon can't move this turn.
 * A sleeping Pokémon can still use Sleep Talk.
 */
function canMove(st: BattleState, side: Side, move: FighterMove, rng: Rng, events: BattleEvent[]): boolean {
  const f = st[side];
  if (f.status === "slp") {
    if (f.sleepTurns <= 0) {
      f.status = null;
      events.push({ kind: "wake", side });
    } else {
      // Early Bird wakes up twice as fast.
      f.sleepTurns -= f.ability === "earlybird" ? 2 : 1;
      if (f.sleepTurns < 0) f.sleepTurns = 0;
      events.push({ kind: "cant-move", side, reason: "slp" });
      if (move.id !== "sleeptalk") return false;
    }
  }
  if (f.status === "frz") {
    // 20% to thaw each turn; a few fiery moves thaw the user themselves.
    if (DEFROST.has(move.id) || rng() < THAW_CHANCE) {
      f.status = null;
      events.push({ kind: "effect", side, effect: "thaw" });
    } else {
      events.push({ kind: "cant-move", side, reason: "frz" });
      return false;
    }
  }
  if (f.status === "par" && rng() < PARALYSIS_SKIP) {
    events.push({ kind: "cant-move", side, reason: "par" });
    return false;
  }
  return true;
}

const THAW_CHANCE = 0.2;
const DEFROST = new Set(["flamewheel", "flareblitz", "sacredfire", "scald", "steameruption", "scorchingsands", "burnup", "pyroball", "fusionflare", "matchagotcha"]);
/** Two-turn moves: charge, then hit (Solar moves skip the charge in sun). */
export const CHARGE = new Set(["solarbeam", "solarblade", "meteorbeam", "skyattack", "skullbash", "razorwind", "freezeshock", "iceburn", "electroshot", "fly", "dig", "dive", "bounce", "phantomforce", "shadowforce"]);
/** The user faints after using these. */
export const SELF_KO = new Set(["explosion", "selfdestruct", "mistyexplosion", "memento", "finalgambit"]);
/** Return the damage taken this turn: [category it answers (null: either), multiplier]. */
export const COUNTERS: Record<string, [string | null, number]> = {
  counter: ["physical", 2],
  mirrorcoat: ["special", 2],
  metalburst: [null, 1.5],
  comeuppance: [null, 1.5],
};

function performMove(
  st: BattleState,
  side: Side,
  move: FighterMove,
  rng: Rng,
  events: BattleEvent[],
  foeMovesLater: boolean,
  /** null if the foe isn't using a move this turn (it switched or used an item). */
  foeMove: FighterMove | null,
) {
  const user = st[side];
  if (user.mustRecharge) {
    user.mustRecharge = false;
    events.push({ kind: "cant-move", side, reason: "recharge" });
    return;
  }
  // Destiny Bond lasts until the user tries to move again.
  user.destinyBond = false;
  const start = events.length;
  attemptMove(st, side, move, rng, events, foeMovesLater, foeMove);
  // Stomping Tantrum remembers whether this went wrong.
  const foeSide = other(side);
  user.moveFailed = events
    .slice(start)
    .some((e) => ((e.kind === "fail" || e.kind === "miss" || e.kind === "cant-move") && e.side === side) || ((e.kind === "no-effect" || e.kind === "protected") && e.side === foeSide));
}

function attemptMove(
  st: BattleState,
  side: Side,
  move: FighterMove,
  rng: Rng,
  events: BattleEvent[],
  foeMovesLater: boolean,
  foeMove: FighterMove | null,
) {
  const user = st[side];
  // Truant: every other turn, it just loafs around.
  if (user.ability === "truant" && user.loafing) {
    user.loafing = false;
    events.push({ kind: "cant-move", side, reason: "truant" });
    return;
  }
  if (!canMove(st, side, move, rng, events)) {
    user.locked = null;
    user.charging = null;
    return;
  }
  if (user.flinched) {
    user.locked = null;
    user.charging = null;
    events.push({ kind: "cant-move", side, reason: "flinch" });
    if (user.ability === "steadfast") {
      reveal(st, side, events);
      applyBoosts(st, side, { spe: 1 }, events);
    }
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
        user.charging = null;
        events.push({ kind: "self-hit", side, amount, hp: user.hp });
        return;
      }
    }
  }
  if (user.taunt > 0 && move.category === "status") {
    events.push({ kind: "effect", side, effect: "taunt-block", move: move.name });
    return;
  }

  // PP is only spent on the first turn of a locked or two-turn move.
  const continuing = user.locked !== null || user.charging !== null;
  if (move !== STRUGGLE && !continuing) {
    move.ppLeft--;
    // Pressure: moves cost one more PP.
    if (st[other(side)].ability === "pressure" && st[other(side)].hp > 0 && move.ppLeft > 0) move.ppLeft--;
  }
  if (user.ability === "truant") user.loafing = true;
  if (move.volatile !== "protect") user.protectStreak = 0;
  const index = user.moves.indexOf(move);
  // Destiny Bond can't be used twice in a row.
  const repeatedBond = move.id === "destinybond" && user.lastMove !== null && user.moves[user.lastMove]?.id === "destinybond";
  user.lastMove = index >= 0 ? index : null;
  events.push({ kind: "move", side, move: move.name });
  if (repeatedBond) {
    events.push({ kind: "fail", side });
    return;
  }
  // Two-turn moves: this turn charges (unless the sun powers a Solar move up right away).
  if (CHARGE.has(move.id)) {
    const instant = (move.id === "solarbeam" || move.id === "solarblade") && weatherOf(st) === "sun";
    if (user.charging === null && !instant) {
      user.charging = index;
      events.push({ kind: "effect", side, effect: "charging", move: move.name });
      if (move.id === "meteorbeam") applyBoosts(st, side, { spa: 1 }, events);
      return;
    }
    user.charging = null;
  }

  if (move.id === "sleeptalk") {
    const callable = user.moves.filter((m) => !NO_SLEEP_TALK.has(m.id));
    if (user.status !== "slp" || callable.length === 0) {
      events.push({ kind: "fail", side });
      return;
    }
    const called = callable[Math.floor(rng() * callable.length)];
    events.push({ kind: "move", side, move: called.name });
    executeMove(st, side, called, rng, events, foeMovesLater, foeMove);
    return;
  }
  executeMove(st, side, move, rng, events, foeMovesLater, foeMove);
  // Explosion and the like: the user goes down whatever happened.
  if (SELF_KO.has(move.id) && user.hp > 0) {
    events.push({ kind: "hp-cost", side, amount: user.hp, hp: 0 });
    user.hp = 0;
  }
}

/** The move's effect, once the user got to use it. */
function executeMove(
  st: BattleState,
  side: Side,
  move: FighterMove,
  rng: Rng,
  events: BattleEvent[],
  foeMovesLater: boolean,
  foeMove: FighterMove | null,
) {
  const user = st[side];
  const foeSide = other(side);
  const foe = st[foeSide];
  const failed =
    // Focus Punch fails if the user was hit earlier this turn.
    (move.id === "focuspunch" && events.some((e) => (e.kind === "damage" || e.kind === "sub-damage") && e.side === side)) ||
    (FIRST_TURN_ONLY.has(move.id) && user.turnsActive > 0) ||
    // Sucker Punch only works if the target is about to attack.
    (move.id === "suckerpunch" && (!foeMovesLater || !foeMove || foeMove.category === "status"));
  if (failed) {
    events.push({ kind: "fail", side });
    user.locked = null;
    return;
  }
  if (performSpecial(st, side, move, rng, events)) return;

  const targetsFoe = move.category !== "status" || move.fixedDamage !== undefined || move.status || move.volatile === "confusion" ||
    move.volatile === "leechseed" || move.boosts?.target === "foe" || FOE_STATUS.has(move.id);
  if (targetsFoe && foe.hp <= 0) {
    events.push({ kind: "effect", side, effect: "no-target" });
    user.locked = null;
    return;
  }
  if (targetsFoe && foe.protected) {
    events.push({ kind: "protected", side: foeSide });
    user.locked = null;
    return;
  }
  const weather = weatherOf(st);
  // Prankster-boosted status moves don't work on Dark types.
  if (targetsFoe && user.ability === "prankster" && move.category === "status" && foe.types.includes("dark")) {
    events.push({ kind: "no-effect", side: foeSide });
    return;
  }
  // Weather Ball takes the weather's type at double power.
  const typed = move.id === "weatherball" && weather ? { ...move, type: WEATHER_BALL[weather], power: move.power * 2 } : move;
  const typeNow = moveType(user, typed);
  if (targetsFoe && absorbedBy(st, side, typed, typeNow, events)) {
    user.locked = null;
    return;
  }

  const accuracy = accuracyOf(st, side, move);
  if (accuracy < 1 && rng() >= accuracy) {
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
    if (targetsFoe && foe.substitute > 0 && !bypassesSub(move)) {
      events.push({ kind: "fail", side });
    } else if (FOE_STATUS.has(move.id)) {
      foeStatusMove(st, side, move, events);
    } else if (move.heal) {
      if (user.hp >= user.maxHp) events.push({ kind: "fail", side });
      else heal(st, side, Math.floor((user.maxHp * move.heal[0]) / move.heal[1]), events);
    } else if (move.boosts) {
      applyBoosts(st, move.boosts.target === "self" ? side : foeSide, move.boosts.stats, events, side);
    } else if (move.status) {
      tryStatus(st, foeSide, move.status, rng, events, true, side);
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
      else if (foe.ability === "owntempo" && !MOLD_BREAKERS.has(user.ability)) {
        reveal(st, foeSide, events);
        events.push({ kind: "no-effect", side: foeSide });
      } else confuse(foe, foeSide, rng, events, false);
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

  const eff = typeNow === "typeless" ? 1 : effectivenessAgainst(user, typeNow, foe);
  if (eff === 0) {
    events.push({ kind: "no-effect", side: foeSide });
    user.locked = null;
    return;
  }
  // Counter, Mirror Coat...: the damage taken this turn, returned.
  let fixed: number | null = null;
  if (move.id in COUNTERS) {
    const [category, multiplier] = COUNTERS[move.id];
    const taken = user.hurtBy;
    if (!taken || (category && taken.category !== category)) {
      events.push({ kind: "fail", side });
      return;
    }
    fixed = Math.max(1, Math.floor(taken.amount * multiplier));
  }
  if (move.id === "finalgambit") fixed = user.hp;
  const power = variablePower(st, side, typed, eff, events, rng);
  const hit = power === typed.power ? typed : { ...typed, power };
  if (SCREEN_BREAKERS.has(move.id)) {
    const field = st.field[foeSide];
    if (field.reflect || field.lightScreen || field.auroraVeil) {
      Object.assign(field, { reflect: 0, lightScreen: 0, auroraVeil: 0 });
      events.push({ kind: "effect", side: foeSide, effect: "screens-broken" });
    }
  }

  const hits = user.ability === "skilllink" && Array.isArray(move.multihit) ? move.multihit[1] : hitCount(move, rng);
  // Infiltrator gets past a Substitute too.
  const throughSub = bypassesSub(move) || user.ability === "infiltrator";
  const moldBreaker = MOLD_BREAKERS.has(user.ability);
  const fullBefore = foe.hp >= foe.maxHp;
  const hpBefore = foe.hp;
  let endured = false;
  let busted = false;
  let total = 0;
  let toBody = 0;
  let crit = false;
  let landed = 0;
  let subCrit = false;
  let hitSub = false;
  let broke = false;
  for (let i = 0; i < hits && foe.hp > 0; i++) {
    let damage: number;
    let isCrit = false;
    if (fixed !== null) {
      damage = fixed;
    } else if (HALF_HP.has(move.id)) {
      damage = Math.max(1, Math.floor(foe.hp / 2));
    } else if (move.fixedDamage !== undefined) {
      damage = move.fixedDamage === "level" ? user.level : move.fixedDamage;
    } else {
      // Triple Axel / Triple Kick get stronger with each hit.
      const step = ESCALATING.has(move.id) ? { ...hit, power: hit.power * (i + 1) } : hit;
      isCrit = rng() < critFor(user, foe, move);
      damage = calcDamage(user, foe, step, rng, isCrit, modsFor(st, foeSide, step, events));
    }
    if (foe.substitute > 0 && !throughSub) {
      // (the Substitute takes it below)
    } else if (foe.disguised && !moldBreaker && (foe.ability === "disguise" || hit.category === "physical")) {
      // Disguise / Ice Face takes the first hit for it.
      foe.disguised = false;
      busted = true;
      damage = 0;
    } else if (foe.ability === "sturdy" && !moldBreaker && fullBefore && damage >= foe.hp && foe.hp === hpBefore) {
      // Sturdy: a hit from full HP leaves it at 1.
      damage = foe.hp - 1;
      endured = true;
    }
    if (foe.substitute > 0 && !throughSub) {
      // The Substitute takes the hit (and only as much as it has left).
      damage = Math.min(damage, foe.substitute);
      foe.substitute -= damage;
      hitSub = true;
      subCrit ||= isCrit;
      if (foe.substitute === 0) broke = true;
    } else {
      damage = Math.min(damage, foe.hp);
      foe.hp -= damage;
      toBody += damage;
      crit ||= isCrit;
      landed++;
    }
    total += damage;
  }
  if (toBody > 0) {
    foe.hurtBy = { amount: toBody, category: hit.category };
    foe.timesHit += landed;
  }
  const shownEff = move.fixedDamage !== undefined || HALF_HP.has(move.id) || fixed !== null ? 1 : eff;
  if (hitSub) events.push({ kind: "sub-damage", side: foeSide, effectiveness: shownEff, crit: subCrit, broke });
  if (landed > 0 || !hitSub) {
    events.push({ kind: "damage", side: foeSide, amount: toBody, hp: foe.hp, effectiveness: shownEff, crit, hits: landed });
  }
  if (busted) {
    reveal(st, foeSide, events);
    events.push({ kind: "effect", side: foeSide, effect: "disguise" });
    if (foe.ability === "disguise") hurt(st, foeSide, foe.maxHp / 8, "disguise", events);
  }
  if (endured) {
    reveal(st, foeSide, events);
    events.push({ kind: "effect", side: foeSide, effect: "sturdy" });
  }
  // Moxie, Beast Boost...: a knockout powers the user up.
  if (foe.hp <= 0 && user.hp > 0 && ON_KO[user.ability]) {
    const stat = ON_KO[user.ability];
    const best = stat === "best" ? STATS.reduce((a, b) => (user.stats[b] > user.stats[a] ? b : a)) : stat;
    reveal(st, side, events);
    applyBoosts(st, side, { [best]: 1 }, events);
  }
  // Destiny Bond: knocking it out takes the attacker down too.
  if (foe.hp <= 0 && foe.destinyBond && user.hp > 0) {
    const amount = user.hp;
    user.hp = 0;
    events.push({ kind: "hurt", side, amount, hp: 0, cause: "destiny-bond" });
  }

  if (move.drain && total > 0) {
    const amount = Math.floor((total * move.drain[0]) / move.drain[1]);
    // Liquid Ooze hurts whoever drains it.
    if (foe.ability === "liquidooze") {
      reveal(st, foeSide, events);
      hurt(st, side, amount, "liquid-ooze", events);
    } else heal(st, side, amount, events);
  }
  const recoil =
    move === STRUGGLE ? Math.floor(user.maxHp / 4) : move.recoil ? Math.floor((total * move.recoil[0]) / move.recoil[1]) : 0;
  const noRecoil = move !== STRUGGLE && (user.ability === "rockhead" || !indirectOk(user));
  if ((recoil > 0 || move.recoil) && user.hp > 0 && !noRecoil) {
    const amount = Math.min(user.hp, Math.max(1, recoil));
    user.hp -= amount;
    events.push({ kind: "recoil", side, amount, hp: user.hp });
  }
  if (move.selfBoosts && user.hp > 0) applyBoosts(st, side, move.selfBoosts, events);

  // Sheer Force trades the extra effects for power; Serene Grace doubles their odds; Shield Dust keeps them off the target.
  const secondaries = user.ability === "sheerforce" ? [] : (move.secondary ?? []);
  const shielded = foe.ability === "shielddust" && !moldBreaker;
  for (const sec of secondaries) {
    if (rng() * 100 >= sec.chance * (user.ability === "serenegrace" ? 2 : 1)) continue;
    // A Substitute shields the target from the move's extra effects.
    const reaches = foe.hp > 0 && !hitSub && !shielded;
    if (sec.status && reaches) tryStatus(st, foeSide, sec.status, rng, events, false, side);
    if (sec.boosts && reaches) applyBoosts(st, foeSide, sec.boosts, events, side);
    if (sec.selfBoosts && user.hp > 0) applyBoosts(st, side, sec.selfBoosts, events);
    // Flinching only matters if the foe hasn't moved yet this turn.
    if (sec.volatile === "flinch" && foeMovesLater && !hitSub && !shielded && (foe.ability !== "innerfocus" || moldBreaker)) foe.flinched = true;
    if (sec.volatile === "confusion" && reaches && foe.confusion === 0 && (foe.ability !== "owntempo" || moldBreaker)) confuse(foe, foeSide, rng, events, false);
  }

  if (landed > 0 && !hitSub) onHitAbilities(st, side, hit, typeNow, hpBefore, rng, events);
  afterHit(st, side, move, hitSub, rng, events);

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

/**
 * The target's ability stopping the move (Levitate, Volt Absorb, Flash
 * Fire...). Handles what it does instead and returns true if the move stops.
 */
function absorbedBy(st: BattleState, side: Side, move: FighterMove, type: string, events: BattleEvent[]): boolean {
  const user = st[side];
  const foeSide = other(side);
  const foe = st[foeSide];
  const eff = type === "typeless" ? 1 : effectivenessAgainst(user, type, foe);
  const block = abilityBlock(user, foe, move, priorityOf(user, move), eff);
  if (!block) return false;
  reveal(st, foeSide, events);
  if (block.kind === "heal") {
    if (foe.hp < foe.maxHp) heal(st, foeSide, Math.floor(foe.maxHp / 4), events);
    else events.push({ kind: "no-effect", side: foeSide });
  } else if (block.kind === "boost") {
    applyBoosts(st, foeSide, { [block.stat]: block.amount }, events);
  } else if (block.kind === "flashfire") {
    foe.flashFire = true;
    events.push({ kind: "effect", side: foeSide, effect: "flash-fire" });
  } else {
    events.push({ kind: "no-effect", side: foeSide });
  }
  return true;
}

/** Accuracy with the weather and abilities (No Guard always hits, Compound Eyes +30%, Hustle −20% on physical moves). */
function accuracyOf(st: BattleState, side: Side, move: FighterMove): number {
  const user = st[side];
  if (user.ability === "noguard" || st[other(side)].ability === "noguard") return 1;
  let accuracy = weatherAccuracy(move, weatherOf(st));
  if (accuracy >= 1) return 1;
  if (user.ability === "compoundeyes") accuracy *= 1.3;
  if (user.ability === "hustle" && move.category === "physical") accuracy *= 0.8;
  return Math.min(1, accuracy);
}

/** Abilities that react to a hit landing: contact punishment, the target's reactions, Poison Touch. */
function onHitAbilities(st: BattleState, side: Side, move: FighterMove, type: string, hpBefore: number, rng: Rng, events: BattleEvent[]) {
  const user = st[side];
  const foeSide = other(side);
  const foe = st[foeSide];
  const contact = !!move.flags?.includes("contact");
  if (contact && user.hp > 0) {
    const status = CONTACT_STATUS[foe.ability];
    if (status && rng() < 0.3 && canInflict(status, user) && !statusBlocked(user, status, weatherOf(st))) {
      reveal(st, foeSide, events);
      tryStatus(st, side, status, rng, events, false, foeSide);
    }
    if (foe.ability === "effectspore" && rng() < 0.3 && !user.types.includes("grass") && user.ability !== "overcoat") {
      const roll = rng();
      const spore = roll < 1 / 3 ? "psn" : roll < 2 / 3 ? "par" : "slp";
      if (canInflict(spore, user)) {
        reveal(st, foeSide, events);
        tryStatus(st, side, spore, rng, events, false, foeSide);
      }
    }
    if (foe.ability === "roughskin" || foe.ability === "ironbarbs") {
      reveal(st, foeSide, events);
      hurt(st, side, user.maxHp / 8, "contact", events);
    }
    if ((foe.ability === "gooey" || foe.ability === "tanglinghair") && user.hp > 0) {
      reveal(st, foeSide, events);
      applyBoosts(st, side, { spe: -1 }, events, foeSide);
    }
    if (foe.ability === "aftermath" && foe.hp <= 0) {
      reveal(st, foeSide, events);
      hurt(st, side, user.maxHp / 4, "aftermath", events);
    }
    if (user.ability === "poisontouch" && foe.hp > 0 && rng() < 0.3 && canInflict("psn", foe)) {
      reveal(st, side, events);
      tryStatus(st, foeSide, "psn", rng, events, false, side);
    }
  }
  if (user.ability === "toxicchain" && foe.hp > 0 && rng() < 0.3 && canInflict("tox", foe)) {
    reveal(st, side, events);
    tryStatus(st, foeSide, "tox", rng, events, false, side);
  }
  if (foe.hp <= 0) return;
  const react = (boosts: Boosts) => {
    reveal(st, foeSide, events);
    applyBoosts(st, foeSide, boosts, events);
  };
  switch (foe.ability) {
    case "weakarmor":
      if (move.category === "physical") react({ def: -1, spe: 2 });
      break;
    case "stamina":
      react({ def: 1 });
      break;
    case "justified":
      if (type === "dark") react({ atk: 1 });
      break;
    case "thermalexchange":
      if (type === "fire") react({ atk: 1 });
      break;
    case "steamengine":
      if (type === "fire" || type === "water") react({ spe: 6 });
      break;
    case "berserk":
      if (hpBefore * 2 > foe.maxHp && foe.hp * 2 <= foe.maxHp) react({ spa: 1 });
      break;
    case "angershell":
      if (hpBefore * 2 > foe.maxHp && foe.hp * 2 <= foe.maxHp) react({ atk: 1, spa: 1, spe: 1, def: -1, spd: -1 });
      break;
    case "toxicdebris":
      if (move.category === "physical" && st.field[side].toxicSpikes < 2) {
        reveal(st, foeSide, events);
        st.field[side].toxicSpikes++;
        events.push({ kind: "effect", side, effect: "toxic-spikes" });
      }
      break;
  }
}

/** Moves that switch the user out afterwards. */
export const PIVOTS = new Set(["uturn", "voltswitch", "flipturn", "partingshot", "chillyreception", "teleport"]);

/** Whether `side` can pivot out (it's still standing and has someone to send in). */
const canPivot = (st: BattleState, side: Side) => st[side].hp > 0 && st.bench[side].some((f) => f.hp > 0);

/** Pauses the turn after this move so `side` can pick who comes in (the plan is filled in by `continueTurn`). */
function requestPivot(st: BattleState, side: Side) {
  if (canPivot(st, side) && !st.winner) st.pending = { side, plan: null as unknown as TurnPlan };
}

/** Hit 2 is twice as strong as hit 1, hit 3 three times. */
const ESCALATING = new Set(["tripleaxel", "triplekick"]);

/** Low Kick / Grass Knot: power from the target's weight (kg). */
const weightPower = (kg: number) => (kg < 10 ? 20 : kg < 25 ? 40 : kg < 50 ? 60 : kg < 100 ? 80 : kg < 200 ? 100 : 120);
/** Heavy Slam / Heat Crash: power from how many times heavier the user is. */
const ratioPower = (ratio: number) => (ratio >= 5 ? 120 : ratio >= 4 ? 100 : ratio >= 3 ? 80 : ratio >= 2 ? 60 : 40);

/** Power of moves that depend only on the two Pokémon (also used by the AI). */
export function powerAgainst(move: FighterMove, user: Fighter, foe: Fighter): number {
  const p = move.power;
  switch (move.id) {
    case "eruption":
    case "waterspout":
    case "dragonenergy":
      return Math.max(1, Math.floor((150 * user.hp) / user.maxHp));
    case "facade":
      return user.status && user.status !== "slp" && user.status !== "frz" ? p * 2 : p;
    case "hex":
    case "infernalparade":
    case "bittermalice":
      return foe.status ? p * 2 : p;
    case "wakeupslap":
      return foe.status === "slp" ? p * 2 : p;
    case "smellingsalts":
      return foe.status === "par" ? p * 2 : p;
    case "lowkick":
    case "grassknot":
      return weightPower(foe.weight);
    case "heavyslam":
    case "heatcrash":
      return ratioPower(user.weight / Math.max(0.1, foe.weight));
    case "storedpower":
    case "powertrip":
      return 20 + 20 * Object.values(user.boosts).reduce((sum, b) => sum + Math.max(0, b), 0);
    case "ragefist":
      return Math.min(350, 50 + 50 * user.timesHit);
    case "brine":
      return foe.hp * 2 <= foe.maxHp ? p * 2 : p;
    default:
      return p;
  }
}

/** Moves whose power depends on the battle. */
function variablePower(st: BattleState, side: Side, move: FighterMove, eff: number, events: BattleEvent[], rng: Rng): number {
  const user = st[side];
  const foeSide = other(side);
  const p = move.power;
  switch (move.id) {
    case "lastrespects":
      return 50 + 50 * st.bench[side].filter((f) => f.hp <= 0).length;
    case "assurance":
      return events.some((e) => e.kind === "damage" && e.side === foeSide && e.amount > 0) ? p * 2 : p;
    case "avalanche":
    case "revenge":
      return user.hurtBy ? p * 2 : p;
    case "payback":
      return events.some((e) => e.kind === "move" && e.side === foeSide) ? p * 2 : p;
    case "stompingtantrum":
    case "temperflare":
      return user.moveFailed ? p * 2 : p;
    case "electrodrift":
    case "collisioncourse":
      return eff > 1 ? Math.floor((p * 5461) / 4096) : p;
    case "ficklebeam":
      return rng() < 0.3 ? p * 2 : p;
    default:
      return powerAgainst(move, user, st[foeSide]);
  }
}

/** Brick Break and Psychic Fangs shatter screens before they hit. */
const SCREEN_BREAKERS = new Set(["brickbreak", "psychicfangs", "ragingbull"]);
/** Damaging moves that drag the target out (Dragon Tail...). */
const DRAGGERS = new Set(["dragontail", "circlethrow"]);

/** Field effects of damaging moves, once they hit. */
function afterHit(st: BattleState, side: Side, move: FighterMove, hitSub: boolean, rng: Rng, events: BattleEvent[]) {
  const user = st[side];
  const foeSide = other(side);
  const foe = st[foeSide];
  if (foe.hp > 0 && !hitSub) {
    // Fire thaws a frozen target; Wake-Up Slap and Smelling Salts cure what they exploit.
    if (foe.status === "frz" && move.type === "fire") {
      foe.status = null;
      events.push({ kind: "effect", side: foeSide, effect: "thaw" });
    }
    if ((move.id === "wakeupslap" && foe.status === "slp") || (move.id === "smellingsalts" && foe.status === "par")) {
      foe.status = null;
      foe.sleepTurns = 0;
      events.push({ kind: move.id === "wakeupslap" ? "wake" : "cure", side: foeSide });
    }
    if (move.id === "clearsmog" && Object.values(foe.boosts).some((b) => b !== 0)) {
      foe.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      events.push({ kind: "effect", side: foeSide, effect: "stats-reset" });
    }
  }
  if ((move.id === "rapidspin" || move.id === "mortalspin") && user.hp > 0) {
    if (clearHazards(st.field[side])) events.push({ kind: "effect", side, effect: "hazards-gone" });
    user.seeded = false;
  }
  if (move.id === "ceaselessedge" && st.field[foeSide].spikes < 3) {
    st.field[foeSide].spikes++;
    events.push({ kind: "effect", side: foeSide, effect: "spikes" });
  }
  if (move.id === "stoneaxe" && !st.field[foeSide].stealthRock) {
    st.field[foeSide].stealthRock = true;
    events.push({ kind: "effect", side: foeSide, effect: "stealth-rock" });
  }
  if (DRAGGERS.has(move.id) && !hitSub && st[foeSide].hp > 0 && user.hp > 0) drag(st, foeSide, rng, events);
  if (PIVOTS.has(move.id)) requestPivot(st, side);
}

/** Removes the hazards on one side; true if there were any. */
function clearHazards(field: SideField): boolean {
  const had = field.stealthRock || field.spikes > 0 || field.toxicSpikes > 0 || field.stickyWeb;
  Object.assign(field, { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false });
  return had;
}

/** Forces a random healthy bench Pokémon in (Roar, Whirlwind, Dragon Tail). False if there is none. */
function drag(st: BattleState, side: Side, rng: Rng, events: BattleEvent[]): boolean {
  const options = st.bench[side].map((f, i) => ({ f, i })).filter(({ f }) => f.hp > 0);
  if (options.length === 0) return false;
  const { i } = options[Math.floor(rng() * options.length)];
  doSwitch(st, side, i, true, events, true);
  enterField(st, side, rng, events);
  return true;
}

/** What greets a Pokémon coming in: Healing Wish, then the hazards on its side. */
function enterField(st: BattleState, side: Side, rng: Rng, events: BattleEvent[]) {
  const f = st[side];
  const field = st.field[side];
  if (field.healingWish && (f.hp < f.maxHp || f.status)) {
    field.healingWish = false;
    events.push({ kind: "effect", side, effect: "healing-wish" });
    heal(st, side, f.maxHp, events);
    if (f.status) {
      f.status = null;
      f.sleepTurns = 0;
      f.toxicTurns = 0;
      events.push({ kind: "cure", side });
    }
  }
  // 1/8 of the max HP, scaled by how well Rock hits it.
  if (field.stealthRock && f.hp > 0) hurt(st, side, (f.maxHp * effectiveness("rock", f.types)) / 8, "stealthrock", events);
  if (grounded(f)) {
    if (field.spikes > 0 && f.hp > 0) hurt(st, side, f.maxHp / [8, 6, 4][field.spikes - 1], "spikes", events);
    if (field.toxicSpikes > 0 && f.hp > 0) {
      if (f.types.includes("poison")) {
        field.toxicSpikes = 0;
        events.push({ kind: "effect", side, effect: "toxic-spikes-absorbed" });
      } else {
        tryStatus(st, side, field.toxicSpikes >= 2 ? "tox" : "psn", rng, events, false);
      }
    }
    if (field.stickyWeb && f.hp > 0) {
      events.push({ kind: "effect", side, effect: "sticky-web-caught" });
      applyBoosts(st, side, { spe: -1 }, events, other(side));
    }
  }
  onEntry(st, side, events);
}

/** Abilities that can't be copied by Trace. */
const UNTRACEABLE = new Set(["trace", "imposter", "multitype", "disguise", "iceface", "illusion", "comatose", "zenmode", "powerconstruct", "schooling", "shieldsdown", "rkssystem", "commander", "zerotohero", "protosynthesis", "quarkdrive", ""]);

/** Abilities that act as the Pokémon comes in. */
function onEntry(st: BattleState, side: Side, events: BattleEvent[]) {
  const f = st[side];
  const foeSide = other(side);
  const foe = st[foeSide];
  if (f.hp <= 0) return;
  switch (f.ability) {
    case "intimidate":
      if (foe.hp <= 0) break;
      reveal(st, side, events);
      if (INTIMIDATE_PROOF.has(foe.ability)) {
        reveal(st, foeSide, events);
        if (foe.ability === "guarddog") applyBoosts(st, foeSide, { atk: 1 }, events);
        else events.push({ kind: "effect", side: foeSide, effect: "stats-protected" });
      } else {
        applyBoosts(st, foeSide, { atk: -1 }, events, side);
        if (foe.ability === "rattled") applyBoosts(st, foeSide, { spe: 1 }, events);
      }
      break;
    case "download": {
      if (foe.hp <= 0) break;
      // Raises Attack if the foe's Defense is the weaker side, Sp. Atk otherwise.
      const def = foe.stats.def * stageMultiplier(foe.boosts.def);
      const spd = foe.stats.spd * stageMultiplier(foe.boosts.spd);
      reveal(st, side, events);
      applyBoosts(st, side, def < spd ? { atk: 1 } : { spa: 1 }, events);
      break;
    }
    case "intrepidsword":
      reveal(st, side, events);
      applyBoosts(st, side, { atk: 1 }, events);
      break;
    case "dauntlessshield":
      reveal(st, side, events);
      applyBoosts(st, side, { def: 1 }, events);
      break;
    case "trace":
      if (foe.hp > 0 && !UNTRACEABLE.has(foe.ability)) {
        reveal(st, side, events);
        f.ability = foe.ability;
        f.abilityName = foe.abilityName;
        events.push({ kind: "effect", side, effect: "trace", move: foe.abilityName });
        onEntry(st, side, events);
      }
      break;
    case "imposter":
      if (foe.hp > 0 && foe.substitute === 0) {
        reveal(st, side, events);
        transform(st, side, events);
      }
      break;
    case "slowstart":
      f.slowStart = SLOW_START_TURNS;
      reveal(st, side, events);
      events.push({ kind: "effect", side, effect: "slow-start" });
      break;
    case "pressure":
      reveal(st, side, events);
      events.push({ kind: "effect", side, effect: "pressure" });
      break;
    case "airlock":
    case "cloudnine":
      if (st.weather) {
        reveal(st, side, events);
        events.push({ kind: "effect", side, effect: "weather-negated" });
      }
      break;
  }
  const weather = WEATHER_SETTERS[f.ability];
  if (weather && st.weather?.kind !== weather) {
    reveal(st, side, events);
    st.weather = { kind: weather, turns: WEATHER_TURNS };
    events.push({ kind: "weather", side, weather, ended: false });
  }
}

const SLOW_START_TURNS = 5;

/**
 * The leads' entry abilities (Intimidate, Drizzle...), the faster one first.
 * `runTurn` does this on the first turn if it wasn't done; the battle screen
 * calls it right away so the messages show before the first command.
 */
export function beginBattle(state: BattleState): { state: BattleState; events: BattleEvent[] } {
  const st: BattleState = structuredClone(state);
  const events: BattleEvent[] = [];
  startEntries(st, events);
  return { state: st, events };
}

function startEntries(st: BattleState, events: BattleEvent[]) {
  if (st.started) return;
  st.started = true;
  const weather = weatherOf(st);
  const order: Side[] = effectiveSpeed(st.b, weather) > effectiveSpeed(st.a, weather) ? ["b", "a"] : ["a", "b"];
  for (const side of order) onEntry(st, side, events);
}

function confuse(f: Fighter, side: Side, rng: Rng, events: BattleEvent[], fatigue: boolean) {
  // Lasts 1-4 turns after this one (the counter ticks before each move).
  f.confusion = 2 + Math.floor(rng() * 4);
  events.push({ kind: "confused", side, fatigue });
}

/** Status moves aimed at the foe with their own rules (it already got past Protect, accuracy and Substitute). */
function foeStatusMove(st: BattleState, side: Side, move: FighterMove, events: BattleEvent[]) {
  const user = st[side];
  const foeSide = other(side);
  const foe = st[foeSide];
  const fail = () => events.push({ kind: "fail", side });
  // Oblivious and Aroma Veil shrug off Taunt (and Aroma Veil Encore).
  const guarded = !MOLD_BREAKERS.has(user.ability) &&
    ((move.id === "taunt" && (foe.ability === "oblivious" || foe.ability === "aromaveil")) || (move.id === "encore" && foe.ability === "aromaveil"));
  if (guarded) {
    reveal(st, foeSide, events);
    events.push({ kind: "no-effect", side: foeSide });
    return;
  }
  switch (move.id) {
    case "taunt":
      if (foe.taunt > 0) return fail();
      foe.taunt = TAUNT_TURNS;
      events.push({ kind: "effect", side: foeSide, effect: "taunt" });
      return;
    case "encore": {
      const last = foe.lastMove === null ? null : foe.moves[foe.lastMove];
      if (!last || foe.encore || last.ppLeft <= 0 || last.id === "encore" || last.id === "sleeptalk" || last.id === "transform") return fail();
      foe.encore = { index: foe.lastMove!, turns: ENCORE_TURNS };
      events.push({ kind: "effect", side: foeSide, effect: "encore" });
      return;
    }
    case "yawn":
      if (foe.status || foe.drowsy > 0 || statusBlocked(foe, "slp", weatherOf(st))) return fail();
      foe.drowsy = 2;
      events.push({ kind: "effect", side: foeSide, effect: "drowsy" });
      return;
    case "strengthsap": {
      // Heals as much as the foe's current Attack, then lowers it.
      if (foe.boosts.atk <= -6) return fail();
      const attack = Math.floor(foe.stats.atk * stageMultiplier(foe.boosts.atk));
      applyBoosts(st, foeSide, { atk: -1 }, events, side);
      if (user.hp < user.maxHp) heal(st, side, attack, events);
      return;
    }
    case "partingshot":
      // Lowers the foe's attacking stats, then the user switches out.
      applyBoosts(st, foeSide, { atk: -1, spa: -1 }, events, side);
      requestPivot(st, side);
      return;
    case "transform":
      if (!transform(st, side, events)) fail();
      return;
  }
}

/** Transform / Imposter: becomes a copy of the foe (types, stats, stages, moves with 5 PP). */
function transform(st: BattleState, side: Side, events: BattleEvent[]): boolean {
  const user = st[side];
  const foe = st[other(side)];
  if (user.transformed || foe.transformed || foe.hp <= 0) return false;
  user.transformed = { dexId: foe.dexId, types: user.types, stats: user.stats, moves: user.moves };
  user.types = [...foe.types];
  user.stats = { ...foe.stats };
  user.boosts = { ...foe.boosts };
  user.moves = foe.moves.map((m) => ({ ...m, pp: TRANSFORM_PP, ppLeft: TRANSFORM_PP }));
  user.lastMove = null;
  events.push({ kind: "transform", side, dexId: foe.dexId });
  return true;
}

const TAUNT_TURNS = 3;
const SCREEN_TURNS = 5;
const WEATHER_TURNS = 5;
/** Counts the turn it's set up on. */
const TRICK_ROOM_TURNS = 5;
const WEATHER_MOVES: Record<string, Weather> = { sunnyday: "sun", raindance: "rain", sandstorm: "sand", snowscape: "snow", hail: "snow" };
const ENCORE_TURNS = 3;
const MAGNET_RISE_TURNS = 5;
const TRANSFORM_PP = 5;

/** Status moves with their own rules that don't need to get past the foe. Returns true if handled. */
function performSpecial(st: BattleState, side: Side, move: FighterMove, rng: Rng, events: BattleEvent[]): boolean {
  const user = st[side];
  const foeSide = other(side);
  const foe = st[foeSide];
  const fail = () => events.push({ kind: "fail", side });
  switch (move.id) {
    case "rest":
      // Full heal, cures status, sleeps for 2 turns.
      if (user.hp >= user.maxHp) {
        fail();
      } else {
        heal(st, side, user.maxHp, events);
        user.status = "slp";
        user.sleepTurns = 2;
        user.toxicTurns = 0;
        user.drowsy = 0;
        events.push({ kind: "status", side, status: "slp" });
      }
      return true;
    case "painsplit": {
      const shared = Math.floor((user.hp + foe.hp) / 2);
      user.hp = Math.min(user.maxHp, shared);
      foe.hp = Math.min(foe.maxHp, shared);
      events.push({ kind: "pain-split", side, hp: { a: st.a.hp, b: st.b.hp } });
      return true;
    }
    case "bellydrum": {
      const cost = Math.floor(user.maxHp / 2);
      if (user.hp <= cost || user.boosts.atk >= 6) {
        fail();
      } else {
        user.hp -= cost;
        events.push({ kind: "hp-cost", side, amount: cost, hp: user.hp });
        applyBoosts(st, side, { atk: 12 }, events);
      }
      return true;
    }
    case "haze":
      for (const f of [user, foe]) f.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      events.push({ kind: "haze", side });
      return true;
    case "substitute": {
      // A decoy with 1/4 of the max HP, paid for with the user's own HP.
      const cost = Math.floor(user.maxHp / 4);
      if (user.substitute > 0) {
        events.push({ kind: "effect", side, effect: "substitute-fail" });
      } else if (user.hp <= cost) {
        fail();
      } else {
        user.hp -= cost;
        user.substitute = cost;
        events.push({ kind: "hp-cost", side, amount: cost, hp: user.hp });
        events.push({ kind: "effect", side, effect: "substitute" });
      }
      return true;
    }
    case "synthesis":
    case "moonlight":
    case "morningsun":
    case "shoreup": {
      // Sun makes the plant/moon heals stronger and other weather weaker; sand powers Shore Up.
      const w = weatherOf(st);
      const fraction = move.id === "shoreup" ? (w === "sand" ? 2 / 3 : 1 / 2) : w === "sun" ? 2 / 3 : w ? 1 / 4 : 1 / 2;
      if (user.hp >= user.maxHp) fail();
      else heal(st, side, Math.floor(user.maxHp * fraction), events);
      return true;
    }
    case "stealthrock":
    case "spikes":
    case "toxicspikes":
    case "stickyweb": {
      const field = st.field[foeSide];
      const effect = ({ stealthrock: "stealth-rock", spikes: "spikes", toxicspikes: "toxic-spikes", stickyweb: "sticky-web" } as const)[move.id];
      const full =
        move.id === "stealthrock" ? field.stealthRock : move.id === "spikes" ? field.spikes >= 3 : move.id === "toxicspikes" ? field.toxicSpikes >= 2 : field.stickyWeb;
      if (full) return fail(), true;
      if (move.id === "stealthrock") field.stealthRock = true;
      else if (move.id === "spikes") field.spikes++;
      else if (move.id === "toxicspikes") field.toxicSpikes++;
      else field.stickyWeb = true;
      events.push({ kind: "effect", side: foeSide, effect });
      return true;
    }
    case "defog": {
      // Clears hazards on both sides and the foe's screens.
      const foeField = st.field[foeSide];
      const screens = foeField.reflect || foeField.lightScreen || foeField.auroraVeil;
      Object.assign(foeField, { reflect: 0, lightScreen: 0, auroraVeil: 0 });
      const cleared = [clearHazards(st.field[side]), clearHazards(foeField)].some(Boolean);
      if (cleared || screens) events.push({ kind: "effect", side, effect: "hazards-gone" });
      else fail();
      return true;
    }
    case "reflect":
    case "lightscreen":
    case "auroraveil": {
      const field = st.field[side];
      const key = move.id === "reflect" ? "reflect" : move.id === "lightscreen" ? "lightScreen" : "auroraVeil";
      // Aurora Veil only works in snow.
      if (field[key] > 0 || (move.id === "auroraveil" && weatherOf(st) !== "snow")) return fail(), true;
      field[key] = SCREEN_TURNS;
      events.push({ kind: "effect", side, effect: move.id === "reflect" ? "reflect" : move.id === "lightscreen" ? "light-screen" : "aurora-veil" });
      return true;
    }
    case "wish":
      if (st.field[side].wish) return fail(), true;
      st.field[side].wish = { turns: 2, hp: Math.floor(user.maxHp / 2) };
      events.push({ kind: "effect", side, effect: "wish" });
      return true;
    case "healingwish":
    case "lunardance":
      // The user faints so the next Pokémon comes in fully healed.
      if (!st.bench[side].some((f) => f.hp > 0)) return fail(), true;
      events.push({ kind: "hp-cost", side, amount: user.hp, hp: 0 });
      user.hp = 0;
      st.field[side].healingWish = true;
      return true;
    case "roar":
    case "whirlwind":
      if (!drag(st, foeSide, rng, events)) fail();
      return true;
    case "teleport":
      if (!canPivot(st, side)) fail();
      else requestPivot(st, side);
      return true;
    case "chillyreception":
      // Snow, then the user switches out.
      if (st.weather?.kind !== "snow") {
        st.weather = { kind: "snow", turns: WEATHER_TURNS };
        events.push({ kind: "weather", side, weather: "snow", ended: false });
      }
      requestPivot(st, side);
      return true;
    case "trickroom":
      if (st.trickRoom > 0) {
        st.trickRoom = 0;
        events.push({ kind: "effect", side, effect: "trick-room-end" });
      } else {
        st.trickRoom = TRICK_ROOM_TURNS;
        events.push({ kind: "effect", side, effect: "trick-room" });
      }
      return true;
    case "sunnyday":
    case "raindance":
    case "sandstorm":
    case "snowscape":
    case "hail": {
      const kind = WEATHER_MOVES[move.id];
      if (st.weather?.kind === kind) return fail(), true;
      st.weather = { kind, turns: WEATHER_TURNS };
      events.push({ kind: "weather", side, weather: kind, ended: false });
      return true;
    }
    case "healbell":
    case "aromatherapy": {
      events.push({ kind: "effect", side, effect: "heal-bell" });
      for (const f of st.bench[side]) if (f.hp > 0) f.status = null;
      if (user.status) {
        user.status = null;
        user.sleepTurns = 0;
        user.toxicTurns = 0;
        events.push({ kind: "cure", side });
      }
      return true;
    }
    case "takeheart":
      if (user.status) {
        user.status = null;
        user.sleepTurns = 0;
        user.toxicTurns = 0;
        events.push({ kind: "cure", side });
      }
      applyBoosts(st, side, { spa: 1, spd: 1 }, events);
      return true;
    case "tidyup": {
      // Clears hazards on both sides and every Substitute.
      const hazards = [clearHazards(st.field.a), clearHazards(st.field.b)].some(Boolean);
      if (hazards || user.substitute > 0 || foe.substitute > 0) {
        user.substitute = 0;
        foe.substitute = 0;
        events.push({ kind: "effect", side, effect: "tidy-up" });
      }
      applyBoosts(st, side, { atk: 1, spe: 1 }, events);
      return true;
    }
    case "destinybond":
      user.destinyBond = true;
      events.push({ kind: "effect", side, effect: "destiny-bond" });
      return true;
    case "magnetrise":
      if (user.magnetRise > 0) fail();
      else {
        user.magnetRise = MAGNET_RISE_TURNS;
        events.push({ kind: "effect", side, effect: "magnet-rise" });
      }
      return true;
    case "curse":
      if (user.types.includes("ghost")) {
        // Halves the user's HP to lay a curse on the foe.
        if (foe.cursed) {
          fail();
        } else {
          const cost = Math.min(user.hp, Math.floor(user.maxHp / 2));
          user.hp -= cost;
          foe.cursed = true;
          events.push({ kind: "hp-cost", side, amount: cost, hp: user.hp });
          events.push({ kind: "effect", side: foeSide, effect: "cursed" });
        }
      } else {
        applyBoosts(st, side, { atk: 1, def: 1, spe: -1 }, events);
      }
      return true;
    case "revivalblessing": {
      // Brings back the first fainted teammate with half its HP.
      const fallen = st.bench[side].find((f) => f.hp <= 0);
      if (!fallen) {
        fail();
      } else {
        fallen.hp = Math.floor(fallen.maxHp / 2);
        fallen.status = null;
        fallen.down = false;
        events.push({ kind: "revive", side, name: fallen.name });
      }
      return true;
    }
  }
  return false;
}

/** Burn 1/16, poison 1/8, bad poison n/16, Leech Seed 1/8, Curse 1/4 at the end of the turn. */
function residual(st: BattleState, side: Side, events: BattleEvent[]) {
  const f = st[side];
  const healer = st[other(side)];
  if (f.hp > 0 && f.seeded && healer.hp > 0 && indirectOk(f)) {
    const amount = Math.min(f.hp, Math.max(1, Math.floor(f.maxHp / 8)));
    f.hp -= amount;
    healer.hp = Math.min(healer.maxHp, healer.hp + amount);
    events.push({ kind: "leech", side, amount, hp: f.hp, healerHp: healer.hp });
  }
  // Poison Heal: poison restores 1/8 instead.
  if (f.hp > 0 && f.ability === "poisonheal" && (f.status === "psn" || f.status === "tox")) {
    if (f.hp < f.maxHp) {
      reveal(st, side, events);
      heal(st, side, f.maxHp / 8, events);
    }
  } else if (f.hp > 0 && indirectOk(f) && (f.status === "brn" || f.status === "psn" || f.status === "tox")) {
    let fraction = f.status === "brn" ? 1 / 16 : f.status === "psn" ? 1 / 8 : 0;
    if (f.status === "tox") {
      f.toxicTurns++;
      fraction = f.toxicTurns / 16;
    }
    const amount = Math.min(f.hp, Math.max(1, Math.floor(f.maxHp * fraction)));
    f.hp -= amount;
    events.push({ kind: "residual", side, status: f.status, amount, hp: f.hp });
  }
  if (f.hp > 0 && f.cursed) hurt(st, side, f.maxHp / 4, "curse", events);
}

/** End-of-turn abilities. `fresh`: it came in this turn (Speed Boost waits a turn). */
function abilityEndOfTurn(st: BattleState, side: Side, fresh: boolean, rng: Rng, events: BattleEvent[]) {
  const f = st[side];
  const foe = st[other(side)];
  if (f.hp <= 0) return;
  const weather = weatherOf(st);
  const cure = () => {
    reveal(st, side, events);
    f.status = null;
    f.sleepTurns = 0;
    f.toxicTurns = 0;
    events.push({ kind: "cure", side });
  };
  switch (f.ability) {
    case "speedboost":
      if (!fresh && f.boosts.spe < 6) {
        reveal(st, side, events);
        applyBoosts(st, side, { spe: 1 }, events);
      }
      break;
    case "shedskin":
      if (f.status && rng() < 0.3) cure();
      break;
    case "hydration":
      if (f.status && weather === "rain") cure();
      break;
    case "raindish":
    case "icebody":
      if (f.hp < f.maxHp && weather === (f.ability === "raindish" ? "rain" : "snow")) {
        reveal(st, side, events);
        heal(st, side, f.maxHp / 16, events);
      }
      break;
    case "dryskin":
      if (weather === "rain" && f.hp < f.maxHp) {
        reveal(st, side, events);
        heal(st, side, f.maxHp / 8, events);
      } else if (weather === "sun") {
        reveal(st, side, events);
        hurt(st, side, f.maxHp / 8, "sun", events);
      }
      break;
    case "solarpower":
      if (weather === "sun") {
        reveal(st, side, events);
        hurt(st, side, f.maxHp / 8, "sun", events);
      }
      break;
    case "baddreams":
      if (foe.hp > 0 && foe.status === "slp") {
        reveal(st, side, events);
        hurt(st, other(side), foe.maxHp / 8, "bad-dreams", events);
      }
      break;
    case "slowstart":
      if (f.slowStart > 0 && --f.slowStart === 0) events.push({ kind: "effect", side, effect: "slow-start-end" });
      break;
    case "moody": {
      // +2 to a random stat, −1 to another.
      const up = STATS.filter((s) => f.boosts[s] < 6);
      if (up.length === 0) break;
      const raised = up[Math.floor(rng() * up.length)];
      const down = STATS.filter((s) => s !== raised && f.boosts[s] > -6);
      reveal(st, side, events);
      applyBoosts(st, side, down.length ? { [raised]: 2, [down[Math.floor(rng() * down.length)]]: -1 } : { [raised]: 2 }, events);
      break;
    }
  }
}

const SAND_PROOF = new Set(["overcoat", "sandveil", "sandrush", "sandforce"]);

/** Sandstorm hurts everything but Rock, Ground and Steel types (1/16). */
function weatherDamage(st: BattleState, side: Side, events: BattleEvent[]) {
  const f = st[side];
  if (weatherOf(st) !== "sand" || f.hp <= 0 || f.types.some((t) => t === "rock" || t === "ground" || t === "steel")) return;
  if (SAND_PROOF.has(f.ability)) return;
  hurt(st, side, f.maxHp / 16, "sandstorm", events);
}

function wish(st: BattleState, side: Side, events: BattleEvent[]) {
  const pending = st.field[side].wish;
  if (!pending || --pending.turns > 0) return;
  st.field[side].wish = null;
  const f = st[side];
  if (f.hp <= 0) return;
  events.push({ kind: "effect", side, effect: "wish-came-true" });
  if (f.hp < f.maxHp) heal(st, side, pending.hp, events);
}

/** Weather, screens and Trick Room wear off. */
function fieldCountdowns(st: BattleState, events: BattleEvent[]) {
  if (st.weather && --st.weather.turns <= 0) {
    events.push({ kind: "weather", side: "a", weather: st.weather.kind, ended: true });
    st.weather = null;
  }
  for (const side of ["a", "b"] as Side[]) {
    const field = st.field[side];
    if (field.reflect > 0 && --field.reflect === 0) events.push({ kind: "effect", side, effect: "reflect-end" });
    if (field.lightScreen > 0 && --field.lightScreen === 0) events.push({ kind: "effect", side, effect: "light-screen-end" });
    if (field.auroraVeil > 0 && --field.auroraVeil === 0) events.push({ kind: "effect", side, effect: "aurora-veil-end" });
  }
  if (st.trickRoom > 0 && --st.trickRoom === 0) events.push({ kind: "effect", side: "a", effect: "trick-room-end" });
}

/** Effects that wear off or kick in at the very end of the turn. */
function countdowns(st: BattleState, side: Side, rng: Rng, events: BattleEvent[]) {
  const f = st[side];
  if (f.hp <= 0) return;
  if (f.taunt > 0 && --f.taunt === 0) events.push({ kind: "effect", side, effect: "taunt-end" });
  if (f.encore && (--f.encore.turns <= 0 || f.moves[f.encore.index].ppLeft <= 0)) {
    f.encore = null;
    events.push({ kind: "effect", side, effect: "encore-end" });
  }
  if (f.magnetRise > 0 && --f.magnetRise === 0) events.push({ kind: "effect", side, effect: "magnet-rise-end" });
  if (f.drowsy > 0 && --f.drowsy === 0) tryStatus(st, side, "slp", rng, events, false);
}

/** Records faints; returns true if the battle is over. */
function checkFaints(st: BattleState, events: BattleEvent[], order: Side[]): boolean {
  for (const side of order) {
    if (st[side].hp <= 0 && !st[side].down) {
      st[side].down = true;
      events.push({ kind: "faint", side });
      // A side with nobody left loses; if both run out, the one that fell last wins.
      if (remaining(st, side) === 0) st.winner = remaining(st, other(side)) > 0 ? other(side) : side;
    }
  }
  return st.winner !== null;
}

/** Swaps the active Pokémon with bench slot `index`. Leaving clears stat changes and volatile effects. */
function doSwitch(st: BattleState, side: Side, index: number, forced: boolean, events: BattleEvent[], dragged = false) {
  const out = st[side];
  const incoming = st.bench[side][index];
  if (out.hp > 0 && out.ability === "regenerator" && out.hp < out.maxHp) {
    reveal(st, side, events);
    heal(st, side, out.maxHp / 3, events);
  }
  if (out.hp > 0 && out.ability === "naturalcure" && out.status) {
    reveal(st, side, events);
    out.status = null;
    out.sleepTurns = 0;
    events.push({ kind: "cure", side });
  }
  if (out.transformed) Object.assign(out, { types: out.transformed.types, stats: out.transformed.stats, moves: out.transformed.moves });
  Object.assign(out, { ability: out.baseAbility.id, abilityName: out.baseAbility.name, flashFire: false, slowStart: 0, loafing: false });
  Object.assign(out, {
    boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    toxicTurns: 0,
    confusion: 0,
    locked: null,
    mustRecharge: false,
    seeded: false,
    protectStreak: 0,
    turnsActive: 0,
    substitute: 0,
    taunt: 0,
    encore: null,
    lastMove: null,
    drowsy: 0,
    destinyBond: false,
    cursed: false,
    magnetRise: 0,
    transformed: null,
    charging: null,
    hurtBy: null,
    moveFailed: false,
    protected: false,
    flinched: false,
  });
  st.bench[side][index] = out;
  st[side] = incoming;
  events.push({
    kind: "switch",
    side,
    from: out.name,
    to: incoming.name,
    dexId: incoming.dexId,
    hp: incoming.hp,
    maxHp: incoming.maxHp,
    status: incoming.status,
    forced,
    ...(dragged ? { dragged } : {}),
  });
}

/** Uses an item from the bag on the active Pokémon. */
function applyItem(st: BattleState, side: Side, item: ItemId, events: BattleEvent[]) {
  const f = st[side];
  st.bag[side][item]--;
  events.push({ kind: "item", side, item });
  if (item === "potion") {
    if (f.hp >= f.maxHp) events.push({ kind: "fail", side });
    else heal(st, side, POTION_HP, events);
  } else if (f.status || f.confusion > 0) {
    f.status = null;
    f.sleepTurns = 0;
    f.toxicTurns = 0;
    f.confusion = 0;
    events.push({ kind: "cure", side });
  } else {
    events.push({ kind: "fail", side });
  }
}

/**
 * Sends out bench slot `index` in place of a fainted Pokémon (between turns).
 * Doesn't mutate `state`.
 */
export function switchIn(state: BattleState, side: Side, index: number, rng: Rng = Math.random): { state: BattleState; events: BattleEvent[] } {
  const st: BattleState = structuredClone(state);
  const events: BattleEvent[] = [];
  if (st.bench[side][index]?.hp > 0) {
    doSwitch(st, side, index, true, events);
    // Hazards can knock the newcomer out before it does anything.
    enterField(st, side, rng, events);
    checkFaints(st, events, [side]);
  }
  return { state: st, events };
}

/** The choice as the engine will honor it: illegal switches and items fall back to the first move. */
function legalChoice(st: BattleState, side: Side, choice: Choice): Choice {
  if (typeof choice === "number") return choice;
  if ("switchTo" in choice) return canSwitch(st, side) && st.bench[side][choice.switchTo]?.hp > 0 ? choice : 0;
  return st[side].locked || st[side].mustRecharge || st[side].charging !== null || !(st.bag[side][choice.item] > 0) ? 0 : choice;
}

/**
 * Plays one turn. Each side picks a move index (Struggle if out of PP), a
 * switch or an item; switches and items go first (the faster side first),
 * then the moves. Fainted Pokémon must be replaced with `switchIn` before the
 * next turn, and a pivot pauses the turn until `resolvePivot`. Doesn't mutate
 * `state`.
 */
export function runTurn(state: BattleState, choiceA: Choice, choiceB: Choice, rng: Rng = Math.random): { state: BattleState; events: BattleEvent[] } {
  const st: BattleState = structuredClone(state);
  const events: BattleEvent[] = [];
  if (st.winner || st.pending) return { state: st, events };
  startEntries(st, events);

  for (const f of [st.a, st.b]) {
    f.protected = false;
    f.flinched = false;
    f.hurtBy = null;
  }
  const choices = { a: legalChoice(st, "a", choiceA), b: legalChoice(st, "b", choiceB) };
  // A locked-in Pokémon repeats its move whatever was chosen; an encored one repeats its last move.
  const pick = (f: Fighter, choice: Choice) =>
    f.locked
      ? f.moves[f.locked.index]
      : f.charging !== null
        ? f.moves[f.charging]
        : typeof choice === "number"
          ? resolveMove(f, f.encore ? f.encore.index : choice)
          : null;
  const moves = { a: pick(st.a, choices.a), b: pick(st.b, choices.b) };

  // Switches and items: before any move, the faster side first.
  const weather = weatherOf(st);
  const speedOrder: Side[] = effectiveSpeed(st.b, weather) > effectiveSpeed(st.a, weather) ? ["b", "a"] : ["a", "b"];
  const fresh: Side[] = [];
  for (const side of speedOrder) {
    const choice = choices[side];
    if (typeof choice === "number") continue;
    if ("switchTo" in choice) {
      doSwitch(st, side, choice.switchTo, false, events);
      enterField(st, side, rng, events);
      fresh.push(side);
    } else {
      applyItem(st, side, choice.item, events);
    }
  }

  if (checkFaints(st, events, speedOrder)) return { state: st, events };

  const movers = (["a", "b"] as Side[]).filter((side) => moves[side]);
  const order = movers.length === 2 ? turnOrder(st, moves.a!, moves.b!, rng) : movers;
  const indexOf = (side: Side) => {
    const m = moves[side];
    return m ? (m === STRUGGLE ? -1 : st[side].moves.indexOf(m)) : null;
  };
  return continueTurn(st, { order, moves: { a: indexOf("a"), b: indexOf("b") }, next: 0, fresh, speedOrder }, rng, events);
}

/** The moves from `plan.next` on, then the end of the turn. Pauses again on a pivot. */
function continueTurn(st: BattleState, plan: TurnPlan, rng: Rng, events: BattleEvent[]): { state: BattleState; events: BattleEvent[] } {
  const moveOf = (side: Side) => {
    const index = plan.moves[side];
    return index === null ? null : index < 0 ? STRUGGLE : st[side].moves[index];
  };
  for (let i = plan.next; i < plan.order.length; i++) {
    const side = plan.order[i];
    // Fainted, or dragged out / switched in earlier this turn: no move.
    if (st[side].hp <= 0 || plan.fresh.includes(side) || events.some((e) => e.kind === "switch" && e.side === side)) continue;
    const foeMovesLater = i === 0 && plan.order.length === 2;
    performMove(st, side, moveOf(side)!, rng, events, foeMovesLater, moveOf(other(side)));
    if (checkFaints(st, events, [other(side), side])) {
      st.pending = null;
      return { state: st, events };
    }
    if (st.pending) {
      st.pending.plan = { ...plan, next: i + 1, fresh: [...plan.fresh, ...switchedThisTurn(events)] };
      return { state: st, events };
    }
  }
  const endOrder = plan.order.length === 2 ? plan.order : plan.speedOrder;
  for (const side of endOrder) weatherDamage(st, side, events);
  for (const side of endOrder) wish(st, side, events);
  for (const side of endOrder) residual(st, side, events);
  const fresh = [...plan.fresh, ...switchedThisTurn(events)];
  for (const side of endOrder) abilityEndOfTurn(st, side, fresh.includes(side), rng, events);
  if (!checkFaints(st, events, endOrder)) {
    for (const side of endOrder) countdowns(st, side, rng, events);
    fieldCountdowns(st, events);
  }
  // A Pokémon that came in this turn hasn't had its first turn yet (Fake Out still works).
  for (const side of ["a", "b"] as Side[]) if (!fresh.includes(side)) st[side].turnsActive++;
  st.turn++;
  return { state: st, events };
}

const switchedThisTurn = (events: BattleEvent[]) => events.flatMap((e) => (e.kind === "switch" ? [e.side] : []));

/**
 * Finishes a turn paused by a pivot: the pivoting side sends out bench slot
 * `index`, then the rest of the turn plays. Doesn't mutate `state`.
 */
export function resolvePivot(state: BattleState, index: number, rng: Rng = Math.random): { state: BattleState; events: BattleEvent[] } {
  const st: BattleState = structuredClone(state);
  const events: BattleEvent[] = [];
  const pending = st.pending;
  if (!pending) return { state: st, events };
  st.pending = null;
  const slot = st.bench[pending.side][index]?.hp > 0 ? index : st.bench[pending.side].findIndex((f) => f.hp > 0);
  if (slot >= 0) {
    doSwitch(st, pending.side, slot, false, events);
    enterField(st, pending.side, rng, events);
    if (checkFaints(st, events, [pending.side])) return { state: st, events };
  }
  return continueTurn(st, { ...pending.plan, fresh: [...pending.plan.fresh, pending.side] }, rng, events);
}
