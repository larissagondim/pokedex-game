import { create } from "zustand";
import type { Pokemon } from "@/data/pokedex";
import {
  act,
  type Action,
  dexOf,
  EGG_PRICE,
  eggPool,
  evolve,
  hatch,
  MAX_SLOTS,
  newPet,
  type Outcome,
  type Pet,
  START_COINS,
  tick,
} from "@/lib/tamagotchi";

const STORAGE_KEY = "pokedex-game:tamagotchi";

interface Saved {
  pets: Pet[];
  coins: number;
}

/** Something worth telling the player about (shown in the dialog box). */
export type TamaEvent =
  | { kind: "action"; uid: string; dexId: number; outcome: Outcome; coins: number }
  | { kind: "evolved"; uid: string; from: number; to: number }
  | { kind: "hatched"; uid: string; dexId: number }
  | { kind: "adopted"; uid: string; dexId: number }
  | { kind: "egg-bought"; uid: string }
  | { kind: "released"; dexId: number | null }
  | { kind: "full" }
  | { kind: "no-coins" };

interface TamagotchiState extends Saved {
  /** Latest event; a new object every time so subscribers can react. */
  event: TamaEvent | null;
  adopt: (dexId: number) => boolean;
  buyEgg: () => void;
  release: (uid: string) => void;
  act: (uid: string, action: Action, list: readonly Pokemon[]) => void;
  /** Applies decay, hatches ready eggs. Call on open and periodically. */
  refresh: (list: readonly Pokemon[]) => void;
}

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Saved | null;
    if (saved && Array.isArray(saved.pets) && typeof saved.coins === "number") return saved;
  } catch {
    // No storage or bad data: start fresh.
  }
  return { pets: [], coins: START_COINS };
}

function save({ pets, coins }: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ pets, coins }));
  } catch {
    // Storage unavailable: progress lasts for this session only.
  }
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Up to MAX_SLOTS Pokémon (eggs included) and the coin balance, in localStorage. */
export const useTamagotchi = create<TamagotchiState>((set, get) => {
  const commit = (changes: Partial<Saved> & { event?: TamaEvent | null }) => {
    set(changes);
    save(get());
  };

  return {
    ...(typeof window === "undefined" ? { pets: [], coins: START_COINS } : load()),
    event: null,

    adopt: (dexId) => {
      const { pets } = get();
      if (pets.length >= MAX_SLOTS) {
        commit({ event: { kind: "full" } });
        return false;
      }
      const pet = newPet(uid(), dexId, Date.now());
      commit({ pets: [...pets, pet], event: { kind: "adopted", uid: pet.uid, dexId } });
      return true;
    },

    buyEgg: () => {
      const { pets, coins } = get();
      if (pets.length >= MAX_SLOTS) return commit({ event: { kind: "full" } });
      if (coins < EGG_PRICE) return commit({ event: { kind: "no-coins" } });
      const egg = newPet(uid(), null, Date.now());
      commit({ pets: [...pets, egg], coins: coins - EGG_PRICE, event: { kind: "egg-bought", uid: egg.uid } });
    },

    release: (id) => {
      const pet = get().pets.find((p) => p.uid === id);
      if (!pet) return;
      commit({ pets: get().pets.filter((p) => p.uid !== id), event: { kind: "released", dexId: pet.dexId } });
    },

    act: (id, action, list) => {
      const pet = get().pets.find((p) => p.uid === id);
      if (!pet || pet.dexId === null) return;
      const result = act(pet, action, Date.now());
      let next = result.pet;
      let event: TamaEvent = { kind: "action", uid: id, dexId: pet.dexId, outcome: result.outcome, coins: result.coins };
      const evolved = evolve(next, dexOf(list));
      if (evolved && evolved.dexId !== null) {
        event = { kind: "evolved", uid: id, from: pet.dexId, to: evolved.dexId };
        next = evolved;
      }
      commit({
        pets: get().pets.map((p) => (p.uid === id ? next : p)),
        coins: get().coins + result.coins + (event.kind === "evolved" ? 50 : 0),
        event,
      });
    },

    refresh: (list) => {
      const now = Date.now();
      const pool = eggPool(list);
      let hatched: TamaEvent | null = null;
      const pets = get().pets.map((p) => {
        const born = hatch(p, pool, now);
        if (born && born.dexId !== null) {
          hatched = { kind: "hatched", uid: born.uid, dexId: born.dexId };
          return born;
        }
        return tick(p, now);
      });
      commit(hatched ? { pets, event: hatched } : { pets });
    },
  };
});
