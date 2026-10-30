import type { Ref } from "react";
import styles from "./screen.module.css";

interface Props {
  ref?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  /** Arrow keys while typing move the list cursor. */
  onMove: (delta: number) => void;
  onSubmit: () => void;
}

/**
 * Search field above the list. While it has focus the global key mapping is
 * off (letters are typed), so it handles the arrows, Enter and Esc itself.
 */
export function SearchBar({ ref, value, onChange, onMove, onSubmit }: Props) {
  return (
    <label className={styles.search}>
      <span aria-hidden>⌕</span>
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder="Search name or #  ( / )"
        aria-label="Search Pokémon by name or number"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            onMove(e.key === "ArrowDown" ? 1 : -1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation(); // don't also leave zoom
            if (value) onChange("");
            else e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
