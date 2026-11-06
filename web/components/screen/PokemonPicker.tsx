"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Pokemon } from "@/data/pokedex";
import { normalize, searchPokemon } from "@/lib/search";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { usePokedex } from "@/stores/pokedex";
import battle from "./battle.module.css";
import { type KeyDef, type KeyPos, keyFor, moveKey, OnScreenKeyboard, resultStatus } from "./OnScreenKeyboard";
import { PokemonList } from "./PokemonList";
import { PreviewPanel } from "./PreviewPanel";
import styles from "./screen.module.css";
import { SearchBar } from "./SearchBar";

/** Above the main screen handler (10), like the other tabs. */
const INPUT_PRIORITY = 11;
const MAX_QUERY = 16;
/** ◀ ▶ jump this many rows. */
const PAGE = 10;

const KEY_STEPS: Partial<Record<DeviceButton, [number, number]>> = {
  UP: [0, -1],
  DOWN: [0, 1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
};

const wrap = (i: number, n: number) => (n ? (i + n) % n : 0);

interface Props {
  title: string;
  /** Receives the D-pad (only one picker or scene is active at a time). */
  active: boolean;
  favorites: ReadonlySet<number>;
  /** Listed right after the favorites (e.g. your Tamagotchi party). */
  pinned?: readonly number[];
  onPick: (pokemon: Pokemon) => void;
  /** B on the list; return false to let the screen handle it. */
  onBack: () => boolean;
}

/**
 * Pick a Pokémon: favorites first, then `pinned`, then the rest by number.
 * Search by name or number like the LIST tab (▲ on the first row, then A for
 * the on-screen keyboard; or "/" on a real keyboard).
 */
export function PokemonPicker({ title, active, favorites, pinned = [], onPick, onBack }: Props) {
  const list = usePokedex((s) => s.list);
  const searchIndex = usePokedex((s) => s.searchIndex);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [searchSelected, setSearchSelected] = useState(false);
  const [keyPos, setKeyPos] = useState<KeyPos | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const base = query.trim() && searchIndex ? searchPokemon(searchIndex, query) : list;
    const pinnedSet = new Set(pinned);
    const rank = (p: Pokemon) => (favorites.has(p.id) ? 0 : pinnedSet.has(p.id) ? 1 : 2);
    // Stable sort keeps search order (A→Z) or dex order within each group.
    return [...base].sort((a, b) => rank(a) - rank(b));
  }, [query, searchIndex, list, favorites, pinned]);

  if (cursor >= items.length && items.length > 0) setCursor(items.length - 1);

  const normalized = normalize(query);
  const highlight = normalized && !/^#?\d+$/.test(normalized) ? normalized.length : 0;
  const onHeader = searchSelected || keyPos !== null;
  const focused = items[cursor];

  // The secondary screen follows the highlighted Pokémon.
  useEffect(() => {
    if (active && focused) usePokedex.getState().focus(focused.id);
  }, [active, focused]);

  const changeQuery = (value: string) => {
    setQuery(value);
    setCursor(0);
  };
  const closeKeyboard = () => {
    setKeyPos(null);
    setSearchSelected(false);
    setCursor(0);
  };
  const pressKey = (key: KeyDef, pos: KeyPos) => {
    setKeyPos(pos);
    if (key.value === "BACKSPACE") changeQuery(query.slice(0, -1));
    else if (key.value === "CLEAR") changeQuery("");
    else if (key.value === "OK") closeKeyboard();
    else if (query.length < MAX_QUERY) changeQuery(query + key.value);
  };
  const pick = (index: number) => {
    if (items[index]) onPick(items[index]);
  };

  const handle = (button: DeviceButton): boolean => {
    if (button === "ZOOM" || button === "MENU") {
      if (keyPos && button === "MENU") {
        closeKeyboard();
        return true;
      }
      return false;
    }
    if (keyPos) {
      const step = KEY_STEPS[button];
      if (step) setKeyPos(moveKey(keyPos, ...step));
      else if (button === "A") pressKey(keyFor(keyPos), keyPos);
      else if (button === "B") {
        if (query) changeQuery(query.slice(0, -1));
        else closeKeyboard();
      }
      return true;
    }
    if (searchSelected) {
      if (button === "A") setKeyPos({ row: 0, col: 0 });
      else if (button === "DOWN" || button === "B") setSearchSelected(false);
      return true;
    }
    switch (button) {
      case "UP":
        if (cursor === 0) setSearchSelected(true);
        else setCursor((c) => c - 1);
        return true;
      case "DOWN":
        setCursor((c) => wrap(c + 1, items.length));
        return true;
      case "LEFT":
      case "RIGHT":
        setCursor((c) => Math.max(0, Math.min(items.length - 1, c + (button === "LEFT" ? -PAGE : PAGE))));
        return true;
      case "A":
        pick(cursor);
        return true;
      case "B":
        if (query) {
          changeQuery("");
          return true;
        }
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

  // "/" focuses this picker's search field (the LIST tab ignores it while BATTLE is open).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || !activeRef.current || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      input.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={styles.body}>
      <PokemonList
        items={items}
        cursor={onHeader ? -1 : cursor}
        selectedId={null}
        favorites={favorites}
        highlight={highlight}
        onRowClick={(i) => (i === cursor ? pick(i) : setCursor(i))}
        emptyText="No Pokémon found."
        header={
          <>
            <div className={battle.pickerTitle}>{title}</div>
            <SearchBar
              ref={input}
              value={query}
              onChange={changeQuery}
              onMove={(d) => setCursor((c) => wrap(c + d, items.length))}
              onSubmit={() => pick(cursor)}
              selected={searchSelected && !keyPos}
              onOpenKeyboard={() => {
                setSearchSelected(true);
                setKeyPos({ row: 0, col: 0 });
              }}
            />
          </>
        }
      />
      {keyPos ? (
        <OnScreenKeyboard pos={keyPos} status={resultStatus(query.trim() ? items.length : 0)} onKey={pressKey} />
      ) : focused ? (
        <PreviewPanel pokemon={focused} />
      ) : (
        <div className={styles.panel} />
      )}
    </div>
  );
}
