/**
 * Where a Pokémon's images come from. Regular sprites are local (copied by
 * scripts/sync-assets.mjs); shiny ones aren't scraped, so they load from the
 * PokéAPI sprites repository and fall back to the regular look if that fails.
 */

const REMOTE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

/** Static front sprite. */
export const spriteUrl = (dexId: number, shiny = false) => (shiny ? `${REMOTE}/shiny/${dexId}.png` : `/sprites/${dexId}.png`);

/** Animated shiny sprite (missing for a few recent species). */
export const shinyAnimatedUrl = (dexId: number) => `${REMOTE}/other/showdown/shiny/${dexId}.gif`;

/**
 * Images to try for a Pokémon, best first: the animated one (if wanted and
 * known), then the static one; a shiny ends with its regular sprite, so
 * something always shows.
 */
export function spriteSources(dexId: number, options: { shiny?: boolean; animated?: string | null } = {}): string[] {
  const { shiny = false, animated } = options;
  if (!shiny) return [...(animated ? [animated] : []), spriteUrl(dexId)];
  return [...(animated ? [shinyAnimatedUrl(dexId)] : []), spriteUrl(dexId, true), spriteUrl(dexId)];
}
