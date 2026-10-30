"use client";

import { useState } from "react";
import { formatDexNumber, type Pokemon, type Stats } from "@/data/pokedex";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import styles from "./screen.module.css";

const STAT_LABELS: [keyof Stats, string][] = [
  ["hp", "HP"],
  ["attack", "ATK"],
  ["defense", "DEF"],
  ["specialAttack", "SP.ATK"],
  ["specialDefense", "SP.DEF"],
  ["speed", "SPD"],
];

/** Box (CSS px) the animated sprite is scaled to fit, upscaling at most 2x. */
const STAGE_FIT = { width: 200, height: 112, maxScale: 2 };

/** Bars are scaled against this so typical stats fill a readable range. */
const STAT_SCALE = 160;

const statTone = (value: number) => (value >= 100 ? "high" : value >= 60 ? "mid" : "low");

interface Props {
  pokemon: Pokemon;
  prevId: number;
  nextId: number;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  favorite: boolean;
  onToggleFavorite: () => void;
  onAdopt: () => void;
}

/** Animated sprite; static sprite under reduced motion or when no GIF exists. */
function AnimatedSprite({ pokemon }: { pokemon: Pokemon }) {
  const reducedMotion = useReducedMotion();
  const [gifFailed, setGifFailed] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const useGif = pokemon.animated && !reducedMotion && !gifFailed;

  return (
    <div className={styles.stage} data-type={pokemon.types[0]}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={`${pokemon.id}-${useGif}`}
        className={useGif ? styles.stageGif : styles.stageStatic}
        src={useGif ? `/animated/${pokemon.id}.gif` : `/sprites/${pokemon.id}.png`}
        alt={pokemon.name}
        draggable={false}
        style={useGif && size ? size : undefined}
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
          // Real size, not transform: scale() keeps the layout box at natural size and overflows the stage.
          const fit = Math.min(STAGE_FIT.maxScale, STAGE_FIT.width / w, STAGE_FIT.height / h);
          setSize({ width: Math.round(w * fit), height: Math.round(h * fit) });
        }}
        onError={() => setGifFailed(true)}
      />
      <span className={styles.stageShadow} aria-hidden />
    </div>
  );
}

export function PokemonDetail({ pokemon, prevId, nextId, onPrev, onNext, onBack, favorite, onToggleFavorite, onAdopt }: Props) {
  const total = Object.values(pokemon.stats).reduce((a, b) => a + b, 0);

  return (
    <div className={styles.detail}>
      <div className={styles.panel + " " + styles.detailLeft}>
        <AnimatedSprite key={pokemon.id} pokemon={pokemon} />
        <div className={styles.detailNav}>
          <button type="button" onClick={onPrev} aria-label="Previous Pokémon">
            ◀ {formatDexNumber(prevId)}
          </button>
          <button type="button" onClick={onNext} aria-label="Next Pokémon">
            {formatDexNumber(nextId)} ▶
          </button>
        </div>
        <div className={styles.previewName}>
          <span>{formatDexNumber(pokemon.id)}</span> {pokemon.name.toUpperCase()}
          {favorite && <span className={styles.favStar}> ★</span>}
        </div>
        <div className={styles.genus}>{pokemon.genus}</div>
        <div className={styles.types}>
          {pokemon.types.map((t) => (
            <span key={t} className={styles.type} data-type={t}>
              {t.toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.panel + " " + styles.detailRight}>
        <div className={styles.detailHeader}>
          <h3>STATUS</h3>
          <span className={styles.detailActions}>
            <button type="button" className={styles.backButton} onClick={onAdopt}>
              ♥ ADOPT
            </button>
            <button type="button" className={styles.backButton} onClick={onToggleFavorite} aria-pressed={favorite}>
              MENU {favorite ? "★" : "☆"}
            </button>
            <button type="button" className={styles.backButton} onClick={onBack}>
              B BACK
            </button>
          </span>
        </div>
        <dl className={styles.stats}>
          {STAT_LABELS.map(([key, label]) => {
            const value = pokemon.stats[key];
            return (
              <div key={key} className={styles.statRow}>
                <dt>{label}</dt>
                <dd>{value}</dd>
                <div className={styles.statTrack}>
                  <div
                    className={styles.hpFill}
                    data-tone={statTone(value)}
                    style={{ width: `${Math.min(100, (value / STAT_SCALE) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div className={styles.statRow + " " + styles.statTotal}>
            <dt>TOTAL</dt>
            <dd>{total}</dd>
          </div>
        </dl>
        <div className={styles.facts}>
          <span>HT {pokemon.heightM.toFixed(1)} m</span>
          <span>WT {pokemon.weightKg.toFixed(1)} kg</span>
        </div>
        <div className={styles.abilities}>
          {pokemon.abilities.map((a) => (
            <span key={a.name} data-hidden={a.hidden}>
              {a.name.replace("-", " ").toUpperCase()}
              {a.hidden && " (hidden)"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
