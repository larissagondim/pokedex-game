import { create } from "zustand";
import { type Pokemon, POKEDEX_URL } from "@/data/pokedex";

interface PokedexState {
  /** All Pokémon, in National Dex order. Empty until loaded. */
  list: Pokemon[];
  status: "idle" | "loading" | "ready" | "error";
  /** National Dex number under the list cursor (shown on the secondary screen). */
  focusedId: number | null;
  /** National Dex number of the confirmed (A) Pokémon, or null for none. */
  selectedId: number | null;
  /** Latest cry to play; a new object each time, even for the same Pokémon. */
  cryRequest: { url: string } | null;
  load: () => Promise<void>;
  focus: (id: number | null) => void;
  select: (id: number | null) => void;
  playCry: (id: number) => void;
}

export const usePokedex = create<PokedexState>((set, get) => ({
  list: [],
  status: "idle",
  focusedId: null,
  selectedId: null,
  cryRequest: null,

  load: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading" });
    try {
      const res = await fetch(POKEDEX_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      set({ list: (await res.json()) as Pokemon[], status: "ready" });
    } catch {
      set({ status: "error" });
    }
  },

  focus: (focusedId) => {
    if (get().focusedId !== focusedId) set({ focusedId });
  },

  select: (selectedId) => set({ selectedId }),

  playCry: (id) => {
    const url = get().list.find((p) => p.id === id)?.cry;
    if (url) set({ cryRequest: { url } });
  },
}));
