import { expectedDamage, type Combatant, type MoveInfo } from "../../../web/lib/battleFeatures.ts";
import type { Rng } from "./rng.ts";

/** Chance of a random legal move instead of the best one. */
export const EPSILON = 0.1;

/**
 * Greedy player: picks the move with the highest expected damage (same
 * formula as the features), with a little randomness so games vary.
 * Returns the index into `options`.
 */
export function chooseMove(options: MoveInfo[], me: Combatant, foe: Combatant, rng: Rng): number {
  if (options.length <= 1 || rng() < EPSILON) return Math.floor(rng() * options.length);
  let best = 0;
  let bestScore = -1;
  options.forEach((move, i) => {
    // Status moves get a small random score: used now and then, never preferred over a real hit.
    const score = move.category === "status" ? rng() * 5 : expectedDamage(move, me, foe);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}
