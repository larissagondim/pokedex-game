/** Battle backdrop, picked from the opponent's first type. */
export type Terrain = "field" | "sea" | "snow" | "volcano" | "rocky" | "cave" | "mystic" | "sky" | "power";

const BY_TYPE: Record<string, Terrain> = {
  normal: "field",
  grass: "field",
  bug: "field",
  water: "sea",
  ice: "snow",
  fire: "volcano",
  rock: "rocky",
  ground: "rocky",
  fighting: "rocky",
  steel: "rocky",
  ghost: "cave",
  dark: "cave",
  poison: "cave",
  psychic: "mystic",
  fairy: "mystic",
  dragon: "sky",
  flying: "sky",
  electric: "power",
};

export const terrainFor = (types: readonly string[] | undefined): Terrain => BY_TYPE[types?.[0] ?? ""] ?? "field";
