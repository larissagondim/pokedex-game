import { formatDexNumber, type MockPokemon } from "@/data/mockPokemon";
import { HpBar } from "./HpBar";
import styles from "./screen.module.css";

export function PreviewPanel({ pokemon }: { pokemon: MockPokemon }) {
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
      <HpBar percent={pokemon.hpPercent} />
    </div>
  );
}
