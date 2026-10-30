import { create } from "zustand";

const STORAGE_KEY = "pokedex-game:favorites";

function load(): Set<number> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : []);
  } catch {
    return new Set(); // no storage (SSR, private mode) or bad data
  }
}

interface FavoritesState {
  ids: ReadonlySet<number>;
  toggle: (id: number) => void;
}

/** Favorite Pokémon, kept in this browser's localStorage. */
export const useFavorites = create<FavoritesState>((set, get) => ({
  ids: typeof window === "undefined" ? new Set() : load(),
  toggle: (id) => {
    const ids = new Set(get().ids);
    if (!ids.delete(id)) ids.add(id);
    set({ ids });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
      // Storage unavailable: keep the favorites for this session only.
    }
  },
}));
