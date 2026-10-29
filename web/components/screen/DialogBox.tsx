import styles from "./screen.module.css";

interface Props {
  text: string;
  /** Show the blinking ▼ (text finished and the box expects A). */
  waiting: boolean;
}

export function DialogBox({ text, waiting }: Props) {
  return (
    <div className={styles.panel + " " + styles.dialog} aria-live="polite">
      <p>{text}</p>
      {waiting && (
        <span className={styles.more} aria-hidden>
          ▼
        </span>
      )}
    </div>
  );
}
