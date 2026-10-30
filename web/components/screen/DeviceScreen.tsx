"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useScreenPower } from "@/hooks/useScreenPower";
import { useTypewriter } from "@/hooks/useTypewriter";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { acceptsInput, useDeviceState } from "@/stores/deviceState";
import { usePokedex } from "@/stores/pokedex";
import { DialogBox } from "./DialogBox";
import { PokemonDetail } from "./PokemonDetail";
import { PokemonList } from "./PokemonList";
import { PreviewPanel } from "./PreviewPanel";
import styles from "./screen.module.css";
import { TabBar } from "./TabBar";

const TABS = ["LISTA", "BATALHA", "TAMAGOTCHI"] as const;
const LIST_HINT = "▶ Direcional: navegar   A: abrir   MENU: trocar aba   ZOOM: zoom";

/** Runs before the device controller, so the UI gets first say on each button. */
const SCREEN_INPUT_PRIORITY = 10;

const wrap = (i: number, n: number) => (i + n) % n;

/** About three lines of the dialog box. */
const PAGE_CHARS = 135;

/** Splits text into dialog pages on word boundaries. */
function paginate(text: string) {
  const pages: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (current && current.length + 1 + word.length > PAGE_CHARS) {
      pages.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) pages.push(current);
  return pages;
}

interface Props {
  onRequestZoom: () => void;
}

/** The interface rendered inside the 4:3 main screen. */
export function DeviceScreen({ onRequestZoom }: Props) {
  const [tab, setTab] = useState(0);
  const [cursor, setCursor] = useState(0);
  /** Index of the Pokémon whose page is open, or null for the list. */
  const [detail, setDetail] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const selectedId = usePokedex((s) => s.selectedId);
  const list = usePokedex((s) => s.list);
  const status = usePokedex((s) => s.status);
  const power = useScreenPower();
  const zoomed = useDeviceState((s) => s.phase === "ZOOMED");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    usePokedex.getState().load();
  }, []);

  // The secondary screen shows whatever is under the cursor.
  useEffect(() => {
    usePokedex.getState().focus(list[cursor]?.id ?? null);
  }, [list, cursor]);

  // Zoomed in: the interface takes keyboard focus.
  useEffect(() => {
    if (zoomed) root.current?.focus({ preventScroll: true });
  }, [zoomed]);

  const detailPokemon = detail !== null ? list[detail] : null;
  const pages = useMemo(
    () =>
      detailPokemon
        ? paginate(
            [`${detailPokemon.name.toUpperCase()}${detailPokemon.genus ? `, the ${detailPokemon.genus}` : ""}.`, detailPokemon.description]
              .filter(Boolean)
              .join(" "),
          )
        : [],
    [detailPokemon],
  );
  const typing = useTypewriter(power === "on" ? (pages[page] ?? null) : null);
  const hasNextPage = page < pages.length - 1;

  const openDetail = (index: number) => {
    const p = list[index];
    setCursor(index);
    setDetail(index);
    setPage(0);
    usePokedex.getState().select(p.id);
    usePokedex.getState().playCry(p.id);
  };
  const stepDetail = (delta: number) => {
    if (detail !== null) openDetail(wrap(detail + delta, list.length));
  };
  const switchTab = (next: number) => {
    setTab(next);
    setDetail(null);
  };

  /** Returns true when the screen consumed the button. */
  const handle = (button: DeviceButton): boolean => {
    if (button === "ZOOM") return false;
    if (button === "MENU") {
      switchTab(wrap(tab + 1, TABS.length));
      return true;
    }

    if (detail !== null) {
      if (button === "LEFT" || button === "UP") stepDetail(-1);
      else if (button === "RIGHT" || button === "DOWN") stepDetail(1);
      else if (button === "A") {
        if (!typing.done) typing.finish();
        else if (hasNextPage) setPage((p) => p + 1);
      } else if (button === "B") setDetail(null);
      return true;
    }

    switch (button) {
      case "UP":
      case "DOWN":
        if (tab === 0 && list.length > 0) setCursor((c) => wrap(c + (button === "UP" ? -1 : 1), list.length));
        return true;
      case "LEFT":
      case "RIGHT":
        switchTab(wrap(tab + (button === "LEFT" ? -1 : 1), TABS.length));
        return true;
      case "A":
        if (tab === 0 && list.length > 0) openDetail(cursor);
        return true;
      case "B":
        if (tab !== 0) {
          switchTab(0);
          return true;
        }
        return false; // at the root: let the device leave zoom
    }
    return false;
  };

  // Subscribe once; always call the latest handler (it closes over state).
  const handler = useRef(handle);
  const powerRef = useRef(power);
  useEffect(() => {
    handler.current = handle;
    powerRef.current = power;
  });
  useEffect(
    () =>
      useDeviceInput.getState().subscribe((button) => {
        if (!acceptsInput(useDeviceState.getState().phase) || powerRef.current !== "on") return false;
        return handler.current(button);
      }, SCREEN_INPUT_PRIORITY),
    [],
  );

  const dialogText = detailPokemon ? typing.visible : tab === 0 ? LIST_HINT : "Em breve!";

  let body;
  if (tab !== 0) {
    body = (
      <div className={styles.panel + " " + styles.soon}>
        <h2>{TABS[tab]}</h2>
        <p>Em breve</p>
      </div>
    );
  } else if (status !== "ready") {
    body = (
      <div className={styles.panel + " " + styles.soon}>
        <p>{status === "error" ? "Erro ao carregar a Pokédex." : "Carregando…"}</p>
      </div>
    );
  } else if (detail !== null && detailPokemon) {
    const n = list.length;
    body = (
      <PokemonDetail
        pokemon={detailPokemon}
        prevId={list[wrap(detail - 1, n)].id}
        nextId={list[wrap(detail + 1, n)].id}
        onPrev={() => stepDetail(-1)}
        onNext={() => stepDetail(1)}
        onBack={() => setDetail(null)}
      />
    );
  } else {
    body = (
      <div className={styles.body}>
        <PokemonList
          items={list}
          cursor={cursor}
          selectedId={selectedId}
          onRowClick={(i) => (i === cursor ? openDetail(i) : setCursor(i))}
        />
        <PreviewPanel pokemon={list[cursor]} />
      </div>
    );
  }

  return (
    <div
      ref={root}
      tabIndex={-1}
      role="application"
      aria-label="Tela da Pokédex"
      className={styles.screen}
      // Keep pointer input inside the screen from rotating the camera.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onRequestZoom();
      }}
    >
      <TabBar tabs={TABS} active={tab} onChange={switchTab} onClose={() => useDeviceState.getState().close()} />
      {body}
      <DialogBox text={dialogText} waiting={typing.done && hasNextPage} />

      <div className={styles.powerOverlay} data-power={power} aria-hidden>
        <div className={styles.bootLine} />
        <div className={styles.bootLogo}>
          POKÉDEX
          <span>GAME</span>
        </div>
      </div>
    </div>
  );
}
