import styles from "./screen.module.css";

export interface KeyDef {
  /** What's shown on the key. */
  label: string;
  /** Text typed, or an action. */
  value: string | "BACKSPACE" | "CLEAR" | "OK";
  /** Grid columns it spans (each row has 10 columns). */
  span: number;
}

const COLUMNS = 10;

const letters = (chars: string): KeyDef[] => [...chars].map((c) => ({ label: c, value: c, span: 1 }));

/** Rows of 10 grid columns; wider keys span several. */
export const KEY_ROWS: KeyDef[][] = [
  letters("ABCDEFGHIJ"),
  letters("KLMNOPQRST"),
  [...letters("UVWXYZ.-'"), { label: "␣", value: " ", span: 1 }],
  letters("0123456789"),
  [
    { label: "#", value: "#", span: 2 },
    { label: "⌫", value: "BACKSPACE", span: 2 },
    { label: "CLEAR", value: "CLEAR", span: 3 },
    { label: "OK", value: "OK", span: 3 },
  ],
];

/** Cursor on the keyboard: row, and the grid column it's in (kept on vertical moves). */
export interface KeyPos {
  row: number;
  col: number;
}

/** Index of the key in `row` covering grid column `col`. */
function keyAt(row: KeyDef[], col: number) {
  let start = 0;
  for (let i = 0; i < row.length; i++) {
    if (col < start + row[i].span) return i;
    start += row[i].span;
  }
  return row.length - 1;
}

const startCol = (row: KeyDef[], index: number) => row.slice(0, index).reduce((sum, k) => sum + k.span, 0);

export const keyFor = (pos: KeyPos) => KEY_ROWS[pos.row][keyAt(KEY_ROWS[pos.row], pos.col)];

/** Moves the keyboard cursor; wraps around rows and columns. */
export function moveKey(pos: KeyPos, dx: number, dy: number): KeyPos {
  if (dy !== 0) {
    const row = (pos.row + dy + KEY_ROWS.length) % KEY_ROWS.length;
    return { row, col: pos.col };
  }
  const keys = KEY_ROWS[pos.row];
  const index = (keyAt(keys, pos.col) + dx + keys.length) % keys.length;
  return { row: pos.row, col: startCol(keys, index) };
}

interface Props {
  pos: KeyPos;
  resultCount: number;
  onKey: (key: KeyDef, pos: KeyPos) => void;
}

/** Retro on-screen keyboard driven by the D-pad (or clicks). */
export function OnScreenKeyboard({ pos, resultCount, onKey }: Props) {
  const focused = keyFor(pos);
  return (
    <div className={styles.panel + " " + styles.keyboard} role="group" aria-label="On-screen keyboard">
      {KEY_ROWS.map((row, r) => (
        <div key={r} className={styles.keyRow} style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }}>
          {row.map((key, i) => (
            <button
              key={key.label}
              type="button"
              className={styles.key}
              data-focused={key === focused}
              style={{ gridColumn: `span ${key.span}` }}
              onClick={() => onKey(key, { row: r, col: startCol(row, i) })}
            >
              {key.label}
            </button>
          ))}
        </div>
      ))}
      <p className={styles.keyboardStatus}>
        {resultCount} result{resultCount === 1 ? "" : "s"} · B: delete · MENU: done
      </p>
    </div>
  );
}
