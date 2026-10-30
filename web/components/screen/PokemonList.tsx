import type { ReactNode } from "react";
import { formatDexNumber, type Pokemon } from "@/data/pokedex";
import styles from "./screen.module.css";

export const VISIBLE_ROWS = 5;

interface Props {
  items: Pokemon[];
  cursor: number;
  selectedId: number | null;
  onRowClick: (index: number) => void;
  /** Rendered above the rows (the search bar). */
  header?: ReactNode;
  emptyText?: string;
}

export function PokemonList({ items, cursor, selectedId, onRowClick, header, emptyText }: Props) {
  // Keep the cursor about a third of the way down the visible window.
  const start = Math.max(0, Math.min(cursor - 2, items.length - VISIBLE_ROWS));
  const rows = items.slice(start, start + VISIBLE_ROWS);

  return (
    <div className={styles.panel + " " + styles.list}>
      {header}
      {items.length === 0 && emptyText && <p className={styles.empty}>{emptyText}</p>}
      {start > 0 && <span className={styles.scrollUp}>▲</span>}
      <ul role="listbox" aria-label="Pokémon" aria-activedescendant={`dex-${items[cursor]?.id}`}>
        {rows.map((p, i) => {
          const index = start + i;
          return (
            <li
              key={p.id}
              id={`dex-${p.id}`}
              role="option"
              aria-selected={p.id === selectedId}
              className={styles.row}
              data-focused={index === cursor}
              data-selected={p.id === selectedId}
              onClick={() => onRowClick(index)}
            >
              <span className={styles.cursor} aria-hidden>
                {index === cursor ? "▶" : ""}
              </span>
              <span className={styles.dexNo}>{formatDexNumber(p.id)}</span>
              <span className={styles.rowName}>{p.name.toUpperCase()}</span>
            </li>
          );
        })}
      </ul>
      {start + VISIBLE_ROWS < items.length && <span className={styles.scrollDown}>▼</span>}
    </div>
  );
}
