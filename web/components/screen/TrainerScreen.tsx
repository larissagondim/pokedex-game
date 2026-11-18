"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_SLOTS } from "@/lib/tamagotchi";
import { CODE_LENGTH, formatSyncDraft, type HistoryEntry, normalizeSyncCode } from "@/lib/tamaSync";
import {
  type Appearance,
  APPEARANCE_FIELDS,
  appearanceValue,
  BADGES,
  type BattleLogEntry,
  battleTotals,
  cleanName,
  NAME_MAX,
  ACCESSORY_PRICES,
  isAccessory,
  lockedAccessories,
  randomAppearance,
  rankOf,
  stepAppearance,
  winStreak,
} from "@/lib/trainer";
import { badgeNotice, checkBadges } from "@/stores/badges";
import { useBattleLog } from "@/stores/battleLog";
import { useBattleRecord } from "@/stores/battleRecord";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { LEAGUE } from "@/lib/league";
import { useDexProgress } from "@/stores/dexProgress";
import { useLeague } from "@/stores/league";
import { useWardrobe } from "@/stores/wardrobe";
import { useFavorites } from "@/stores/favorites";
import { usePokedex } from "@/stores/pokedex";
import { useTamagotchi } from "@/stores/tamagotchi";
import { type LinkResult, type SyncStatus, useTamaSync } from "@/stores/tamaSync";
import { useTrainer } from "@/stores/trainer";
import { type KeyDef, type KeyPos, keyFor, moveKey, OnScreenKeyboard } from "./OnScreenKeyboard";
import { PetSprite } from "./PetSprite";
import styles from "./trainer.module.css";
import { TrainerSprite } from "./TrainerSprite";

/** Above the main screen handler (10): this tab gets first say while active. */
const INPUT_PRIORITY = 11;

export const TRAINER_HINTS = {
  card: "▲▼ stats / badges / history / diary   A: edit your profile   ◀▶ tabs   B: back to the list",
  new: "A: create your trainer profile",
  edit: "▲▼ choose   ◀▶ change   A: select   MENU: save   B: cancel",
  keyboard: "◀▲▼▶ move   A: type   B: delete   MENU: done",
} as const;
export type TrainerHint = keyof typeof TRAINER_HINTS;

/** Editor rows: the name, each appearance field, the sync code, then two actions. */
const ROWS = ["name", ...APPEARANCE_FIELDS.map((f) => f.key), "sync", "random", "save"] as const;
type Row = (typeof ROWS)[number];

const KEY_STEPS: Partial<Record<DeviceButton, [number, number]>> = {
  UP: [0, -1],
  DOWN: [0, 1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
};

const wrap = (i: number, n: number) => (i + n) % n;

/** Pages of the card's right panel (▲▼). */
const PAGES = ["STATS", "BADGES", "HISTORY", "DIARY"] as const;
const BADGES_PAGE = PAGES.indexOf("BADGES");
/** Badges per page of the BADGES card page; ▲▼ go through these pages too. */
const BADGES_PER_PAGE = 6;
const BADGE_PAGES = Math.ceil(BADGES.length / BADGES_PER_PAGE);

/** What the dialog box says after trying to link to another device's code. */
const LINK_NOTICE: Record<LinkResult, string> = {
  linked: "Linked! This device now shares that party.",
  same: "That's this device's own code.",
  "bad-code": `A sync code has ${CODE_LENGTH} letters and digits.`,
  "not-found": "No party uses that code. Check it on the other device.",
  unavailable: "Couldn't reach the server. Try again later.",
};

/** Screen pixels per sprite pixel on the card. */
const SPRITE_SCALE = 3.4;

interface Props {
  /** The tab is visible and the screen accepts input. */
  active: boolean;
  onNotice: (text: string) => void;
  /** Which help line the dialog box should show. */
  onHint: (hint: TrainerHint) => void;
}

interface Draft {
  name: string;
  appearance: Appearance;
}

/** The TRAINER tab: the trainer card (look, rank, stats) and its editor. */
export function TrainerScreen({ active, onNotice, onHint }: Props) {
  const name = useTrainer((s) => s.name);
  const appearance = useTrainer((s) => s.appearance);
  const created = useTrainer((s) => s.since !== null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [row, setRow] = useState(0);
  const [keyPos, setKeyPos] = useState<KeyPos | null>(null);
  /** Another device's sync code being typed (the SYNC CODE row). */
  const [syncDraft, setSyncDraft] = useState("");
  /** A typed code waiting for "A: yes" (linking replaces this device's party). */
  const [linkConfirm, setLinkConfirm] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [badgePage, setBadgePage] = useState(0);
  /** ▲▼ on the card: through the pages, and through the badge pages on BADGES. */
  const turnPage = (delta: number) => {
    if (page === BADGES_PAGE && badgePage + delta >= 0 && badgePage + delta < BADGE_PAGES) return setBadgePage(badgePage + delta);
    const next = wrap(page + delta, PAGES.length);
    setPage(next);
    if (next === BADGES_PAGE) setBadgePage(delta > 0 ? 0 : BADGE_PAGES - 1);
  };
  const editor = useRef<HTMLUListElement>(null);

  // Keep the focused editor row in view (the list scrolls).
  const showingRows = draft !== null && keyPos === null;
  useEffect(() => {
    const list = editor.current;
    const item = list?.children[row] as HTMLElement | undefined;
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop - 5;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight + 5;
  }, [row, showingRows]);

  const records = useBattleRecord((s) => s.records);
  const totals = useMemo(() => battleTotals(records), [records]);

  // The secondary screen (and the music) follow your best battle partner.
  useEffect(() => {
    if (active) usePokedex.getState().focus(totals.bestId);
  }, [active, totals.bestId]);

  // Badges earned since the last check (e.g. from older battles) get announced here.
  const notice = useRef(onNotice);
  useEffect(() => {
    notice.current = onNotice;
  });
  useEffect(() => {
    if (!active) return;
    const fresh = checkBadges();
    if (fresh.length > 0 && useTrainer.getState().since !== null) notice.current(badgeNotice(fresh));
  }, [active]);

  const hint: TrainerHint = keyPos ? "keyboard" : draft ? "edit" : created ? "card" : "new";
  useEffect(() => onHint(hint), [hint, onHint]);

  const owned = useWardrobe((s) => s.owned);

  const startEditing = () => {
    setDraft({ name, appearance });
    setRow(created ? 1 : 0);
    if (!created) setKeyPos({ row: 0, col: 0 });
  };
  const cancel = () => {
    setDraft(null);
    setKeyPos(null);
    setSyncDraft("");
  };
  const save = () => {
    if (!draft) return;
    const clean = cleanName(draft.name).trim();
    if (!clean) {
      // A trainer needs a name: go type one.
      setRow(0);
      setKeyPos({ row: 0, col: 0 });
      return;
    }
    const locked = lockedAccessories(draft.appearance, owned);
    if (locked.length > 0) {
      // Accessories can be tried on, but only bought ones are kept.
      const [id] = locked;
      return onNotice(`Buy the ${id.toUpperCase()} first (A on its row, ${ACCESSORY_PRICES[id]}₽), or pick something else.`);
    }
    const first = !created;
    useTrainer.getState().save(clean, draft.appearance);
    setDraft(null);
    setKeyPos(null);
    onNotice(first ? `Welcome, ${clean}! Your trainer card is ready.` : "Profile saved!");
  };
  const setName = (value: string) => setDraft((d) => d && { ...d, name: cleanName(value) });
  const typingSync = ROWS[row] === "sync";
  const link = async (code: string) => {
    setSyncDraft("");
    onNotice(LINK_NOTICE[await useTamaSync.getState().link(code)]);
  };
  /** Done typing a code: link right away, or ask first if a party would be lost. */
  const submitSync = () => {
    const code = normalizeSyncCode(syncDraft);
    if (!code) return onNotice(LINK_NOTICE["bad-code"]);
    setKeyPos(null);
    if (useTamagotchi.getState().pets.length === 0) return void link(code);
    setLinkConfirm(code);
    onNotice(`Link to ${code}? This device's party will be replaced. A: yes   B: no`);
  };
  const openSync = () => {
    if (useTamaSync.getState().status === "off") return onNotice("Sync needs the server's database. Your party stays on this device.");
    setKeyPos({ row: 0, col: 0 });
  };
  const step = (r: Row, delta: number) => {
    if (r === "name" || r === "sync" || r === "save") return;
    if (r === "random") return setDraft((d) => d && { ...d, appearance: randomAppearance(Math.random, owned) });
    if (!draft) return;
    const appearance = stepAppearance(draft.appearance, r, delta);
    setDraft({ ...draft, appearance });
    const style = appearance[r];
    if (isAccessory(style) && !owned.has(style)) onNotice(`${style.toUpperCase()}: ${ACCESSORY_PRICES[style]}₽ in the shop. A: buy   ◀▶: keep looking`);
  };
  /** A on a row showing an accessory not bought yet: buys it. */
  const buyAccessory = (r: Row): boolean => {
    const style = draft && r in draft.appearance ? draft.appearance[r as keyof typeof draft.appearance] : null;
    if (!isAccessory(style) || owned.has(style)) return false;
    if (useWardrobe.getState().buy(style)) onNotice(`You bought the ${style.toUpperCase()}! MENU saves your new look.`);
    return true;
  };
  const choose = (r: Row) => {
    if (r === "name") setKeyPos({ row: 0, col: 0 });
    else if (r === "sync") openSync();
    else if (r === "save") save();
    else if (!buyAccessory(r)) step(r, 1);
  };
  const pressKey = (key: KeyDef, pos: KeyPos) => {
    if (!draft) return;
    setKeyPos(pos);
    if (typingSync) {
      if (key.value === "BACKSPACE") setSyncDraft(formatSyncDraft(syncDraft.slice(0, -1)));
      else if (key.value === "CLEAR") setSyncDraft("");
      else if (key.value === "OK") submitSync();
      else setSyncDraft(formatSyncDraft(syncDraft + key.value));
      return;
    }
    if (key.value === "BACKSPACE") setName(draft.name.slice(0, -1));
    else if (key.value === "CLEAR") setName("");
    else if (key.value === "OK") setKeyPos(null);
    else setName(draft.name + key.value);
  };

  /** Returns true when consumed. */
  const handle = (button: DeviceButton): boolean => {
    if (button === "ZOOM") return false;
    if (linkConfirm) {
      setLinkConfirm(null);
      if (button === "A") void link(linkConfirm);
      else {
        setSyncDraft("");
        onNotice("OK! This device keeps its party.");
      }
      return true;
    }
    if (!draft) {
      if (button === "A") {
        startEditing();
        return true;
      }
      if (created && (button === "UP" || button === "DOWN")) {
        turnPage(button === "UP" ? -1 : 1);
        return true;
      }
      return false; // tabs, back to the list
    }
    if (keyPos) {
      const dir = KEY_STEPS[button];
      if (dir) setKeyPos(moveKey(keyPos, ...dir));
      else if (button === "A") pressKey(keyFor(keyPos), keyPos);
      else if (button === "B") {
        const typed = typingSync ? syncDraft : draft.name;
        if (!typed) setKeyPos(null);
        else if (typingSync) setSyncDraft(formatSyncDraft(syncDraft.slice(0, -1)));
        else setName(draft.name.slice(0, -1));
      } else if (button === "MENU") {
        if (typingSync && syncDraft) submitSync();
        else setKeyPos(null);
      }
      return true;
    }
    switch (button) {
      case "UP":
      case "DOWN":
        setRow((r) => wrap(r + (button === "UP" ? -1 : 1), ROWS.length));
        break;
      case "LEFT":
      case "RIGHT":
        step(ROWS[row], button === "LEFT" ? -1 : 1);
        break;
      case "A":
        choose(ROWS[row]);
        break;
      case "B":
        cancel();
        break;
      case "MENU":
        save();
        break;
    }
    return true;
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

  if (draft) {
    return (
      <div className={styles.trainer}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>{created ? "EDIT PROFILE" : "NEW TRAINER"}</div>
          <div className={styles.portrait}>
            <TrainerSprite appearance={draft.appearance} scale={SPRITE_SCALE} />
          </div>
          <p className={styles.name}>{draft.name || "???"}</p>
        </div>
        {keyPos ? (
          <OnScreenKeyboard
            pos={keyPos}
            status={
              typingSync
                ? `CODE: ${syncDraft}_ (${syncDraft.replaceAll("-", "").length}/${CODE_LENGTH}) · MENU: link`
                : `NAME: ${draft.name}_ (${draft.name.length}/${NAME_MAX}) · MENU: done`
            }
            onKey={pressKey}
          />
        ) : (
          <ul ref={editor} className={styles.editor} role="listbox" aria-label="Edit profile">
            {ROWS.map((r, i) => (
              <li
                key={r}
                role="option"
                aria-selected={i === row}
                data-focused={i === row}
                data-action={r === "random" || r === "save"}
                onClick={() => (i === row ? choose(r) : setRow(i))}
              >
                <span className={styles.cursor}>{i === row ? "▶" : ""}</span>
                <EditorRow
                  row={r}
                  draft={draft}
                  syncDraft={syncDraft}
                  onName={setName}
                  onSync={(value) => setSyncDraft(formatSyncDraft(value))}
                  onSubmit={r === "sync" ? submitSync : save}
                  onStep={(d) => step(r, d)}
                  owned={owned}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!created) {
    return (
      <div className={styles.trainer}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>TRAINER CARD</div>
          <div className={styles.portrait} data-empty>
            <TrainerSprite appearance={appearance} scale={SPRITE_SCALE} className={styles.silhouette} />
          </div>
          <p className={styles.name}>???</p>
        </div>
        <div className={styles.welcome}>
          <p>No trainer yet!</p>
          <p>Pick a name and design your look. Your card keeps your battles, your party and your favorites together.</p>
          <button type="button" className={styles.bigButton} onClick={startEditing}>
            A: CREATE PROFILE
          </button>
        </div>
      </div>
    );
  }

  return (
    <TrainerCard
      bestId={totals.bestId}
      wins={totals.wins}
      losses={totals.losses}
      page={page}
      badgePage={badgePage}
      onPage={(p) => {
        setPage(p);
        if (p === BADGES_PAGE) setBadgePage(page === BADGES_PAGE ? (badgePage + 1) % BADGE_PAGES : 0);
      }}
      onEdit={startEditing}
    />
  );
}

interface EditorRowProps {
  row: Row;
  draft: Draft;
  /** Another device's sync code, as typed so far. */
  syncDraft: string;
  onName: (value: string) => void;
  onSync: (value: string) => void;
  /** Enter in the row's text field. */
  onSubmit: () => void;
  onStep: (delta: number) => void;
  /** Accessories bought (the others show their price). */
  owned: ReadonlySet<string>;
}

function EditorRow({ row, draft, syncDraft, onName, onSync, onSubmit, onStep, owned }: EditorRowProps) {
  if (row === "random") return <span className={styles.action}>🎲 RANDOM LOOK</span>;
  if (row === "save") return <span className={styles.action}>✔ SAVE</span>;
  if (row === "name" || row === "sync") {
    const sync = row === "sync";
    return (
      <>
        <span className={styles.label}>{sync ? "SYNC CODE" : "NAME"}</span>
        <input
          className={styles.nameInput}
          value={sync ? syncDraft : draft.name}
          maxLength={sync ? CODE_LENGTH + 2 : NAME_MAX}
          placeholder={sync ? "other device's code" : "type a name"}
          aria-label={sync ? "Sync code of another device" : "Trainer name"}
          autoComplete="off"
          spellCheck={false}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => (sync ? onSync : onName)(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
              onSubmit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation(); // don't also leave zoom
              e.currentTarget.blur();
            }
          }}
        />
      </>
    );
  }
  const field = APPEARANCE_FIELDS.find((f) => f.key === row)!;
  const value = appearanceValue(draft.appearance, row);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      <span className={styles.label}>{field.label}</span>
      <span className={styles.value}>
        <button type="button" className={styles.arrow} onClick={(e) => (stop(e), onStep(-1))} aria-label={`Previous ${field.label}`}>
          ◀
        </button>
        {"text" in value ? (
          <span data-locked={isAccessory(draft.appearance[row]) && !owned.has(draft.appearance[row] as string)}>
            {value.text}
            {isAccessory(draft.appearance[row]) && !owned.has(draft.appearance[row] as string) && <small> {ACCESSORY_PRICES[draft.appearance[row] as keyof typeof ACCESSORY_PRICES]}₽</small>}
          </span>
        ) : (
          <span className={styles.swatch} style={{ background: value.color }} />
        )}
        <button type="button" className={styles.arrow} onClick={(e) => (stop(e), onStep(1))} aria-label={`Next ${field.label}`}>
          ▶
        </button>
      </span>
    </>
  );
}

interface CardProps {
  bestId: number | null;
  wins: number;
  losses: number;
  page: number;
  /** Which page of badges the BADGES page shows. */
  badgePage: number;
  onPage: (page: number) => void;
  onEdit: () => void;
}

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** The trainer card: portrait on the left; stats, badges or history on the right. */
function TrainerCard({ bestId, wins, losses, page, badgePage, onPage, onEdit }: CardProps) {
  const name = useTrainer((s) => s.name);
  const appearance = useTrainer((s) => s.appearance);
  const id = useTrainer((s) => s.id);
  const badges = useTrainer((s) => s.badges);
  const earned = BADGES.filter((b) => badges[b.id] !== undefined).length;

  return (
    <div className={styles.trainer}>
      <button type="button" className={styles.card} onClick={onEdit} aria-label="Edit profile">
        <div className={styles.cardHeader}>TRAINER CARD</div>
        <div className={styles.portrait}>
          <TrainerSprite appearance={appearance} scale={SPRITE_SCALE} />
        </div>
        <p className={styles.name}>{name}</p>
        <p className={styles.idNo}>ID No. {id}</p>
      </button>
      <div className={styles.stats}>
        <nav className={styles.pages} role="tablist" aria-label="Trainer card pages">
          {PAGES.map((label, i) => (
            <button key={label} type="button" role="tab" aria-selected={i === page} data-active={i === page} onClick={() => onPage(i)}>
              {label}
              {label === "BADGES" && <small> {earned}/{BADGES.length}</small>}
            </button>
          ))}
        </nav>
        {page === 0 && <StatsPage bestId={bestId} wins={wins} losses={losses} />}
        {page === BADGES_PAGE && <BadgesPage page={badgePage} />}
        {page === 2 && <HistoryPage />}
        {page === 3 && <DiaryPage />}
      </div>
    </div>
  );
}

function StatsPage({ bestId, wins, losses }: { bestId: number | null; wins: number; losses: number }) {
  const since = useTrainer((s) => s.since);
  const list = usePokedex((s) => s.list);
  const pets = useTamagotchi((s) => s.pets);
  const coins = useTamagotchi((s) => s.coins);
  const favorites = useFavorites((s) => s.ids.size);
  const seen = useDexProgress((s) => s.seen.size);
  const league = useLeague((s) => s.beaten);
  const caught = useDexProgress((s) => s.caught.size);
  const record = useBattleRecord((s) => (bestId !== null ? s.records[bestId] : undefined));
  const streak = useBattleLog((s) => winStreak(s.log));
  const rank = rankOf(wins);
  const battles = wins + losses;
  const nameOf = (dexId: number) => (list.find((p) => p.id === dexId)?.name ?? `#${dexId}`).toUpperCase();

  return (
    <div className={styles.page}>
      <div className={styles.rank}>
        <span>{rank.title}</span>
        <small>
          {rank.next !== null ? `${rank.next} win${rank.next === 1 ? "" : "s"} to ${rankOf(wins + rank.next).title}` : "Top rank!"} · LEAGUE {league}/{LEAGUE.length}
        </small>
      </div>
      <dl>
        <dt>BATTLES</dt>
        <dd>
          {wins}W {losses}L{battles > 0 && <small> ({Math.round((wins / battles) * 100)}%)</small>}
          {streak > 1 && <small className={styles.streak}> ♨ {streak} in a row</small>}
        </dd>
        <dt>BEST PARTNER</dt>
        <dd>
          {bestId !== null ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.mini} src={`/sprites/${bestId}.png`} alt="" draggable={false} />
              {nameOf(bestId)} <small>{record?.wins}W</small>
            </>
          ) : (
            <small>— win a battle —</small>
          )}
        </dd>
        <dt>PARTY</dt>
        <dd className={styles.party}>
          {Array.from({ length: MAX_SLOTS }, (_, i) => {
            const pet = pets[i];
            if (!pet) return <span key={`empty-${i}`} className={styles.mini} data-empty />;
            if (pet.dexId === null) return <span key={pet.uid} className={styles.mini} data-egg title="Egg" />;
            const label = `${pet.shiny ? "SHINY " : ""}${nameOf(pet.dexId)}`;
            return <PetSprite key={pet.uid} className={styles.mini} dexId={pet.dexId} shiny={pet.shiny} alt={label} title={label} />;
          })}
        </dd>
        <dt>POKéDEX</dt>
        <dd>
          {caught} caught <small>· {seen} seen · ★ {favorites}</small>
        </dd>
        <dt>COINS</dt>
        <dd className={styles.coins}>{coins}₽</dd>
        <dt>STARTED</dt>
        <dd>{since ? new Date(since).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</dd>
      </dl>
    </div>
  );
}

/** Every badge: earned ones in color with the date, the rest grayed out with how to get them. */
function BadgesPage({ page }: { page: number }) {
  const badges = useTrainer((s) => s.badges);
  return (
    <>
      <ul className={styles.badges}>
        {BADGES.slice(page * BADGES_PER_PAGE, (page + 1) * BADGES_PER_PAGE).map((b) => {
          const at = badges[b.id];
          return (
            <li key={b.id} data-earned={at !== undefined} title={b.hint}>
              <span className={styles.badgeIcon} style={at !== undefined ? { background: b.color } : undefined} aria-hidden>
                {at !== undefined ? b.icon : "?"}
              </span>
              <span className={styles.badgeText}>
                <b>{b.name}</b>
                <small>{at !== undefined ? `Earned ${shortDate(at)}` : b.hint}</small>
              </span>
            </li>
          );
        })}
      </ul>
      {BADGE_PAGES > 1 && (
        <p className={styles.badgePager}>
          {page > 0 ? "▲ " : ""}
          {page + 1}/{BADGE_PAGES}
          {page < BADGE_PAGES - 1 ? " ▼" : ""}
        </p>
      )}
    </>
  );
}

/** The latest battles, newest first. */
function HistoryPage() {
  const log = useBattleLog((s) => s.log);
  if (log.length === 0) return <p className={styles.emptyPage}>No battles yet. Go to the BATTLE tab!</p>;
  return (
    <ul className={styles.history}>
      {log.map((e) => (
        <HistoryRow key={e.at} entry={e} />
      ))}
    </ul>
  );
}

function HistoryRow({ entry }: { entry: BattleLogEntry }) {
  const list = usePokedex((s) => s.list);
  const nameOf = (dexId: number) => (list.find((p) => p.id === dexId)?.name ?? `#${dexId}`).toUpperCase();
  const size = entry.player.length;
  const team = (ids: number[]) => (
    <span className={styles.team}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.mini} src={`/sprites/${ids[0]}.png`} alt="" draggable={false} />
      <span>{nameOf(ids[0])}</span>
      {ids.length > 1 && <small>+{ids.length - 1}</small>}
    </span>
  );
  return (
    <li title={`${entry.player.map(nameOf).join(", ")} vs ${entry.foe.map(nameOf).join(", ")}`}>
      <span className={styles.result} data-won={entry.won}>
        {entry.won ? "WIN" : "LOSS"}
      </span>
      <span className={styles.mode}>
        {size}v{entry.foe.length}
      </span>
      {team(entry.player)}
      <small className={styles.vs}>vs</small>
      {team(entry.foe)}
      <small className={styles.odds}>{entry.odds !== null ? `${Math.round(entry.odds * 100)}%` : ""}</small>
      <small className={styles.when}>{shortDate(entry.at)}</small>
    </li>
  );
}

const SYNC_LABEL: Record<SyncStatus, string> = {
  starting: "connecting...",
  syncing: "saving...",
  synced: "synced",
  offline: "offline, will retry",
  off: "this device only",
};

const DIARY_TAG: Record<HistoryEntry["kind"], string> = {
  adopted: "NEW",
  egg: "EGG",
  hatched: "HATCH",
  evolved: "EVO",
  level: "LV UP",
  released: "BYE",
};

/** The Tamagotchi party's milestones, newest first, under this device's sync code. */
function DiaryPage() {
  const code = useTamaSync((s) => s.code);
  const status = useTamaSync((s) => s.status);
  const history = useTamaSync((s) => s.history);
  const list = usePokedex((s) => s.list);
  const nameOf = (dexId: number | null) => (dexId === null ? "AN EGG" : (list.find((p) => p.id === dexId)?.name ?? `#${dexId}`).toUpperCase());
  const describe = (e: HistoryEntry) => {
    switch (e.kind) {
      case "adopted":
        return `${nameOf(e.dexId)} joined the party`;
      case "egg":
        return "Bought an egg";
      case "hatched":
        return e.detail ? `A shiny ${nameOf(e.dexId)} hatched ✦` : `${nameOf(e.dexId)} hatched`;
      case "evolved":
        return `${nameOf(e.detail)} evolved into ${nameOf(e.dexId)}`;
      case "level":
        return `${nameOf(e.dexId)} reached Lv${e.detail}`;
      case "released":
        return `Said goodbye to ${nameOf(e.dexId)}`;
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.rank} title="Type this code on another device (edit profile, SYNC CODE) to share your party">
        <span>SYNC {code}</span>
        <small>{SYNC_LABEL[status]}</small>
      </div>
      {history.length === 0 ? (
        <p className={styles.emptyPage}>Nothing yet. Adopt a Pokémon or buy an egg!</p>
      ) : (
        <ul className={`${styles.history} ${styles.diary}`}>
          {history.map((e, i) => (
            <li key={`${e.at}-${e.kind}-${e.dexId}-${i}`} title={describe(e)}>
              <span className={styles.result} data-won={e.kind !== "released"}>
                {DIARY_TAG[e.kind]}
              </span>
              {e.dexId !== null ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.mini} src={`/sprites/${e.dexId}.png`} alt="" draggable={false} />
              ) : (
                <span className={styles.mini} data-egg />
              )}
              <span className={styles.diaryText}>{describe(e)}</span>
              <small className={styles.when}>{shortDate(e.at)}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
