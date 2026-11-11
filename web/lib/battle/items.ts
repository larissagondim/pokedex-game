import type { StatName } from "./types.ts";

/**
 * Held items as pure rules: stat, power, damage, speed, accuracy and crit
 * modifiers. The engine handles the triggered ones (Leftovers, berries,
 * Focus Sash, Life Orb recoil...) itself. Items are ids ("choiceband"); an
 * empty string is no item.
 */

export interface ItemHolder {
  item: string;
  dexId: number;
  /** Not fully evolved (Eviolite). */
  nfe: boolean;
}

/** 1.2× for moves of one type. */
const TYPE_BOOSTERS: Record<string, string> = {
  silkscarf: "normal",
  charcoal: "fire",
  mysticwater: "water",
  miracleseed: "grass",
  magnet: "electric",
  nevermeltice: "ice",
  blackbelt: "fighting",
  poisonbarb: "poison",
  softsand: "ground",
  sharpbeak: "flying",
  twistedspoon: "psychic",
  silverpowder: "bug",
  hardstone: "rock",
  spelltag: "ghost",
  dragonfang: "dragon",
  blackglasses: "dark",
  metalcoat: "steel",
  fairyfeather: "fairy",
};

const LATIAS = 380;
const LATIOS = 381;
const PIKACHU = 25;
const CUBONE = 104;
const MAROWAK = 105;
const FARFETCHD = 83;
const SIRFETCHD = 865;

/** Multiplier on the move's base power. */
export function itemPowerModifier(user: ItemHolder, type: string, category: string, flags: string[] | undefined): number {
  if (TYPE_BOOSTERS[user.item] === type) return 1.2;
  if (user.item === "souldew" && (user.dexId === LATIAS || user.dexId === LATIOS) && (type === "psychic" || type === "dragon")) return 1.2;
  if (user.item === "muscleband" && category === "physical") return 1.1;
  if (user.item === "wiseglasses" && category === "special") return 1.1;
  if (user.item === "punchingglove" && flags?.includes("punch")) return 1.1;
  return 1;
}

/** Multiplier on the attacking stat. */
export function itemAttackModifier(user: ItemHolder, physical: boolean): number {
  if (user.item === (physical ? "choiceband" : "choicespecs")) return 1.5;
  if (user.item === "lightball" && user.dexId === PIKACHU) return 2;
  if (user.item === "thickclub" && physical && (user.dexId === CUBONE || user.dexId === MAROWAK)) return 2;
  return 1;
}

/** Multiplier on the defending stat. */
export function itemDefenseModifier(target: ItemHolder, defStat: StatName): number {
  if (target.item === "eviolite" && target.nfe) return 1.5;
  if (target.item === "assaultvest" && defStat === "spd") return 1.5;
  return 1;
}

/** Final damage multiplier (Life Orb, Expert Belt on super-effective hits). */
export function itemFinalModifier(user: ItemHolder, eff: number): number {
  if (user.item === "lifeorb") return 1.3;
  if (user.item === "expertbelt" && eff > 1) return 1.2;
  return 1;
}

export const itemSpeedModifier = (f: ItemHolder) => (f.item === "choicescarf" ? 1.5 : f.item === "ironball" ? 0.5 : 1);

/** Extra crit stages. */
export const itemCritStages = (f: ItemHolder) =>
  f.item === "scopelens" || f.item === "razorclaw" ? 1 : f.item === "leek" && (f.dexId === FARFETCHD || f.dexId === SIRFETCHD) ? 2 : 0;

export const itemAccuracyModifier = (f: ItemHolder) => (f.item === "widelens" ? 1.1 : 1);

/** Choice items lock the holder into its first move. */
export const CHOICE = new Set(["choiceband", "choicespecs", "choicescarf"]);

/** Weather rocks: the holder's weather lasts 8 turns. */
export const WEATHER_ROCKS: Record<string, string> = { heatrock: "sun", damprock: "rain", smoothrock: "sand", icyrock: "snow" };

export const isBerry = (item: string) => item.endsWith("berry");
