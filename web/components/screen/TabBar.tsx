import styles from "./screen.module.css";

interface Props {
  tabs: readonly string[];
  active: number;
  onChange: (index: number) => void;
}

export function TabBar({ tabs, active, onChange }: Props) {
  const step = (delta: number) => onChange((active + delta + tabs.length) % tabs.length);
  return (
    <nav className={styles.tabBar}>
      <button type="button" className={styles.tabArrow} onClick={() => step(-1)} aria-label="Aba anterior">
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
          </button>
        ))}
      </div>
      <button type="button" className={styles.tabArrow} onClick={() => step(1)} aria-label="Próxima aba">
        ▶
      </button>
    </nav>
  );
}
