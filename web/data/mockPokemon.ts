export type PokemonType =
  | "grass"
  | "poison"
  | "fire"
  | "flying"
  | "water"
  | "bug";

export interface MockPokemon {
  id: number;
  name: string;
  types: PokemonType[];
  genus: string;
  description: string;
  /** Fake current HP (percent) just to exercise the HP bar colors. */
  hpPercent: number;
}

// First 12 entries of data/pokemon.json, with a made-up hpPercent.
export const MOCK_POKEMON: MockPokemon[] = [
  { id: 1, name: "Bulbasaur", types: ["grass", "poison"], genus: "Seed Pokémon", hpPercent: 100, description: "While it is young, it uses the nutrients that are stored in the seed on its back in order to grow." },
  { id: 2, name: "Ivysaur", types: ["grass", "poison"], genus: "Seed Pokémon", hpPercent: 85, description: "Exposure to sunlight adds to its strength. Sunlight also makes the bud on its back grow larger." },
  { id: 3, name: "Venusaur", types: ["grass", "poison"], genus: "Seed Pokémon", hpPercent: 62, description: "A bewitching aroma wafts from its flower. The fragrance becalms those engaged in a battle." },
  { id: 4, name: "Charmander", types: ["fire"], genus: "Lizard Pokémon", hpPercent: 48, description: "From the time it is born, a flame burns at the tip of its tail. Its life would end if the flame were to go out." },
  { id: 5, name: "Charmeleon", types: ["fire"], genus: "Flame Pokémon", hpPercent: 35, description: "If it becomes agitated during battle, it spouts intense flames, incinerating its surroundings." },
  { id: 6, name: "Charizard", types: ["fire", "flying"], genus: "Flame Pokémon", hpPercent: 22, description: "Its wings can carry this Pokémon close to an altitude of 4,600 feet. It blows out fire at very high temperatures." },
  { id: 7, name: "Squirtle", types: ["water"], genus: "Tiny Turtle Pokémon", hpPercent: 100, description: "When it feels threatened, it draws its limbs inside its shell and sprays water from its mouth." },
  { id: 8, name: "Wartortle", types: ["water"], genus: "Turtle Pokémon", hpPercent: 70, description: "It cleverly controls its furry ears and tail to maintain its balance while swimming." },
  { id: 9, name: "Blastoise", types: ["water"], genus: "Shellfish Pokémon", hpPercent: 40, description: "The rocket cannons on its shell fire jets of water capable of punching holes through thick steel." },
  { id: 10, name: "Caterpie", types: ["bug"], genus: "Worm Pokémon", hpPercent: 18, description: "Its short feet are tipped with suction pads that enable it to tirelessly climb slopes and walls." },
  { id: 11, name: "Metapod", types: ["bug"], genus: "Cocoon Pokémon", hpPercent: 9, description: "Even though it is encased in a sturdy shell, the body inside is tender. It can’t withstand a harsh attack." },
  { id: 12, name: "Butterfree", types: ["bug", "flying"], genus: "Butterfly Pokémon", hpPercent: 55, description: "It collects honey every day. It rubs honey onto the hairs on its legs to carry it back to its nest." },
];

export const formatDexNumber = (id: number) => `#${String(id).padStart(4, "0")}`;
