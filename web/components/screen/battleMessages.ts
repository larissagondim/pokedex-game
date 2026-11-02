import type { BattleEvent, Side } from "@/lib/battle/engine";
import type { StatName, Status } from "@/lib/battle/types";

const STAT_NAMES: Record<StatName, string> = {
  atk: "Attack",
  def: "Defense",
  spa: "Sp. Atk",
  spd: "Sp. Def",
  spe: "Speed",
};

const STATUS_GAINED: Record<Status, string> = {
  brn: "was burned!",
  par: "is paralyzed! It may be unable to move!",
  psn: "was poisoned!",
  tox: "was badly poisoned!",
  slp: "fell asleep!",
};

const boostWord = (n: number) => (Math.abs(n) >= 3 ? "drastically " : Math.abs(n) === 2 ? (n > 0 ? "sharply " : "harshly ") : "");

/**
 * Dialog text for a battle event, or null when the event has no line of its
 * own (a plain hit just animates). `name(side)` gives "EEVEE" / "Foe CHARIZARD".
 */
export function describeBattleEvent(event: BattleEvent, name: (side: Side) => string): string | null {
  switch (event.kind) {
    case "move":
      return `${name(event.side)} used ${event.move}!`;
    case "miss":
      return `${name(event.side)}'s attack missed!`;
    case "damage": {
      const parts: string[] = [];
      if (event.crit) parts.push("A critical hit!");
      if (event.effectiveness > 1) parts.push("It's super effective!");
      else if (event.effectiveness < 1) parts.push("It's not very effective...");
      if (event.hits > 1) parts.push(`Hit ${event.hits} times!`);
      return parts.length ? parts.join(" ") : null;
    }
    case "no-effect":
      return `It doesn't affect ${name(event.side)}...`;
    case "fail":
      return "But it failed!";
    case "heal":
      return `${name(event.side)} regained health!`;
    case "recoil":
      return `${name(event.side)} is damaged by recoil!`;
    case "boost": {
      const stat = STAT_NAMES[event.stat];
      if (event.change === 0) return `${name(event.side)}'s ${stat} won't go any ${event.requested > 0 ? "higher" : "lower"}!`;
      return `${name(event.side)}'s ${stat} ${boostWord(event.change)}${event.change > 0 ? "rose" : "fell"}!`;
    }
    case "status":
      return `${name(event.side)} ${STATUS_GAINED[event.status]}`;
    case "cant-move":
      return {
        par: `${name(event.side)} is paralyzed! It can't move!`,
        slp: `${name(event.side)} is fast asleep.`,
        flinch: `${name(event.side)} flinched and couldn't move!`,
        recharge: `${name(event.side)} must recharge!`,
      }[event.reason];
    case "confused":
      return event.fatigue ? `${name(event.side)} became confused due to fatigue!` : `${name(event.side)} became confused!`;
    case "confusion":
      return `${name(event.side)} is confused!`;
    case "confusion-end":
      return `${name(event.side)} snapped out of its confusion!`;
    case "self-hit":
      return "It hurt itself in its confusion!";
    case "protect":
      return `${name(event.side)} protected itself!`;
    case "protected":
      return `${name(event.side)} protected itself!`;
    case "seeded":
      return `${name(event.side)} was seeded!`;
    case "leech":
      return `${name(event.side)}'s health is sapped by Leech Seed!`;
    case "wake":
      return `${name(event.side)} woke up!`;
    case "residual":
      return `${name(event.side)} is hurt by ${event.status === "brn" ? "its burn" : "poison"}!`;
    case "faint":
      return `${name(event.side)} fainted!`;
  }
}
