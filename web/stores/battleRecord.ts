import { create } from "zustand";

const STORAGE_KEY = "pokedex-game:battle-record";

export interface BattleTally {
  wins: number;
  losses: number;
}

type Records = { [dexId: number]: BattleTally };

function load(): Records {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return saved && typeof saved === "object" ? (saved as Records) : {};
  } catch {
    return {};
  }
}

interface BattleRecordState {
  /** Wins and losses of each Pokémon you battled with. */
  records: Records;
  record: (dexId: number, won: boolean) => void;
}

export const useBattleRecord = create<BattleRecordState>((set, get) => ({
  records: typeof window === "undefined" ? {} : load(),
  record: (dexId, won) => {
    const current = get().records[dexId] ?? { wins: 0, losses: 0 };
    const records = { ...get().records, [dexId]: won ? { ...current, wins: current.wins + 1 } : { ...current, losses: current.losses + 1 } };
    set({ records });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Storage unavailable: the record lasts for this session only.
    }
  },
}));
