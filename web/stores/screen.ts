import { create } from "zustand";

export const TABS = ["LIST", "BATTLE", "TAMAGOTCHI"] as const;
export const LIST_TAB = 0;
export const BATTLE_TAB = 1;
export const TAMAGOTCHI_TAB = 2;

interface ScreenState {
  /** Tab shown on the main screen (the music follows it). */
  tab: number;
  setTab: (tab: number) => void;
}

export const useScreen = create<ScreenState>((set) => ({
  tab: LIST_TAB,
  setTab: (tab) => set({ tab }),
}));
