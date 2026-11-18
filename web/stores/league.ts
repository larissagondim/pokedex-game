import { create } from "zustand";
import { afterLeague, LEAGUE } from "@/lib/league";

const STORAGE_KEY = "pokedex-game:league";

function load(): number {
  try {
    const n: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "0");
    return Number.isInteger(n) ? Math.max(0, Math.min(LEAGUE.length, n as number)) : 0;
  } catch {
    return 0;
  }
}

interface LeagueState {
  /** Leaders beaten so far (they're fought in order). */
  beaten: number;
  /** Records a league battle; returns true if it beat a new leader. */
  result: (index: number, won: boolean) => boolean;
  /** Takes progress from the server. */
  replace: (beaten: number) => void;
}

/** League progress, in localStorage. */
export const useLeague = create<LeagueState>((set, get) => {
  const store = (beaten: number) => {
    set({ beaten });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(beaten));
    } catch {
      // Storage unavailable: progress lasts for this session only.
    }
  };
  return {
    beaten: typeof window === "undefined" ? 0 : load(),
    result: (index, won) => {
      const beaten = afterLeague(get().beaten, index, won);
      if (beaten === get().beaten) return false;
      store(beaten);
      return true;
    },
    replace: (beaten) => {
      if (beaten !== get().beaten) store(Math.max(0, Math.min(LEAGUE.length, beaten)));
    },
  };
});
