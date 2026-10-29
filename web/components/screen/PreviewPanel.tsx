import { formatDexNumber, type Pokemon } from "@/data/pokedex";
import { HpBar } from "./HpBar";
import styles from "./screen.module.css";

/** Base HP that fills the bar; few Pokémon go above it. */
const HP_SCALE = 150;

export function PreviewPanel({ pokemon }: { pokemon: Pokemon }) {
  return (
    <div className={styles.panel + " " + styles.preview}>
      <div className={styles.spriteFrame}>
        {/* Plain <img>: tiny pixel sprites shouldn't go through image optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.sprite}
          src={`/sprites/${pokemon.id}.png`}
          alt={pokemon.name}
          width={96}
          height={96}
          draggable={false}
        />
      </div>
      <div className={styles.previewName}>
        <span>{formatDexNumber(pokemon.id)}</span> {pokemon.name.toUpperCase()}
      </div>
      <div className={styles.genus}>{pokemon.genus}</div>
      <div className={styles.types}>
        {pokemon.types.map((t) => (
          <span key={t} className={styles.type} data-type={t}>
            {t.toUpperCase()}
          </span>
        ))}
      </div>
      <HpBar percent={(pokemon.stats.hp / HP_SCALE) * 100} value={String(pokemon.stats.hp)} />
    </div>
  );
}
