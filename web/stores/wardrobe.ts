import { create } from "zustand";
import { type Accessory, ACCESSORY_PRICES, isAccessory } from "@/lib/trainer";
import { useTamagotchi } from "./tamagotchi";

const STORAGE_KEY = "pokedex-game:wardrobe";

function load(): ReadonlySet<Accessory> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return new Set(Array.isArray(saved) ? saved.filter(isAccessory) : []);
  } catch {
    return new Set();
  }
}

function save(owned: ReadonlySet<Accessory>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...owned]));
  } catch {
    // Storage unavailable: lasts for this session only.
  }
}

interface WardrobeState {
  /** Trainer accessories bought in the shop. */
  owned: ReadonlySet<Accessory>;
  /** Pays with the Tamagotchi coins; false if there aren't enough (or it's owned already). */
  buy: (id: Accessory) => boolean;
  /** Takes the accessories from the server (already merged with this device's). */
  replace: (ids: readonly Accessory[]) => void;
}

export const useWardrobe = create<WardrobeState>((set, get) => ({
  owned: typeof window === "undefined" ? new Set() : load(),
  buy: (id) => {
    if (get().owned.has(id) || !useTamagotchi.getState().spend(ACCESSORY_PRICES[id])) return false;
    const owned = new Set([...get().owned, id]);
    set({ owned });
    save(owned);
    return true;
  },
  replace: (ids) => {
    const { owned } = get();
    if (ids.length === owned.size && ids.every((id) => owned.has(id))) return;
    const next = new Set(ids);
    set({ owned: next });
    save(next);
  },
}));
