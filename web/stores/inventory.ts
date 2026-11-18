import { create } from "zustand";
import { ITEMS, type ItemId } from "@/lib/battle/engine";
import { useTamagotchi } from "./tamagotchi";

const STORAGE_KEY = "pokedex-game:inventory";

/** Shop prices of the battle items. */
export const ITEM_PRICES: Record<ItemId, number> = { potion: 30, fullheal: 25 };

type Items = Record<ItemId, number>;

const EMPTY: Items = { potion: 0, fullheal: 0 };

function load(): Items {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Items> | null;
    const count = (n: unknown) => (Number.isInteger(n) && (n as number) > 0 ? (n as number) : 0);
    return { potion: count(saved?.potion), fullheal: count(saved?.fullheal) };
  } catch {
    return EMPTY;
  }
}

function save(items: Items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage unavailable: the items last for this session only.
  }
}

interface InventoryState {
  /** Bought items, on top of the standard bag every battle starts with. */
  items: Items;
  /** Pays with the Tamagotchi coins; false if there aren't enough. */
  buy: (item: ItemId) => boolean;
  /** The bag for a battle: the standard one plus everything bought. */
  battleBag: () => Items;
  /** After a battle: uses up the bought items spent beyond the standard bag. */
  settle: (left: Items) => void;
  /** Takes the items from the server. */
  replace: (items: Items) => void;
}

export const useInventory = create<InventoryState>((set, get) => ({
  items: typeof window === "undefined" ? EMPTY : load(),
  buy: (item) => {
    if (!useTamagotchi.getState().spend(ITEM_PRICES[item])) return false;
    const items = { ...get().items, [item]: get().items[item] + 1 };
    set({ items });
    save(items);
    return true;
  },
  battleBag: () => {
    const { items } = get();
    return { potion: ITEMS.potion.count + items.potion, fullheal: ITEMS.fullheal.count + items.fullheal };
  },
  replace: (items) => {
    const { potion, fullheal } = get().items;
    if (items.potion === potion && items.fullheal === fullheal) return;
    set({ items: { ...items } });
    save(items);
  },
  settle: (left) => {
    // The standard items go first; bought ones only once those are gone.
    const items = { potion: Math.min(get().items.potion, left.potion), fullheal: Math.min(get().items.fullheal, left.fullheal) };
    set({ items });
    save(items);
  },
}));
