import type { BattleSnapshot } from "../../../web/lib/battleFeatures.ts";

/**
 * What the dataset generator needs from a battle engine. The @pkmn/sim adapter
 * implements it today; the project's own battle engine can implement it later
 * so the model learns those rules instead.
 */
export interface BattleResult {
  /** State at the start of every turn, from side A's point of view. */
  snapshots: BattleSnapshot[];
  /** 1 if A won, 0 if B won, null for a draw or turn limit. */
  aWon: 0 | 1 | null;
  turns: number;
}

export interface BattleEngine<Matchup> {
  readonly name: string;
  /** Picks movesets etc. for two dex numbers (fixed across replays). */
  prepare(dexA: number, dexB: number, seed: number): Matchup;
  /** Plays the matchup once; different seeds give different rolls and choices. */
  play(matchup: Matchup, seed: number): BattleResult;
}
