"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useScreenPower } from "@/hooks/useScreenPower";
import { useTypewriter } from "@/hooks/useTypewriter";
import { REGIONS, regionIndexOf } from "@/lib/regions";
import { searchPokemon } from "@/lib/search";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { acceptsInput, useDeviceState } from "@/stores/deviceState";
import { usePokedex } from "@/stores/pokedex";
import type { Pokemon } from "@/data/pokedex";
import { DialogBox } from "./DialogBox";
import { PokemonDetail } from "./PokemonDetail";
import { PokemonList } from "./PokemonList";
import { PreviewPanel } from "./PreviewPanel";
import { RegionBar } from "./RegionBar";
import { SearchBar } from "./SearchBar";
import styles from "./screen.module.css";
import { TabBar } from "./TabBar";

const TABS = ["LIST", "BATTLE", "TAMAGOTCHI"] as const;
const LIST_HINT = "▲▼ Pokémon   ◀▶ region   A: open   /: search   MENU: tab   ZOOM: zoom";

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
  /** Dex number of the Pokémon whose page is open, or null for the list. */
  const [detailId, setDetailId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const selectedId = usePokedex((s) => s.selectedId);
  const list = usePokedex((s) => s.list);
  const searchIndex = usePokedex((s) => s.searchIndex);
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  /** What the list shows: search results, or every Pokémon by number. */
  const items = useMemo(
    () => (query.trim() && searchIndex ? searchPokemon(searchIndex, query) : list),
    [query, searchIndex, list],
  );
  const status = usePokedex((s) => s.status);
  const power = useScreenPower();
  const zoomed = useDeviceState((s) => s.phase === "ZOOMED");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    usePokedex.getState().load();
  }, []);

  // Position of the open page in national order (pages step through the whole
  // Pokédex, even when opened from search results).
  const detailIndex = detailId !== null ? list.findIndex((p) => p.id === detailId) : -1;
  const detailPokemon = detailIndex >= 0 ? list[detailIndex] : null;

  // The secondary screen (and the region music) follow the open page, or else
  // whatever is under the cursor.
  useEffect(() => {
    usePokedex.getState().focus(detailPokemon?.id ?? items[cursor]?.id ?? null);
  }, [detailPokemon, items, cursor]);


  // Zoomed in: the interface takes keyboard focus.
  useEffect(() => {
    if (zoomed) root.current?.focus({ preventScroll: true });
  }, [zoomed]);

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

  const showPokemon = (p: Pokemon) => {
    setDetailId(p.id);
    setPage(0);
    // Keep the list cursor on it when it's among the listed items.
    const index = items.findIndex((item) => item.id === p.id);
    if (index >= 0) setCursor(index);
    usePokedex.getState().select(p.id);
    usePokedex.getState().playCry(p.id);
  };
  const openDetail = (index: number) => {
    if (items[index]) showPokemon(items[index]);
  };
  const stepDetail = (delta: number) => {
    if (detailIndex >= 0) showPokemon(list[wrap(detailIndex + delta, list.length)]);
  };
  const moveCursor = (delta: number) => {
    if (items.length > 0) setCursor((c) => wrap(c + delta, items.length));
  };
  /** Moves the cursor to the first item of the previous/next region present in the list (wraps). */
  const jumpRegion = (delta: number) => {
    if (items.length === 0) return;
    const current = regionIndexOf(items[cursor]?.id ?? 0);
    for (let step = 1; step <= REGIONS.length; step++) {
      const target = wrap(current + delta * step, REGIONS.length);
      const index = items.findIndex((p) => regionIndexOf(p.id) === target);
      if (index >= 0) {
        setCursor(index);
        return;
      }
    }
  };
  const changeQuery = (value: string) => {
    setQuery(value);
    setCursor(0);
  };
  const switchTab = (next: number) => {
    setTab(next);
    setDetailId(null);
  };

  /** Returns true when the screen consumed the button. */
  const handle = (button: DeviceButton): boolean => {
    if (button === "ZOOM") return false;
    if (button === "MENU") {
      switchTab(wrap(tab + 1, TABS.length));
      return true;
    }

    if (detailId !== null) {
      if (button === "LEFT" || button === "UP") stepDetail(-1);
      else if (button === "RIGHT" || button === "DOWN") stepDetail(1);
      else if (button === "A") {
        if (!typing.done) typing.finish();
        else if (hasNextPage) setPage((p) => p + 1);
      } else if (button === "B") setDetailId(null);
      return true;
    }

    switch (button) {
      case "UP":
      case "DOWN":
        if (tab === 0) moveCursor(button === "UP" ? -1 : 1);
        return true;
      case "LEFT":
      case "RIGHT":
        if (tab === 0) jumpRegion(button === "LEFT" ? -1 : 1);
        else switchTab(wrap(tab + (button === "LEFT" ? -1 : 1), TABS.length));
        return true;
      case "A":
        if (tab === 0) openDetail(cursor);
        return true;
      case "B":
        if (tab !== 0) {
          switchTab(0);
          return true;
        }
        if (query) {
          changeQuery("");
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

  // "/" jumps to the search field from anywhere on the list.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.target instanceof HTMLInputElement) return;
      if (!acceptsInput(useDeviceState.getState().phase) || powerRef.current !== "on") return;
      e.preventDefault();
      const focusInput = () => searchInput.current?.focus({ preventScroll: true });
      if (searchInput.current) {
        // Focus right away so keys typed right after "/" land in the field.
        focusInput();
      } else {
        // On another tab or a Pokémon page: show the list, focus once it mounts.
        setTab(0);
        setDetailId(null);
        requestAnimationFrame(focusInput);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const dialogText = detailPokemon ? typing.visible : tab === 0 ? LIST_HINT : "Coming soon!";

  let body;
  if (tab !== 0) {
    body = (
      <div className={styles.panel + " " + styles.soon}>
        <h2>{TABS[tab]}</h2>
        <p>Coming soon</p>
      </div>
    );
  } else if (status !== "ready") {
    body = (
      <div className={styles.panel + " " + styles.soon}>
        <p>{status === "error" ? "Could not load the Pokédex." : "Loading…"}</p>
      </div>
    );
  } else if (detailPokemon) {
    const n = list.length;
    body = (
      <PokemonDetail
        pokemon={detailPokemon}
        prevId={list[wrap(detailIndex - 1, n)].id}
        nextId={list[wrap(detailIndex + 1, n)].id}
        onPrev={() => stepDetail(-1)}
        onNext={() => stepDetail(1)}
        onBack={() => setDetailId(null)}
      />
    );
  } else {
    body = (
      <div className={styles.body}>
        <PokemonList
          items={items}
          cursor={cursor}
          selectedId={selectedId}
          onRowClick={(i) => (i === cursor ? openDetail(i) : setCursor(i))}
          emptyText="No Pokémon found."
          header={
            <>
              <SearchBar
                ref={searchInput}
                value={query}
                onChange={changeQuery}
                onMove={moveCursor}
                onSubmit={() => openDetail(cursor)}
              />
              <RegionBar region={items[cursor] ? REGIONS[regionIndexOf(items[cursor].id)] ?? null : null} onStep={jumpRegion} />
            </>
          }
        />
        {items[cursor] ? <PreviewPanel pokemon={items[cursor]} /> : <div className={styles.panel} />}
      </div>
    );
  }

  return (
    <div
      ref={root}
      tabIndex={-1}
      role="application"
      aria-label="Pokédex screen"
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
