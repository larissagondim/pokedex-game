import { effectiveness } from "../typeChart.ts";
import type { StatName, Status } from "./types.ts";

/**
 * Abilities as pure rules: damage, speed and priority modifiers, immunities
 * and what each one blocks. The engine calls these and handles the triggered
 * ones (on entry, on contact, at the end of the turn) itself. Abilities are
 * ids ("hugepower"); an empty string is no ability.
 */

/** The ability fields of a fighter these rules read. */
export interface AbilityHolder {
  ability: string;
  types: string[];
  hp: number;
  maxHp: number;
  status: Status | null;
  stats: Record<StatName, number>;
  /** Flash Fire was triggered. */
  flashFire?: boolean;
  /** Turns of Slow Start left. */
  slowStart?: number;
  /** Booster Energy powered up Protosynthesis / Quark Drive. */
  boosterEnergy?: boolean;
}

export type Weather = "sun" | "rain" | "sand" | "snow";

/** What the rules need to know about the move. */
export interface MoveFacts {
  id: string;
  type: string;
  power: number;
  category: "physical" | "special" | "status";
  priority: number;
  flags?: string[];
  secondary?: unknown[];
  recoil?: unknown;
  heal?: unknown;
  drain?: unknown;
}

const has = (m: MoveFacts, flag: string) => !!m.flags?.includes(flag);

/** Mold Breaker and friends ignore the target's ability. */
export const MOLD_BREAKERS = new Set(["moldbreaker", "teravolt", "turboblaze", "myceliummight"]);

/** Air Lock and Cloud Nine switch the weather's effects off. */
export const WEATHER_NEGATORS = new Set(["airlock", "cloudnine"]);

/** Ability-made types: Pixilate turns Normal moves Fairy (and powers them up). */
const ATE: Record<string, string> = { aerilate: "flying", pixilate: "fairy", refrigerate: "ice", galvanize: "electric" };

/** The type the move really has once the user's ability is applied. */
export function moveType(user: Pick<AbilityHolder, "ability">, move: MoveFacts): string {
  if (move.type === "normal" && ATE[user.ability]) return ATE[user.ability];
  if (user.ability === "liquidvoice" && has(move, "sound")) return "water";
  if (user.ability === "normalize") return "normal";
  return move.type;
}

/** STAB multiplier (Adaptability doubles; Protean / Libero always get it). */
export function stab(user: AbilityHolder, type: string): number {
  // Protean / Libero turn the user into the move's type first.
  if (user.ability === "protean" || user.ability === "libero") return 1.5;
  if (!user.types.includes(type)) return 1;
  return user.ability === "adaptability" ? 2 : 1.5;
}

/** The stat Protosynthesis / Quark Drive raises right now, or null. */
export function paradoxStat(f: AbilityHolder, weather: Weather | null): StatName | null {
  const active =
    (f.ability === "protosynthesis" && (weather === "sun" || f.boosterEnergy)) || (f.ability === "quarkdrive" && f.boosterEnergy);
  if (!active) return null;
  let best: StatName = "atk";
  for (const s of ["def", "spa", "spd", "spe"] as StatName[]) if (f.stats[s] > f.stats[best]) best = s;
  return best;
}

const pinch = (f: AbilityHolder) => f.hp * 3 <= f.maxHp;

/** Multiplier on the move's base power from the user's ability (and a few of the target's). */
export function powerModifier(
  user: AbilityHolder,
  target: AbilityHolder,
  move: MoveFacts,
  ctx: { weather: Weather | null; ignoreTarget: boolean; movesLast?: boolean; targetFresh?: boolean; faintedAllies?: number },
): number {
  const type = moveType(user, move);
  let m = 1;
  switch (user.ability) {
    case "technician":
      if (move.power <= 60) m *= 1.5;
      break;
    case "ironfist":
      if (has(move, "punch")) m *= 1.2;
      break;
    case "strongjaw":
      if (has(move, "bite")) m *= 1.5;
      break;
    case "toughclaws":
      if (has(move, "contact")) m *= 1.3;
      break;
    case "megalauncher":
      if (has(move, "pulse")) m *= 1.5;
      break;
    case "sharpness":
      if (has(move, "slicing")) m *= 1.5;
      break;
    case "punkrock":
      if (has(move, "sound")) m *= 1.3;
      break;
    case "reckless":
      if (move.recoil) m *= 1.2;
      break;
    case "sheerforce":
      if (move.secondary?.length) m *= 1.3;
      break;
    case "aerilate":
    case "pixilate":
    case "refrigerate":
    case "galvanize":
      if (move.type === "normal") m *= 1.2;
      break;
    case "sandforce":
      if (ctx.weather === "sand" && (type === "rock" || type === "ground" || type === "steel")) m *= 1.3;
      break;
    case "analytic":
      if (ctx.movesLast) m *= 1.3;
      break;
    case "stakeout":
      if (ctx.targetFresh) m *= 2;
      break;
    case "supremeoverlord":
      m *= 1 + 0.1 * Math.min(5, ctx.faintedAllies ?? 0);
      break;
  }
  const pinchType: Record<string, string> = { blaze: "fire", torrent: "water", overgrow: "grass", swarm: "bug" };
  if (pinchType[user.ability] === type && pinch(user)) m *= 1.5;
  const typeBoost: Record<string, [string, number]> = {
    steelworker: ["steel", 1.5],
    steelyspirit: ["steel", 1.5],
    transistor: ["electric", 1.3],
    dragonsmaw: ["dragon", 1.5],
    rockypayload: ["rock", 1.5],
    waterbubble: ["water", 2],
  };
  if (typeBoost[user.ability]?.[0] === type) m *= typeBoost[user.ability][1];
  if (user.flashFire && type === "fire") m *= 1.5;
  if (!ctx.ignoreTarget) {
    if (target.ability === "heatproof" && type === "fire") m *= 0.5;
    if (target.ability === "dryskin" && type === "fire") m *= 1.25;
  }
  return m;
}

/** Multiplier on the attacking stat. */
export function attackModifier(user: AbilityHolder, target: AbilityHolder, move: MoveFacts, weather: Weather | null, ignoreTarget: boolean): number {
  const physical = move.category === "physical";
  const type = moveType(user, move);
  let m = 1;
  switch (user.ability) {
    case "hugepower":
    case "purepower":
      if (physical) m *= 2;
      break;
    case "guts":
      if (physical && user.status) m *= 1.5;
      break;
    case "hustle":
    case "gorillatactics":
      if (physical) m *= 1.5;
      break;
    case "solarpower":
      if (!physical && weather === "sun") m *= 1.5;
      break;
    case "defeatist":
      if (user.hp * 2 <= user.maxHp) m *= 0.5;
      break;
    case "slowstart":
      if (physical && (user.slowStart ?? 0) > 0) m *= 0.5;
      break;
    case "toxicboost":
      if (physical && (user.status === "psn" || user.status === "tox")) m *= 1.5;
      break;
    case "flareboost":
      if (!physical && user.status === "brn") m *= 1.5;
      break;
    case "orichalcumpulse":
      if (physical && weather === "sun") m *= 4 / 3;
      break;
    case "hadronengine":
      if (!physical) m *= 4 / 3;
      break;
  }
  const paradox = paradoxStat(user, weather);
  if (paradox === (physical ? "atk" : "spa")) m *= 1.3;
  // The target's Thick Fat halves Fire and Ice; Water Bubble halves Fire; Ruin abilities weaken the foe.
  if (!ignoreTarget) {
    if (target.ability === "thickfat" && (type === "fire" || type === "ice")) m *= 0.5;
    if (target.ability === "waterbubble" && type === "fire") m *= 0.5;
    if (target.ability === "purifyingsalt" && type === "ghost") m *= 0.5;
  }
  if (target.ability === (physical ? "tabletsofruin" : "vesselofruin")) m *= 0.75;
  return m;
}

/** Multiplier on the defending stat. */
export function defenseModifier(user: AbilityHolder, target: AbilityHolder, weather: Weather | null, ignoreTarget: boolean, defStat: StatName): number {
  let m = 1;
  if (!ignoreTarget) {
    if (target.ability === "furcoat" && defStat === "def") m *= 2;
    if (target.ability === "marvelscale" && defStat === "def" && target.status) m *= 1.5;
    if (paradoxStat(target, weather) === defStat) m *= 1.3;
  }
  if (user.ability === (defStat === "def" ? "swordofruin" : "beadsofruin")) m *= 0.75;
  return m;
}

/** Final damage multiplier after type effectiveness. */
export function finalModifier(user: AbilityHolder, target: AbilityHolder, move: MoveFacts, eff: number, ignoreTarget: boolean): number {
  let m = 1;
  if (user.ability === "tintedlens" && eff < 1) m *= 2;
  if (user.ability === "neuroforce" && eff > 1) m *= 1.25;
  if (!ignoreTarget) {
    if ((target.ability === "multiscale" || target.ability === "shadowshield") && target.hp >= target.maxHp) m *= 0.5;
    if ((target.ability === "filter" || target.ability === "solidrock" || target.ability === "prismarmor") && eff > 1) m *= 0.75;
    if (target.ability === "fluffy") {
      if (has(move, "contact")) m *= 0.5;
      if (moveType(user, move) === "fire") m *= 2;
    }
    if (target.ability === "icescales" && move.category === "special") m *= 0.5;
    if (target.ability === "punkrock" && has(move, "sound")) m *= 0.5;
  }
  return m;
}

/** Normal and Fighting moves hit Ghost types (Scrappy, Mind's Eye). */
export function typeEffectiveness(user: Pick<AbilityHolder, "ability">, type: string, targetTypes: string[]): number {
  if ((user.ability === "scrappy" || user.ability === "mindseye") && (type === "normal" || type === "fighting")) {
    return effectiveness(type, targetTypes.filter((t) => t !== "ghost"));
  }
  return effectiveness(type, targetTypes);
}

/** What the target's ability does to an incoming move it would otherwise be hit by. */
export type Absorb =
  | { kind: "immune" }
  | { kind: "heal" }
  | { kind: "boost"; stat: StatName; amount: number }
  | { kind: "flashfire" };

const ABSORB: Record<string, { type: string; effect: Absorb }> = {
  levitate: { type: "ground", effect: { kind: "immune" } },
  waterabsorb: { type: "water", effect: { kind: "heal" } },
  dryskin: { type: "water", effect: { kind: "heal" } },
  stormdrain: { type: "water", effect: { kind: "boost", stat: "spa", amount: 1 } },
  voltabsorb: { type: "electric", effect: { kind: "heal" } },
  lightningrod: { type: "electric", effect: { kind: "boost", stat: "spa", amount: 1 } },
  motordrive: { type: "electric", effect: { kind: "boost", stat: "spe", amount: 1 } },
  sapsipper: { type: "grass", effect: { kind: "boost", stat: "atk", amount: 1 } },
  flashfire: { type: "fire", effect: { kind: "flashfire" } },
  wellbakedbody: { type: "fire", effect: { kind: "boost", stat: "def", amount: 2 } },
  eartheater: { type: "ground", effect: { kind: "heal" } },
};

/**
 * The target's ability stopping a move aimed at it: type absorbers, Levitate,
 * Soundproof, Bulletproof, Overcoat, Wind Rider, Good as Gold, Wonder Guard,
 * the anti-priority abilities. Null if the move gets through.
 */
export function abilityBlock(user: AbilityHolder, target: AbilityHolder, move: MoveFacts, priority: number, eff: number): Absorb | null {
  if (MOLD_BREAKERS.has(user.ability)) return null;
  const type = moveType(user, move);
  const absorb = ABSORB[target.ability];
  if (absorb && absorb.type === type && move.category !== "status") return absorb.effect;
  // Status moves of these types get absorbed too (Thunder Wave into Volt Absorb).
  if (absorb && absorb.type === type && move.category === "status" && type !== "ground") return absorb.effect;
  switch (target.ability) {
    case "soundproof":
      return has(move, "sound") ? { kind: "immune" } : null;
    case "bulletproof":
      return has(move, "bullet") ? { kind: "immune" } : null;
    case "overcoat":
      return has(move, "powder") ? { kind: "immune" } : null;
    case "windrider":
      return has(move, "wind") ? { kind: "boost", stat: "atk", amount: 1 } : null;
    case "goodasgold":
      return move.category === "status" ? { kind: "immune" } : null;
    case "wonderguard":
      return move.category !== "status" && eff <= 1 ? { kind: "immune" } : null;
    case "queenlymajesty":
    case "dazzling":
    case "armortail":
      return priority > 0 ? { kind: "immune" } : null;
  }
  return null;
}

/** Statuses the ability prevents. */
const STATUS_GUARD: Record<string, Status[]> = {
  insomnia: ["slp"],
  vitalspirit: ["slp"],
  sweetveil: ["slp"],
  limber: ["par"],
  immunity: ["psn", "tox"],
  pastelveil: ["psn", "tox"],
  waterveil: ["brn"],
  waterbubble: ["brn"],
  thermalexchange: ["brn"],
  magmaarmor: ["frz"],
  purifyingsalt: ["brn", "par", "psn", "tox", "slp", "frz"],
  comatose: ["brn", "par", "psn", "tox", "slp", "frz"],
};

/** Whether the ability blocks this status (Leaf Guard only in sun). */
export function statusBlocked(target: Pick<AbilityHolder, "ability">, status: Status, weather: Weather | null): boolean {
  if (target.ability === "leafguard" && weather === "sun") return true;
  return !!STATUS_GUARD[target.ability]?.includes(status);
}

/** Abilities that stop the foe from lowering its stats (all of them, or one). */
export function blocksDrop(target: Pick<AbilityHolder, "ability">, stat: StatName): boolean {
  if (target.ability === "clearbody" || target.ability === "whitesmoke" || target.ability === "fullmetalbody" || target.ability === "mirrorarmor") return true;
  return (target.ability === "hypercutter" && stat === "atk") || (target.ability === "bigpecks" && stat === "def");
}

/** Abilities Intimidate doesn't work on (gen 8+). */
export const INTIMIDATE_PROOF = new Set(["innerfocus", "owntempo", "oblivious", "scrappy", "guarddog"]);

/** Speed multiplier from the ability. */
export function speedModifier(f: AbilityHolder, weather: Weather | null): number {
  let m = 1;
  if ((f.ability === "swiftswim" && weather === "rain") || (f.ability === "chlorophyll" && weather === "sun")) m *= 2;
  if ((f.ability === "sandrush" && weather === "sand") || (f.ability === "slushrush" && weather === "snow")) m *= 2;
  if (f.ability === "quickfeet" && f.status) m *= 1.5;
  if (f.ability === "slowstart" && (f.slowStart ?? 0) > 0) m *= 0.5;
  if (paradoxStat(f, weather) === "spe") m *= 1.5;
  return m;
}

/** Priority bonus: Prankster (status moves), Gale Wings (Flying moves at full HP), Triage (healing moves). */
export function priorityBonus(f: AbilityHolder, move: MoveFacts): number {
  if (f.ability === "prankster" && move.category === "status") return 1;
  if (f.ability === "galewings" && move.type === "flying" && f.hp >= f.maxHp) return 1;
  if (f.ability === "triage" && (move.heal || move.drain)) return 3;
  return 0;
}

/** Weather set on entry. */
export const WEATHER_SETTERS: Record<string, Weather> = {
  drought: "sun",
  drizzle: "rain",
  sandstream: "sand",
  snowwarning: "snow",
  orichalcumpulse: "sun",
};

/** Boosted when a foe faints to its attack. */
export const ON_KO: Record<string, StatName | "best"> = {
  moxie: "atk",
  chillingneigh: "atk",
  grimneigh: "spa",
  soulheart: "spa",
  beastboost: "best",
};

/** Contact punishment: status (30%) for the attacker. */
export const CONTACT_STATUS: Record<string, Status> = { static: "par", flamebody: "brn", poisonpoint: "psn" };
