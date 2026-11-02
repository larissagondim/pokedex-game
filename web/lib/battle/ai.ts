import { type Combatant, expectedDamage } from "../battleFeatures.ts";
import { effectiveSpeed, type Fighter, type Rng, stageMultiplier } from "./engine.ts";

/** Chance of a random move instead of the best one, so the foe isn't predictable. */
const RANDOMNESS = 0.15;

/** The fighter as the damage estimate sees it (current stats with stages). */
const view = (f: Fighter): Combatant => ({
  dexId: f.dexId,
  level: f.level,
  types: f.types,
  hp: f.hp,
  maxHp: f.maxHp,
  stats: {
    atk: f.stats.atk * stageMultiplier(f.boosts.atk),
    def: f.stats.def * stageMultiplier(f.boosts.def),
    spa: f.stats.spa * stageMultiplier(f.boosts.spa),
    spd: f.stats.spd * stageMultiplier(f.boosts.spd),
    spe: effectiveSpeed(f),
  },
  status: f.status,
  moves: f.moves,
});

/**
 * Picks the move with the best expected damage. Status moves score a share of
 * that when they would do something (a status on a healthy foe, a stat boost
 * not yet maxed, healing when hurt).
 */
export function chooseMove(me: Fighter, foe: Fighter, rng: Rng = Math.random): number {
  const usable = me.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.ppLeft > 0);
  if (usable.length === 0) return 0;
  if (rng() < RANDOMNESS) return usable[Math.floor(rng() * usable.length)].i;

  const self = view(me);
  const target = view(foe);
  const bestHit = Math.max(1, ...usable.map(({ m }) => expectedDamage(m, self, target)));
  let best = usable[0].i;
  let bestScore = -1;
  for (const { m, i } of usable) {
    let score: number;
    if (m.category !== "status" || m.fixedDamage !== undefined) {
      score = m.fixedDamage === "level" ? me.level : typeof m.fixedDamage === "number" ? m.fixedDamage : expectedDamage(m, self, target);
    } else if (m.status) {
      score = foe.status ? 0 : bestHit * 0.6;
    } else if (m.volatile === "confusion") {
      score = foe.confusion > 0 ? 0 : bestHit * 0.5;
    } else if (m.volatile === "leechseed") {
      score = foe.seeded || foe.types.includes("grass") ? 0 : bestHit * 0.5;
    } else if (m.volatile === "protect") {
      // Now and then, never twice in a row.
      score = me.protectStreak > 0 ? 0 : bestHit * 0.3;
    } else if (m.heal) {
      score = me.hp < me.maxHp / 2 ? bestHit * 0.9 : 0;
    } else if (m.boosts) {
      const stats = Object.keys(m.boosts.stats) as (keyof Fighter["boosts"])[];
      const room = m.boosts.target === "self" ? stats.some((s) => me.boosts[s] < 4) : stats.some((s) => foe.boosts[s] > -4);
      score = room ? bestHit * 0.5 : 0;
    } else {
      score = 0;
    }
    score *= 0.9 + rng() * 0.2; // a little noise between similar options
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}
