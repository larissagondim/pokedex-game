/**
 * Battle rewards scale with how unlikely the win was: an even fight pays the
 * base amount, a sure win a fraction of it, an upset up to twice as much.
 * Pure, no storage.
 */

/** Coins per foe Pokémon beaten in an even fight. */
export const WIN_REWARD = 15;
/** XP a party member earns for winning an even fight. */
export const BATTLE_WIN_XP = 20;
/** The multiplier's floor (a sure win) and ceiling (a near-hopeless one). */
export const MIN_MULTIPLIER = 0.2;
export const MAX_MULTIPLIER = 2;

/**
 * 2 × (1 − win chance), clamped: 50% → ×1, 90% → ×0.2, 10% → ×1.8.
 * Unknown odds (the model couldn't run) pay the base amount.
 */
export function upsetMultiplier(odds: number | null): number {
  if (odds === null || !Number.isFinite(odds)) return 1;
  return Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, 2 * (1 - odds)));
}

/** Coins and party XP for a win against `foes` Pokémon, at least 1 of each. */
export function battleReward(odds: number | null, foes: number): { coins: number; xp: number } {
  const m = upsetMultiplier(odds);
  return {
    coins: Math.max(1, Math.round(WIN_REWARD * foes * m)),
    xp: Math.max(1, Math.round(BATTLE_WIN_XP * m)),
  };
}
