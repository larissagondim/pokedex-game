import { create } from "zustand";
import type { BattleTrack } from "@/lib/music";

export const TABS = ["LIST", "BATTLE", "TAMAGOTCHI", "TRAINER"] as const;
export const LIST_TAB = 0;
export const BATTLE_TAB = 1;
export const TAMAGOTCHI_TAB = 2;
export const TRAINER_TAB = 3;

interface ScreenState {
  /** Tab shown on the main screen (the music follows it). */
  tab: number;
  setTab: (tab: number) => void;
  /** Theme played on the BATTLE tab (depends on the matchup). */
  battleTrack: BattleTrack;
  setBattleTrack: (track: BattleTrack) => void;
}

export const useScreen = create<ScreenState>((set) => ({
  tab: LIST_TAB,
  setTab: (tab) => set({ tab }),
  battleTrack: "battle",
  setBattleTrack: (battleTrack) => set({ battleTrack }),
}));
