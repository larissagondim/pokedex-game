import type { Ref } from "react";
import styles from "./screen.module.css";

interface Props {
  ref?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  /** Arrow keys while typing move the list cursor. */
  onMove: (delta: number) => void;
  onSubmit: () => void;
  /** Highlighted as the D-pad's current target (above the first row). */
  selected?: boolean;
  onOpenKeyboard: () => void;
}

/**
 * Search field above the list. Typing in it with a real keyboard turns the
 * global key mapping off (letters are typed), so it handles the arrows, Enter
 * and Esc itself. With the device buttons, the on-screen keyboard (⌨) types.
 */
export function SearchBar({ ref, value, onChange, onMove, onSubmit, selected = false, onOpenKeyboard }: Props) {
  return (
    <div className={styles.search} data-selected={selected}>
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
      <button type="button" className={styles.kbdButton} onClick={onOpenKeyboard} aria-label="Open on-screen keyboard">
        ⌨
      </button>
    </div>
  );
}
