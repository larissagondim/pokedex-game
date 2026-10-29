import { create } from "zustand";
import { type Pokemon, POKEDEX_URL } from "@/data/pokedex";

interface PokedexState {
  /** All Pokémon, in National Dex order. Empty until loaded. */
  list: Pokemon[];
  status: "idle" | "loading" | "ready" | "error";
  /** National Dex number of the confirmed (A) Pokémon, or null for none. */
  selectedId: number | null;
  load: () => Promise<void>;
  select: (id: number | null) => void;
}

export const usePokedex = create<PokedexState>((set, get) => ({
  list: [],
  status: "idle",
  selectedId: null,

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

  select: (selectedId) => set({ selectedId }),
}));
