"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useScreenPower } from "@/hooks/useScreenPower";
import { useTypewriter } from "@/hooks/useTypewriter";
import { applyListing, FILTERS, SORTS, type Sort } from "@/lib/listing";
import { REGIONS, regionIndexOf } from "@/lib/regions";
import { normalize, searchPokemon } from "@/lib/search";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { acceptsInput, useDeviceState } from "@/stores/deviceState";
import { useFavorites } from "@/stores/favorites";
import { useTamagotchi } from "@/stores/tamagotchi";
import { usePokedex } from "@/stores/pokedex";
import type { Pokemon } from "@/data/pokedex";
import { DialogBox } from "./DialogBox";
import { ListOptions } from "./ListOptions";
import { PokemonDetail } from "./PokemonDetail";
import { type KeyDef, type KeyPos, keyFor, moveKey, OnScreenKeyboard } from "./OnScreenKeyboard";
import { PokemonList } from "./PokemonList";
import { PreviewPanel } from "./PreviewPanel";
import { RegionBar } from "./RegionBar";
import { SearchBar } from "./SearchBar";
import styles from "./screen.module.css";
import { TabBar } from "./TabBar";
import { TamagotchiScreen } from "./TamagotchiScreen";
import { describeEvent } from "./tamaMessages";

const TABS = ["LIST", "BATTLE", "TAMAGOTCHI"] as const;
const TAMAGOTCHI_TAB = 2;
const TAMA_HINT = "▲▼ party   ◀▶ action   A: do it   Click your Pokémon to hear it!";
const LIST_HINT = "▲▼ Pokémon   ◀▶ region   A: open   MENU: tab   ▲ on the first row: filters, then search (A = keyboard)";

/** Runs before the device controller, so the UI gets first say on each button. */
const SCREEN_INPUT_PRIORITY = 10;

const wrap = (i: number, n: number) => (i + n) % n;

const MAX_QUERY = 16;

/** D-pad direction → (dx, dy) on the on-screen keyboard. */
const KEY_STEPS: Partial<Record<DeviceButton, [number, number]>> = {
  UP: [0, -1],
  DOWN: [0, 1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
};

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
  /** The D-pad is on the search field (above the first row). */
  const [searchSelected, setSearchSelected] = useState(false);
  /** On-screen keyboard cursor, or null when it's closed. */
  const [keyPos, setKeyPos] = useState<KeyPos | null>(null);
  /** The D-pad is on the filter/sort row (between the search field and the rows). */
  const [optionsSelected, setOptionsSelected] = useState(false);
  const [filterIndex, setFilterIndex] = useState(0);
  const filter = FILTERS[filterIndex];
  const [sort, setSort] = useState<Sort>("auto");
  /** Showing the "coming soon" region after Paldea. */
  const [teaser, setTeaser] = useState(false);
  const favorites = useFavorites((s) => s.ids);
  const searchInput = useRef<HTMLInputElement>(null);

  /** What the list shows: search results (or everything), filtered and sorted. */
  const items = useMemo(() => {
    const base = query.trim() && searchIndex ? searchPokemon(searchIndex, query) : list;
    return applyListing(base, { filter, sort, favorites });
  }, [query, searchIndex, list, filter, sort, favorites]);

  // Highlight the typed prefix in names (not for number searches).
  const normalizedQuery = normalize(query);
  const highlight = normalizedQuery && !/^#?\d+$/.test(normalizedQuery) ? normalizedQuery.length : 0;
  // Keep the cursor on the list when it shrinks (e.g. unfavoriting with ★ on).
  if (cursor >= items.length && items.length > 0) setCursor(items.length - 1);

  /** The list cursor is hidden while the D-pad is on the header rows. */
  const onHeader = searchSelected || optionsSelected || keyPos !== null;
  const status = usePokedex((s) => s.status);
  const power = useScreenPower();
  const zoomed = useDeviceState((s) => s.phase === "ZOOMED");
  const phaseAcceptsInput = useDeviceState((s) => acceptsInput(s.phase));
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
  // (On the Tamagotchi tab, the selected party member drives them instead.)
  useEffect(() => {
    if (tab === TAMAGOTCHI_TAB) return;
    usePokedex.getState().focus(detailPokemon?.id ?? items[cursor]?.id ?? null);
  }, [tab, detailPokemon, items, cursor]);




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
  /** One-off message in the dialog box (adoption, Tamagotchi events...). */
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const noticeCount = useRef(0);
  /** Shows a message; the same text twice still replays. */
  const say = (text: string) => setNotice({ text, id: ++noticeCount.current });
  /** On a Pokémon page, "Adopt X?" is waiting for A (yes) or B (no). */
  const [adoptPrompt, setAdoptPrompt] = useState(false);
  const typing = useTypewriter(power === "on" ? (notice?.text ?? pages[page] ?? null) : null, notice?.id ?? page);
  const hasNextPage = page < pages.length - 1;

  const showPokemon = (p: Pokemon) => {
    dismissKeyboard();
    setNotice(null);
    setAdoptPrompt(false);
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
  /**
   * Moves the cursor to the first item of the previous/next region present in
   * the list (wraps). On the plain dex-ordered list, a "coming soon" slot for
   * the next generation sits between Paldea and Kanto.
   */
  const jumpRegion = (delta: number) => {
    if (items.length === 0) return;
    const canTease = !query.trim() && filter === "all" && (sort === "auto" || sort === "number");
    const teaserSlot = REGIONS.length;
    const slots = canTease ? REGIONS.length + 1 : REGIONS.length;
    const current = teaser ? teaserSlot : regionIndexOf(items[cursor]?.id ?? 0);
    for (let step = 1; step <= slots; step++) {
      const target = wrap(current + delta * step, slots);
      if (target === teaserSlot) {
        setTeaser(true);
        return;
      }
      const index = items.findIndex((p) => regionIndexOf(p.id) === target);
      if (index >= 0) {
        setTeaser(false);
        setCursor(index);
        return;
      }
    }
  };
  const stepFilter = (delta: number) => {
    setFilterIndex((i) => wrap(i + delta, FILTERS.length));
    setCursor(0);
    setTeaser(false);
  };
  const stepSort = () => {
    setSort((s) => SORTS[wrap(SORTS.indexOf(s) + 1, SORTS.length)]);
    setCursor(0);
    setTeaser(false);
  };
  const changeQuery = (value: string) => {
    setQuery(value);
    setCursor(0);
    setTeaser(false);
  };
  const openKeyboard = () => {
    setSearchSelected(true);
    setKeyPos({ row: 0, col: 0 });
  };
  /** Leaves the keyboard and the search field. */
  function dismissKeyboard() {
    setKeyPos(null);
    setSearchSelected(false);
    setOptionsSelected(false);
  }
  /** Done typing: back on the list, at the first result. */
  const closeKeyboard = () => {
    dismissKeyboard();
    setCursor(0);
  };
  const pressKey = (key: KeyDef, pos: KeyPos) => {
    setKeyPos(pos);
    if (key.value === "BACKSPACE") changeQuery(query.slice(0, -1));
    else if (key.value === "CLEAR") changeQuery("");
    else if (key.value === "OK") closeKeyboard();
    else if (query.length < MAX_QUERY) changeQuery(query + key.value);
  };
  const switchTab = (next: number) => {
    dismissKeyboard();
    setNotice(null);
    setAdoptPrompt(false);
    setTab(next);
    setDetailId(null);
  };

  const askToAdopt = () => {
    if (!detailPokemon) return;
    setAdoptPrompt(true);
    say(`Adopt ${detailPokemon.name.toUpperCase()}? A: yes   B: no`);
  };

  // Tamagotchi events (adoption, actions, evolution...) speak through the dialog box.
  useEffect(
    () =>
      useTamagotchi.subscribe(({ event }, prev) => {
        if (!event || event === prev.event) return;
        const { list: dexList } = usePokedex.getState();
        say(describeEvent(event, (id) => (dexList.find((p) => p.id === id)?.name ?? "the egg").toUpperCase()));
      }),
    [],
  );

  /** Returns true when the screen consumed the button. */
  const handle = (button: DeviceButton): boolean => {
    if (button === "ZOOM") return false;

    if (keyPos) {
      const step = KEY_STEPS[button];
      if (step) setKeyPos(moveKey(keyPos, ...step));
      else if (button === "A") pressKey(keyFor(keyPos), keyPos);
      else if (button === "B") {
        if (query) changeQuery(query.slice(0, -1));
        else closeKeyboard();
      } else if (button === "MENU") closeKeyboard();
      return true;
    }

    if (searchSelected) {
      if (button === "A") openKeyboard();
      else if (button === "DOWN") {
        setSearchSelected(false);
        setOptionsSelected(true);
      } else if (button === "B") setSearchSelected(false);
      else if (button === "MENU") switchTab(wrap(tab + 1, TABS.length));
      return true;
    }

    if (optionsSelected) {
      if (button === "LEFT" || button === "RIGHT") stepFilter(button === "LEFT" ? -1 : 1);
      else if (button === "A") stepSort();
      else if (button === "UP") {
        setOptionsSelected(false);
        setSearchSelected(true);
      } else if (button === "DOWN" || button === "B") setOptionsSelected(false);
      else if (button === "MENU") switchTab(wrap(tab + 1, TABS.length));
      return true;
    }

    if (detailId !== null && adoptPrompt) {
      setAdoptPrompt(false);
      if (button === "A") useTamagotchi.getState().adopt(detailId);
      else setNotice(null);
      return true;
    }

    if (detailId !== null) {
      if (button === "LEFT" || button === "UP") stepDetail(-1);
      else if (button === "RIGHT" || button === "DOWN") stepDetail(1);
      else if (button === "A") {
        if (!typing.done) typing.finish();
        else if (notice) setNotice(null);
        else if (hasNextPage) setPage((p) => p + 1);
        else askToAdopt();
      } else if (button === "B") {
        if (notice) setNotice(null);
        else setDetailId(null);
      }
      else if (button === "MENU") useFavorites.getState().toggle(detailId);
      return true;
    }

    if (button === "MENU") {
      switchTab(wrap(tab + 1, TABS.length));
      return true;
    }

    if (teaser && tab === 0) {
      if (button === "LEFT" || button === "RIGHT") jumpRegion(button === "LEFT" ? -1 : 1);
      else if (button === "UP" || button === "DOWN" || button === "B") setTeaser(false);
      return true;
    }

    switch (button) {
      case "UP":
      case "DOWN":
        if (tab !== 0) return true;
        // Above the first row: the filter/sort row, then the search field.
        if (button === "UP" && cursor === 0) setOptionsSelected(true);
        else moveCursor(button === "UP" ? -1 : 1);
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
        setNotice(null);
        setAdoptPrompt(false);
        requestAnimationFrame(focusInput);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const tamaActive = tab === TAMAGOTCHI_TAB && power === "on" && phaseAcceptsInput;

  const dialogText = notice || detailPokemon
    ? typing.visible
    : tab === TAMAGOTCHI_TAB
      ? TAMA_HINT
      : tab !== 0
      ? "Coming soon!"
      : keyPos
        ? "◀▲▼▶ move   A: type   B: delete   MENU: done"
        : searchSelected
          ? "A: open the keyboard   ▼: filters"
          : optionsSelected
            ? "◀▶ type filter (★ = favorites)   A: sort order   ▲ search   ▼ list"
            : teaser
              ? "A new region is coming. ◀▶ other regions"
              : LIST_HINT;

  let body;
  if (tab === TAMAGOTCHI_TAB) {
    body = <TamagotchiScreen active={tamaActive} onNotice={say} />;
  } else if (tab !== 0) {
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
        favorite={favorites.has(detailPokemon.id)}
        onToggleFavorite={() => useFavorites.getState().toggle(detailPokemon.id)}
        onAdopt={() => useTamagotchi.getState().adopt(detailPokemon.id)}
      />
    );
  } else {
    body = (
      <div className={styles.body}>
        <PokemonList
          items={items}
          cursor={onHeader ? -1 : cursor}
          favorites={favorites}
          highlight={highlight}
          placeholder={
            teaser ? (
              <div className={styles.teaser}>
                <h3>GEN X</h3>
                <p>??? REGION</p>
                <p>COMING SOON</p>
              </div>
            ) : undefined
          }
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
                selected={searchSelected && !keyPos}
                onOpenKeyboard={openKeyboard}
              />
              <ListOptions filter={filter} sort={sort} selected={optionsSelected} onFilterStep={stepFilter} onSortStep={stepSort} />
              <RegionBar
                region={!onHeader && !teaser && items[cursor] ? (REGIONS[regionIndexOf(items[cursor].id)] ?? null) : null}
                teaser={teaser}
                onStep={jumpRegion}
              />
            </>
          }
        />
        {keyPos ? (
          <OnScreenKeyboard pos={keyPos} resultCount={query.trim() ? items.length : 0} onKey={pressKey} />
        ) : items[cursor] && !teaser ? (
          <PreviewPanel pokemon={items[cursor]} />
        ) : (
          <div className={styles.panel} />
        )}
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
      <DialogBox text={dialogText} waiting={typing.done && hasNextPage && !notice} />

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
