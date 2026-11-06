import { create } from "zustand";
import { type Appearance, cleanName, DEFAULT_APPEARANCE, newTrainerId, sanitizeAppearance } from "@/lib/trainer";

const STORAGE_KEY = "pokedex-game:trainer";

interface Profile {
  /** Empty until the profile is created. */
  name: string;
  appearance: Appearance;
  /** Five-digit ID, given on creation. */
  id: string;
  /** When the profile was created (ms), or null before that. */
  since: number | null;
}

const EMPTY: Profile = { name: "", appearance: DEFAULT_APPEARANCE, id: "", since: null };

function load(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Profile> | null;
    if (saved && typeof saved === "object") {
      return {
        name: typeof saved.name === "string" ? cleanName(saved.name).trim() : "",
        appearance: sanitizeAppearance(saved.appearance),
        id: typeof saved.id === "string" ? saved.id : "",
        since: typeof saved.since === "number" ? saved.since : null,
      };
    }
  } catch {
    // No storage or bad data: start fresh.
  }
  return EMPTY;
}

interface TrainerState extends Profile {
  /** Saves the name and look; the first save creates the profile (ID and date). */
  save: (name: string, appearance: Appearance) => void;
}

/** The player's trainer profile, in localStorage. */
export const useTrainer = create<TrainerState>((set, get) => ({
  ...(typeof window === "undefined" ? EMPTY : load()),
  save: (name, appearance) => {
    const { id, since } = get();
    const profile: Profile = {
      name: cleanName(name).trim(),
      appearance,
      id: id || newTrainerId(),
      since: since ?? Date.now(),
    };
    set(profile);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Storage unavailable: the profile lasts for this session only.
    }
  },
}));
