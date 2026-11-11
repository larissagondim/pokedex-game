import { type BattleEvent, type Effect, type HurtCause, ITEMS, type Side, type Weather } from "@/lib/battle/engine";
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
  frz: "was frozen solid!",
};

/** Lines for text-only effects: `who` is the Pokémon, `team` "your team" / "the foe's team", `move` the move involved (Taunt blocks). */
const EFFECT_TEXT: Record<Effect, (who: string, team: string, move?: string) => string> = {
  substitute: (who) => `${who} put in a SUBSTITUTE!`,
  "substitute-fail": (who) => `${who} already has a SUBSTITUTE!`,
  taunt: (who) => `${who} fell for the taunt!`,
  "taunt-end": (who) => `${who} shook off the taunt!`,
  "taunt-block": (who, _team, move) => `${who} can't use ${move ?? "that move"} after the taunt!`,
  encore: (who) => `${who} received an encore!`,
  "encore-end": (who) => `${who}'s encore ended!`,
  drowsy: (who) => `${who} grew drowsy!`,
  "destiny-bond": (who) => `${who} is hoping to take its attacker down with it!`,
  cursed: (who) => `${who} was cursed!`,
  "magnet-rise": (who) => `${who} levitated with electromagnetism!`,
  "magnet-rise-end": (who) => `${who}'s electromagnetism wore off!`,
  "heal-bell": () => "A bell chimed! The team's status problems were cured.",
  "tidy-up": () => "Tidying up complete!",
  "stealth-rock": (_who, team) => `Pointed stones float in the air around ${team}!`,
  spikes: (_who, team) => `Spikes were scattered on the ground around ${team}!`,
  "toxic-spikes": (_who, team) => `Poison spikes were scattered on the ground around ${team}!`,
  "sticky-web": (_who, team) => `A sticky web spreads out on the ground around ${team}!`,
  "sticky-web-caught": (who) => `${who} was caught in a sticky web!`,
  "toxic-spikes-absorbed": (_who, team) => `The poison spikes disappeared from the ground around ${team}!`,
  "hazards-gone": () => "The hazards were blown away!",
  reflect: (_who, team) => `Reflect made ${team} stronger against physical moves!`,
  "light-screen": (_who, team) => `Light Screen made ${team} stronger against special moves!`,
  "aurora-veil": (_who, team) => `Aurora Veil made ${team} stronger against physical and special moves!`,
  "reflect-end": (_who, team) => `${cap(team)}'s Reflect wore off!`,
  "light-screen-end": (_who, team) => `${cap(team)}'s Light Screen wore off!`,
  "aurora-veil-end": (_who, team) => `${cap(team)}'s Aurora Veil wore off!`,
  "screens-broken": () => "The screens shattered!",
  wish: (who) => `${who} made a wish!`,
  "wish-came-true": () => "The wish came true!",
  "healing-wish": (who) => `The healing wish came true for ${who}!`,
  "trick-room": () => "The dimensions were twisted!",
  "trick-room-end": () => "The twisted dimensions returned to normal!",
  "no-target": () => "But there was no target...",
  thaw: (who) => `${who} thawed out!`,
  charging: (who, _team, move) => `${who} is gathering power for ${move ?? "its attack"}!`,
  "stats-reset": (who) => `${who}'s stat changes were removed!`,
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const WEATHER_TEXT: Record<Weather, [start: string, end: string]> = {
  sun: ["The sunlight turned harsh!", "The harsh sunlight faded."],
  rain: ["It started to rain!", "The rain stopped."],
  sand: ["A sandstorm kicked up!", "The sandstorm subsided."],
  snow: ["It started to snow!", "The snow stopped."],
};

const HURT_TEXT: Record<HurtCause, (who: string) => string> = {
  curse: (who) => `${who} is afflicted by the curse!`,
  "destiny-bond": (who) => `${who} took its attacker down with it!`,
  stealthrock: (who) => `Pointed stones dug into ${who}!`,
  spikes: (who) => `${who} was hurt by the spikes!`,
  sandstorm: (who) => `${who} is buffeted by the sandstorm!`,
};

const boostWord = (n: number) => (Math.abs(n) >= 3 ? "drastically " : Math.abs(n) === 2 ? (n > 0 ? "sharply " : "harshly ") : "");

/**
 * Dialog text for a battle event, or null when the event has no line of its
 * own (a plain hit just animates). `name(side)` gives "EEVEE" / "Foe CHARIZARD"
 * (the Pokémon out at that moment). `you` names the player in item lines.
 */
export function describeBattleEvent(event: BattleEvent, name: (side: Side) => string, you = "You"): string | null {
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
        frz: `${name(event.side)} is frozen solid!`,
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
    case "pain-split":
      return "The battlers shared their pain!";
    case "hp-cost":
      return `${name(event.side)} cut its own HP!`;
    case "haze":
      return "All stat changes were eliminated!";
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
    case "switch": {
      const to = event.to.toUpperCase();
      if (event.dragged) return `${event.side === "a" ? to : `Foe ${to}`} was dragged out!`;
      if (event.side === "a") return event.forced ? `Go! ${to}!` : `${event.from.toUpperCase()}, come back! Go! ${to}!`;
      return event.forced ? `The foe sent out ${to}!` : `The foe withdrew ${event.from.toUpperCase()} and sent out ${to}!`;
    }
    case "item":
      return `${event.side === "a" ? you : "The foe"} used a ${ITEMS[event.item].name.toUpperCase()}!`;
    case "cure":
      return `${name(event.side)} was cured!`;
    case "sub-damage": {
      const parts: string[] = [];
      if (event.crit) parts.push("A critical hit!");
      if (event.effectiveness > 1) parts.push("It's super effective!");
      else if (event.effectiveness < 1) parts.push("It's not very effective...");
      parts.push(`The SUBSTITUTE took damage for ${name(event.side)}!`);
      if (event.broke) parts.push(`${name(event.side)}'s SUBSTITUTE faded!`);
      return parts.join(" ");
    }
    case "hurt":
      // Destiny Bond names the Pokémon that set it up (the one already down).
      return HURT_TEXT[event.cause](name(event.cause === "destiny-bond" ? (event.side === "a" ? "b" : "a") : event.side));
    case "transform":
      return `${name(event.side)} transformed!`;
    case "revive":
      return `${event.name.toUpperCase()} was revived and is ready to fight again!`;
    case "effect":
      return EFFECT_TEXT[event.effect](name(event.side), event.side === "a" ? "your team" : "the foe's team", event.move?.toUpperCase());
    case "weather":
      return WEATHER_TEXT[event.weather][event.ended ? 1 : 0];
  }
}
