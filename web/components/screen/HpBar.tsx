import styles from "./screen.module.css";

export function hpTone(percent: number) {
  if (percent > 50) return "high";
  if (percent >= 20) return "mid";
  return "low";
}

interface Props {
  percent: number;
  /** Text after the bar; defaults to the percentage. */
  value?: string;
}

export function HpBar({ percent, value }: Props) {
  const clamped = Math.round(Math.max(0, Math.min(100, percent)));
  return (
    <div className={styles.hp}>
      <span className={styles.hpLabel}>HP</span>
      <div
        className={styles.hpTrack}
        role="meter"
        aria-label="HP"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
      >
        <div className={styles.hpFill} data-tone={hpTone(clamped)} style={{ width: `${clamped}%` }} />
      </div>
      <span className={styles.hpValue}>{value ?? `${clamped}%`}</span>
    </div>
  );
}
