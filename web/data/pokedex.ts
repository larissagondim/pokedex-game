export interface Stats {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

/** One entry of public/data/pokedex.json (built by scripts/sync-assets.mjs). */
export interface Pokemon {
  id: number;
  name: string;
  types: string[];
  genus: string | null;
  description: string | null;
  generation: string;
  heightM: number;
  weightKg: number;
  abilities: { name: string; hidden: boolean }[];
  stats: Stats;
  /** Whether animated/<id>.gif exists (falls back to the static sprite). */
  animated: boolean;
}

export const POKEDEX_URL = "/data/pokedex.json";

export const formatDexNumber = (id: number) => `#${String(id).padStart(4, "0")}`;
