import { create } from "zustand";
import { type Appearance, BADGES, type BadgeId, cleanName, DEFAULT_APPEARANCE, newTrainerId, sanitizeAppearance } from "@/lib/trainer";

const STORAGE_KEY = "pokedex-game:trainer";

interface Profile {
  /** Empty until the profile is created. */
  name: string;
  appearance: Appearance;
  /** Five-digit ID, given on creation. */
  id: string;
  /** When the profile was created (ms), or null before that. */
  since: number | null;
  /** Badges earned, with when (ms). Kept even if the condition stops holding. */
  badges: Partial<Record<BadgeId, number>>;
}

const EMPTY: Profile = { name: "", appearance: DEFAULT_APPEARANCE, id: "", since: null, badges: {} };

function loadBadges(value: unknown): Profile["badges"] {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(BADGES.filter((b) => typeof v[b.id] === "number").map((b) => [b.id, v[b.id] as number]));
}

function load(): Profile {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Profile> | null;
    if (saved && typeof saved === "object") {
      return {
        name: typeof saved.name === "string" ? cleanName(saved.name).trim() : "",
        appearance: sanitizeAppearance(saved.appearance),
        id: typeof saved.id === "string" ? saved.id : "",
        since: typeof saved.since === "number" ? saved.since : null,
        badges: loadBadges(saved.badges),
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
  /** Marks badges as earned; returns the ones that are new. */
  earn: (ids: readonly BadgeId[]) => BadgeId[];
}

function persist(profile: Profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable: the profile lasts for this session only.
  }
}

const profileOf = ({ name, appearance, id, since, badges }: Profile): Profile => ({ name, appearance, id, since, badges });

/** The player's trainer profile, in localStorage. */
export const useTrainer = create<TrainerState>((set, get) => ({
  ...(typeof window === "undefined" ? EMPTY : load()),
  save: (name, appearance) => {
    const { id, since, badges } = get();
    const profile: Profile = {
      name: cleanName(name).trim(),
      appearance,
      id: id || newTrainerId(),
      since: since ?? Date.now(),
      badges,
    };
    set(profile);
    persist(profile);
  },
  earn: (ids) => {
    const fresh = ids.filter((id) => get().badges[id] === undefined);
    if (fresh.length === 0) return [];
    const now = Date.now();
    set({ badges: { ...get().badges, ...Object.fromEntries(fresh.map((id) => [id, now])) } });
    persist(profileOf(get()));
    return fresh;
  },
}));
