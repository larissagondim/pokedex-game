import { formatDexNumber } from "@/data/pokedex";
import { countInRange } from "@/lib/dexProgress";
import type { Region } from "@/lib/regions";
import { useDexProgress } from "@/stores/dexProgress";
import styles from "./screen.module.css";

interface Props {
  region: Region | null;
  /** The "coming soon" slot after the last region. */
  teaser?: boolean;
  onStep: (delta: number) => void;
}

/** "◀ KANTO ● 12/151 #0001–#0151 ▶": the region under the cursor and how much of it is caught; arrows jump regions. */
export function RegionBar({ region, teaser = false, onStep }: Props) {
  const caught = useDexProgress((s) => s.caught);
  return (
    <div className={styles.regionBar}>
      <button type="button" onClick={() => onStep(-1)} aria-label="Previous region">
        ◀
      </button>
      <span className={styles.regionName}>{teaser ? "???" : region ? region.name.toUpperCase() : "—"}</span>
      {teaser && <span className={styles.regionRange}>GEN X</span>}
      {region && (
        <span className={styles.regionCaught} title="Caught in this region">
          <i className={styles.caughtMark} data-mark="caught" aria-hidden />
          {countInRange(caught, region.first, region.last)}/{region.last - region.first + 1}
        </span>
      )}
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
