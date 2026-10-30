import { formatDexNumber } from "@/data/pokedex";
import type { Region } from "@/lib/regions";
import styles from "./screen.module.css";

interface Props {
  region: Region | null;
  /** The "coming soon" slot after the last region. */
  teaser?: boolean;
  onStep: (delta: number) => void;
}

/** "◀ KANTO #0001–#0151 ▶": the region under the cursor; arrows jump regions. */
export function RegionBar({ region, teaser = false, onStep }: Props) {
  return (
    <div className={styles.regionBar}>
      <button type="button" onClick={() => onStep(-1)} aria-label="Previous region">
        ◀
      </button>
      <span className={styles.regionName}>{teaser ? "???" : region ? region.name.toUpperCase() : "—"}</span>
      {teaser && <span className={styles.regionRange}>GEN X</span>}
      {region && (
        <span className={styles.regionRange}>
          {formatDexNumber(region.first)}–{formatDexNumber(region.last)}
        </span>
      )}
      <button type="button" onClick={() => onStep(1)} aria-label="Next region">
        ▶
      </button>
    </div>
  );
}
