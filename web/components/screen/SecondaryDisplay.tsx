"use client";

import { formatDexNumber } from "@/data/pokedex";
import { usePokedex } from "@/stores/pokedex";
import styles from "./screen.module.css";

/** Strip on the right half: "#0000 · name" of the selected Pokémon. */
export function SecondaryDisplay() {
  const pokemon = usePokedex((s) => s.list.find((p) => p.id === s.selectedId));
  return (
    <div className={styles.secondary}>
      {pokemon ? `${formatDexNumber(pokemon.id)} · ${pokemon.name.toUpperCase()}` : "#0000 · ----------"}
    </div>
  );
}
