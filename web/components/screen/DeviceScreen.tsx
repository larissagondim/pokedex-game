"use client";

import { useEffect, useRef, useState } from "react";
import { MOCK_POKEMON } from "@/data/mockPokemon";
import { useTypewriter } from "@/hooks/useTypewriter";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { useDeviceState } from "@/stores/deviceState";
import { usePokedex } from "@/stores/pokedex";
import { DialogBox } from "./DialogBox";
import { PokemonList } from "./PokemonList";
import { PreviewPanel } from "./PreviewPanel";
import styles from "./screen.module.css";
import { TabBar } from "./TabBar";

const TABS = ["POKÉDEX", "BATALHA", "TAMAGOTCHI"] as const;
const HINT = "▶ Direcional: navegar   A: selecionar   B: voltar   MENU: menu";

/** Runs before the device controller, so the UI gets first say on each button. */
const SCREEN_INPUT_PRIORITY = 10;

const wrap = (i: number, n: number) => (i + n) % n;

interface Props {
  onRequestZoom: () => void;
}

/** The interface rendered inside the 4:3 main screen. */
export function DeviceScreen({ onRequestZoom }: Props) {
  const [tab, setTab] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [menu, setMenu] = useState<number | null>(null);
  const [dialog, setDialog] = useState<string | null>(null);
  const selectedId = usePokedex((s) => s.selectedId);
  const typing = useTypewriter(dialog);

  const focused = MOCK_POKEMON[cursor];

  const confirm = (index: number) => {
    const p = MOCK_POKEMON[index];
    setCursor(index);
    usePokedex.getState().select(p.id);
    setDialog(`${p.name.toUpperCase()}, o ${p.genus}. ${p.description}`);
  };

  /** Returns true when the screen consumed the button. */
  const handle = (button: DeviceButton): boolean => {
    if (button === "ZOOM") return false;

    if (menu !== null) {
      if (button === "UP" || button === "DOWN") {
        setMenu(wrap(menu + (button === "UP" ? -1 : 1), TABS.length));
      } else if (button === "A") {
        setTab(menu);
        setMenu(null);
      } else if (button === "B" || button === "MENU") {
        setMenu(null);
      }
      return true;
    }

    if (dialog !== null) {
      if (button === "A") {
        if (typing.done) setDialog(null);
        else typing.finish();
      } else if (button === "B") {
        setDialog(null);
      }
      return true;
    }

    switch (button) {
      case "UP":
      case "DOWN":
        if (tab === 0) setCursor((c) => wrap(c + (button === "UP" ? -1 : 1), MOCK_POKEMON.length));
        return true;
      case "LEFT":
      case "RIGHT":
        setTab((t) => wrap(t + (button === "LEFT" ? -1 : 1), TABS.length));
        return true;
      case "A":
        if (tab === 0) confirm(cursor);
        return true;
      case "MENU":
        setMenu(tab);
        return true;
      case "B":
        if (tab !== 0) {
          setTab(0);
          return true;
        }
        return false; // nothing to go back to: let the device leave zoom
    }
    return false;
  };

  // Subscribe once; always call the latest handler (it closes over state).
  const handler = useRef(handle);
  useEffect(() => {
    handler.current = handle;
  });
  useEffect(
    () =>
      useDeviceInput.getState().subscribe((button) => {
        if (!useDeviceState.getState().open) return false;
        return handler.current(button);
      }, SCREEN_INPUT_PRIORITY),
    [],
  );

  const dialogText = dialog !== null ? typing.visible : tab === 0 ? HINT : "Em breve!";

  return (
    <div
      className={styles.screen}
      // Keep pointer input inside the screen from rotating the camera.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onRequestZoom();
      }}
    >
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 0 ? (
        <div className={styles.body}>
          <PokemonList
            items={MOCK_POKEMON}
            cursor={cursor}
            selectedId={selectedId}
            onRowClick={(i) => {
              if (dialog !== null) return; // the dialog has focus until dismissed
              if (i === cursor) confirm(i);
              else setCursor(i);
            }}
          />
          <PreviewPanel pokemon={focused} />
        </div>
      ) : (
        <div className={styles.panel + " " + styles.soon}>
          <h2>{TABS[tab]}</h2>
          <p>Em breve</p>
        </div>
      )}

      <DialogBox text={dialogText} waiting={dialog !== null && typing.done} />

      {menu !== null && (
        <div className={styles.menu} role="menu">
          <h3>MENU</h3>
          {TABS.map((t, i) => (
            <div
              key={t}
              role="menuitem"
              className={styles.menuItem}
              data-focused={i === menu}
              onClick={() => {
                setTab(i);
                setMenu(null);
              }}
            >
              <span className={styles.cursor}>{i === menu ? "▶" : ""}</span>
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
