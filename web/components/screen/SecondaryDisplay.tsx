"use client";

import { formatDexNumber, MOCK_POKEMON } from "@/data/mockPokemon";
import { usePokedex } from "@/stores/pokedex";
import styles from "./screen.module.css";

/** Strip on the right half: "#0000 · name" of the selected Pokémon. */
export function SecondaryDisplay() {
  const selectedId = usePokedex((s) => s.selectedId);
  const pokemon = MOCK_POKEMON.find((p) => p.id === selectedId);
  return (
    <div className={styles.secondary}>
      {pokemon ? `${formatDexNumber(pokemon.id)} · ${pokemon.name.toUpperCase()}` : "#0000 · ----------"}
    </div>
  );
}
