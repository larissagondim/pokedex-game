import { create } from "zustand";
import { nextStreak } from "@/lib/daily";

const STORAGE_KEY = "pokedex-game:daily";

interface Saved {
  /** The day (`dayKey`) of the last daily challenge won. */
  lastWon: string | null;
  /** Days in a row won, ending on `lastWon`. */
  streak: number;
}

function load(): Saved {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    // The first version stored just the day.
    if (typeof v === "string") return { lastWon: v, streak: 1 };
    const s = (v && typeof v === "object" ? v : {}) as Partial<Saved>;
    const lastWon = typeof s.lastWon === "string" ? s.lastWon : null;
    return { lastWon, streak: lastWon && Number.isInteger(s.streak) && s.streak! > 0 ? s.streak! : lastWon ? 1 : 0 };
  } catch {
    return { lastWon: null, streak: 0 };
  }
}

interface DailyState extends Saved {
  /** Records a win for `day`; returns the new streak if it's the first win that day, else null. */
  win: (day: string) => number | null;
  /** Takes progress from the server. */
  replace: (lastWon: string | null, streak: number) => void;
}

/** Daily challenge progress, in localStorage. */
export const useDaily = create<DailyState>((set, get) => {
  const store = (saved: Saved) => {
    set(saved);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Storage unavailable: lasts for this session only.
    }
  };
  return {
    ...(typeof window === "undefined" ? { lastWon: null, streak: 0 } : load()),
    win: (day) => {
      const { lastWon, streak } = get();
      if (lastWon === day) return null;
      const next = nextStreak(lastWon, streak, day);
      store({ lastWon: day, streak: next });
      return next;
    },
    replace: (lastWon, streak) => {
      if (lastWon !== get().lastWon || streak !== get().streak) store({ lastWon, streak });
    },
  };
});
