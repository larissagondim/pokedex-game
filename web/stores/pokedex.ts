import { create } from "zustand";

interface PokedexState {
  /** National Dex number of the confirmed (A) Pokémon, or null for none. */
  selectedId: number | null;
  select: (id: number | null) => void;
}

export const usePokedex = create<PokedexState>((set) => ({
  selectedId: null,
  select: (selectedId) => set({ selectedId }),
}));
