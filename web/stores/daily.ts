import { create } from "zustand";

const STORAGE_KEY = "pokedex-game:daily";

function load(): string | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

interface DailyState {
  /** The day (`dayKey`) of the last daily challenge won. */
  lastWon: string | null;
  /** Records a win for `day`; returns true if it's the first one that day. */
  win: (day: string) => boolean;
}

/** Daily challenge progress, in localStorage. */
export const useDaily = create<DailyState>((set, get) => ({
  lastWon: typeof window === "undefined" ? null : load(),
  win: (day) => {
    if (get().lastWon === day) return false;
    set({ lastWon: day });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(day));
    } catch {
      // Storage unavailable: lasts for this session only.
    }
    return true;
  },
}));
