"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import styles from "./battle.module.css";

/** Above the main screen handler (10), like the other tabs. */
const INPUT_PRIORITY = 11;

export interface MenuOption {
  label: string;
  detail?: string;
}

interface Props {
  title: string;
  options: MenuOption[];
  active: boolean;
  onPick: (index: number) => void;
  /** B; return false to let the screen handle it. */
  onBack: () => boolean;
  /** Extra content under the options (e.g. the record). */
  children?: ReactNode;
}

/**
 * A retro menu box on the battle backdrop: ▲▼ move the ▶ cursor, A picks,
 * B goes back. The highlighted option's detail shows at the bottom.
 */
export function BattleMenu({ title, options, active, onPick, onBack, children }: Props) {
  const [cursor, setCursor] = useState(0);

  const handle = (button: DeviceButton): boolean => {
    switch (button) {
      case "UP":
      case "DOWN":
        setCursor((c) => (c + (button === "UP" ? -1 : 1) + options.length) % options.length);
        return true;
      case "A":
        onPick(cursor);
        return true;
      case "B":
        return onBack();
    }
    return false;
  };

  const handler = useRef(handle);
  const activeRef = useRef(active);
  useEffect(() => {
    handler.current = handle;
    activeRef.current = active;
  });
  useEffect(
    () => useDeviceInput.getState().subscribe((button) => activeRef.current && handler.current(button), INPUT_PRIORITY),
    [],
  );

  const detail = options[cursor]?.detail;
  return (
    <div className={styles.scene} data-terrain="field">
      <div className={styles.backdrop} aria-hidden />
      <div className={styles.menu} role="menu" aria-label={title}>
        <div className={styles.menuTitle}>{title}</div>
        {options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            role="menuitem"
            className={styles.menuItem}
            aria-current={i === cursor}
            onClick={() => (i === cursor ? onPick(i) : setCursor(i))}
          >
            <span className={styles.moveCursor} aria-hidden>
              {i === cursor ? "▶" : ""}
            </span>
            {o.label}
          </button>
        ))}
        {children}
      </div>
      {detail && <div className={styles.menuDetail}>{detail}</div>}
    </div>
  );
}
