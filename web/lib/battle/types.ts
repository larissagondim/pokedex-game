import type { Combatant, MoveInfo } from "../battleFeatures.ts";

export type StatName = "atk" | "def" | "spa" | "spd" | "spe";
export type Boosts = Partial<Record<StatName, number>>;
export type Status = "brn" | "par" | "psn" | "tox" | "slp";

/** Chance-based extra effect of a damaging move (e.g. Flamethrower: 10% burn). */
export interface Secondary {
  /** Percent. */
  chance: number;
  status?: string;
  /** "flinch" or "confusion". */
  volatile?: string;
  boosts?: Boosts;
  selfBoosts?: Boosts;
}

/** A move with everything the battle engine uses (exported by ml/generate). */
export interface BattleMove extends MoveInfo {
  id: string;
  name: string;
  pp: number;
  /** Status moves that change stats: on the user ("self") or the opponent. */
  boosts?: { target: "self" | "foe"; stats: Boosts };
  /** Stat changes to the user after hitting (e.g. Close Combat). */
  selfBoosts?: Boosts;
  /** Status the move inflicts on the opponent (Will-O-Wisp, Thunder Wave...). */
  status?: string;
  /** Fractions [numerator, denominator]. */
  drain?: [number, number];
  recoil?: [number, number];
  heal?: [number, number];
  secondary?: Secondary[];
  multihit?: number | [number, number];
  critRatio?: number;
  /** "level" (Seismic Toss) or a fixed amount (Dragon Rage). */
  fixedDamage?: "level" | number;
  /** Status moves with a volatile effect: "confusion" (on the foe), "protect", "leechseed". */
  volatile?: string;
  /** Repeats for 2-3 turns, then confuses the user (Outrage, Thrash...). */
  locked?: boolean;
  /** The user must rest next turn (Hyper Beam, Giga Impact...). */
  recharge?: boolean;
  /** Move flags the engine cares about (see MOVE_FLAGS in ml/generate). */
  flags?: MoveFlag[];
}

export type MoveFlag = "contact" | "sound" | "punch" | "bite" | "pulse" | "slicing" | "bullet" | "powder" | "wind" | "bypasssub";

/** A species as it enters battle: Combatant data plus full move details. */
export interface BattlePokemon extends Combatant {
  name: string;
  moves: BattleMove[];
  /** Kilograms (Low Kick, Grass Knot, Heavy Slam...). */
  weight?: number;
}
