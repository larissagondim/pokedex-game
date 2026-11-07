import { create } from "zustand";
import { type BattleLogEntry, logBattle } from "@/lib/trainer";

const STORAGE_KEY = "pokedex-game:battle-log";

const isIds = (x: unknown): x is number[] => Array.isArray(x) && x.every(Number.isInteger);

function load(): BattleLogEntry[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(
      (e): e is BattleLogEntry =>
        e && typeof e.at === "number" && isIds(e.player) && isIds(e.foe) && typeof e.won === "boolean" && (e.odds === null || typeof e.odds === "number"),
    );
  } catch {
    return [];
  }
}

interface BattleLogState {
  /** The latest battles, newest first. */
  log: BattleLogEntry[];
  add: (entry: BattleLogEntry) => void;
}

/** History of finished battles (for the trainer card), in localStorage. */
export const useBattleLog = create<BattleLogState>((set, get) => ({
  log: typeof window === "undefined" ? [] : load(),
  add: (entry) => {
    const log = logBattle(get().log, entry);
    set({ log });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
    } catch {
      // Storage unavailable: the history lasts for this session only.
    }
  },
}));
