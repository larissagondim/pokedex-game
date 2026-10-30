import type { ReactNode } from "react";
import { formatDexNumber, type Pokemon } from "@/data/pokedex";
import styles from "./screen.module.css";

export const VISIBLE_ROWS = 5;

interface Props {
  items: Pokemon[];
  cursor: number;
  selectedId: number | null;
  favorites: ReadonlySet<number>;
  /** Length of the searched prefix to highlight in each name (0 = none). */
  highlight: number;
  onRowClick: (index: number) => void;
  /** Rendered above the rows (search, options, region). */
  header?: ReactNode;
  /** Replaces the rows (e.g. the "coming soon" region). */
  placeholder?: ReactNode;
  emptyText?: string;
}

export function PokemonList({ items, cursor, selectedId, favorites, highlight, onRowClick, header, placeholder, emptyText }: Props) {
  // Keep the cursor about a third of the way down the visible window.
  const start = Math.max(0, Math.min(cursor - 2, items.length - VISIBLE_ROWS));
  const rows = placeholder ? [] : items.slice(start, start + VISIBLE_ROWS);

  return (
    <div className={styles.panel + " " + styles.list}>
      {header}
      {placeholder}
      {!placeholder && items.length === 0 && emptyText && <p className={styles.empty}>{emptyText}</p>}
      <div className={styles.rows}>
        {start > 0 && rows.length > 0 && <span className={styles.scrollUp}>▲</span>}
        <ul role="listbox" aria-label="Pokémon" aria-activedescendant={`dex-${items[cursor]?.id}`}>
          {rows.map((p, i) => {
            const index = start + i;
            const name = p.name.toUpperCase();
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.rowSprite} src={`/sprites/${p.id}.png`} alt="" width={28} height={28} draggable={false} />
                <span className={styles.dexNo}>{formatDexNumber(p.id)}</span>
                <span className={styles.rowName}>
                  {highlight > 0 ? (
                    <>
                      <mark>{name.slice(0, highlight)}</mark>
                      {name.slice(highlight)}
                    </>
                  ) : (
                    name
                  )}
                </span>
                <span className={styles.rowTypes} aria-label={p.types.join(", ")}>
                  {p.types.map((t) => (
                    <span key={t} className={styles.typeDot} data-type={t} />
                  ))}
                </span>
                <span className={styles.fav} aria-label={favorites.has(p.id) ? "Favorite" : undefined}>
                  {favorites.has(p.id) ? "★" : ""}
                </span>
              </li>
            );
          })}
        </ul>
        {start + VISIBLE_ROWS < items.length && rows.length > 0 && <span className={styles.scrollDown}>▼</span>}
      </div>
    </div>
  );
}
