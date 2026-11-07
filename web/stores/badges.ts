import { BADGES, type BadgeId, battleTotals, qualifiedBadges } from "@/lib/trainer";
import { useBattleLog } from "./battleLog";
import { useBattleRecord } from "./battleRecord";
import { useFavorites } from "./favorites";
import { usePokedex } from "./pokedex";
import { useTamagotchi } from "./tamagotchi";
import { useTrainer } from "./trainer";

/**
 * Checks every badge against the saved data (battles, party, favorites) and
 * marks the qualifying ones as earned. Returns the badges that are new.
 */
export function checkBadges(): BadgeId[] {
  const list = usePokedex.getState().list;
  return useTrainer.getState().earn(
    qualifiedBadges({
      wins: battleTotals(useBattleRecord.getState().records).wins,
      log: useBattleLog.getState().log,
      legendary: new Set(list.filter((p) => p.isLegendary || p.isMythical).map((p) => p.id)),
      party: useTamagotchi.getState().pets.filter((p) => p.dexId !== null).length,
      favorites: useFavorites.getState().ids.size,
    }),
  );
}

/** "New badge: FIRST WIN!" (or several). */
export function badgeNotice(ids: readonly BadgeId[]): string {
  const names = ids.map((id) => BADGES.find((b) => b.id === id)!.name);
  return `New badge${names.length > 1 ? "s" : ""}: ${names.join(", ")}! See your trainer card.`;
}
