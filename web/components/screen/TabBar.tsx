import styles from "./screen.module.css";

interface Props {
  tabs: readonly string[];
  active: number;
  onChange: (index: number) => void;
  onClose: () => void;
  /** Tabs that want attention get a blinking "!". */
  alerts?: readonly boolean[];
}

export function TabBar({ tabs, active, onChange, onClose, alerts = [] }: Props) {
  const step = (delta: number) => onChange((active + delta + tabs.length) % tabs.length);
  return (
    <nav className={styles.tabBar}>
      <button type="button" className={styles.tabArrow} onClick={() => step(-1)} aria-label="Previous tab">
        ◀
      </button>
      <div className={styles.tabs} role="tablist">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={styles.tab}
            data-active={i === active}
            onClick={() => onChange(i)}
          >
            {tab}
            {alerts[i] && (
              <span className={styles.tabAlert} aria-label="needs attention">
                !
              </span>
            )}
          </button>
        ))}
      </div>
      <button type="button" className={styles.tabArrow} onClick={() => step(1)} aria-label="Next tab">
        ▶
      </button>
      <button type="button" className={styles.tabArrow + " " + styles.closeButton} onClick={onClose} aria-label="Close device">
        ⏻
      </button>
    </nav>
  );
}
