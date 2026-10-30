import { formatDexNumber } from "@/data/pokedex";
import type { Region } from "@/lib/regions";
import styles from "./screen.module.css";

interface Props {
  region: Region | null;
  onStep: (delta: number) => void;
}

/** "◀ KANTO #0001–#0151 ▶": the region under the cursor; arrows jump regions. */
export function RegionBar({ region, onStep }: Props) {
  return (
    <div className={styles.regionBar}>
      <button type="button" onClick={() => onStep(-1)} aria-label="Região anterior">
        ◀
      </button>
      <span className={styles.regionName}>{region ? region.name.toUpperCase() : "—"}</span>
      {region && (
        <span className={styles.regionRange}>
          {formatDexNumber(region.first)}–{formatDexNumber(region.last)}
        </span>
      )}
      <button type="button" onClick={() => onStep(1)} aria-label="Próxima região">
        ▶
      </button>
    </div>
  );
}
