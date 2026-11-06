"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_SLOTS } from "@/lib/tamagotchi";
import {
  type Appearance,
  APPEARANCE_FIELDS,
  appearanceValue,
  battleTotals,
  cleanName,
  NAME_MAX,
  randomAppearance,
  rankOf,
  stepAppearance,
} from "@/lib/trainer";
import { useBattleRecord } from "@/stores/battleRecord";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { useFavorites } from "@/stores/favorites";
import { usePokedex } from "@/stores/pokedex";
import { useTamagotchi } from "@/stores/tamagotchi";
import { useTrainer } from "@/stores/trainer";
import { type KeyDef, type KeyPos, keyFor, moveKey, OnScreenKeyboard } from "./OnScreenKeyboard";
import styles from "./trainer.module.css";
import { TrainerSprite } from "./TrainerSprite";

/** Above the main screen handler (10): this tab gets first say while active. */
const INPUT_PRIORITY = 11;

export const TRAINER_HINTS = {
  card: "A: edit your profile   ◀▶ tabs   B: back to the list",
  new: "A: create your trainer profile",
  edit: "▲▼ choose   ◀▶ change   A: select   MENU: save   B: cancel",
  keyboard: "◀▲▼▶ move   A: type   B: delete   MENU: done",
} as const;
export type TrainerHint = keyof typeof TRAINER_HINTS;

/** Editor rows: the name, each appearance field, then two actions. */
const ROWS = ["name", ...APPEARANCE_FIELDS.map((f) => f.key), "random", "save"] as const;
type Row = (typeof ROWS)[number];

const KEY_STEPS: Partial<Record<DeviceButton, [number, number]>> = {
  UP: [0, -1],
  DOWN: [0, 1],
  LEFT: [-1, 0],
  RIGHT: [1, 0],
};

const wrap = (i: number, n: number) => (i + n) % n;

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

  const hint: TrainerHint = keyPos ? "keyboard" : draft ? "edit" : created ? "card" : "new";
  useEffect(() => onHint(hint), [hint, onHint]);

  const startEditing = () => {
    setDraft({ name, appearance });
    setRow(created ? 1 : 0);
    if (!created) setKeyPos({ row: 0, col: 0 });
  };
  const cancel = () => {
    setDraft(null);
    setKeyPos(null);
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
    const first = !created;
    useTrainer.getState().save(clean, draft.appearance);
    setDraft(null);
    setKeyPos(null);
    onNotice(first ? `Welcome, ${clean}! Your trainer card is ready.` : "Profile saved!");
  };
  const setName = (value: string) => setDraft((d) => d && { ...d, name: cleanName(value) });
  const step = (r: Row, delta: number) => {
    if (r === "name" || r === "save") return;
    if (r === "random") return setDraft((d) => d && { ...d, appearance: randomAppearance() });
    setDraft((d) => d && { ...d, appearance: stepAppearance(d.appearance, r, delta) });
  };
  const choose = (r: Row) => {
    if (r === "name") setKeyPos({ row: 0, col: 0 });
    else if (r === "save") save();
    else step(r, 1);
  };
  const pressKey = (key: KeyDef, pos: KeyPos) => {
    if (!draft) return;
    setKeyPos(pos);
    if (key.value === "BACKSPACE") setName(draft.name.slice(0, -1));
    else if (key.value === "CLEAR") setName("");
    else if (key.value === "OK") setKeyPos(null);
    else setName(draft.name + key.value);
  };

  /** Returns true when consumed. */
  const handle = (button: DeviceButton): boolean => {
    if (button === "ZOOM") return false;
    if (!draft) {
      if (button === "A") {
        startEditing();
        return true;
      }
      return false; // tabs, back to the list
    }
    if (keyPos) {
      const dir = KEY_STEPS[button];
      if (dir) setKeyPos(moveKey(keyPos, ...dir));
      else if (button === "A") pressKey(keyFor(keyPos), keyPos);
      else if (button === "B") {
        if (draft.name) setName(draft.name.slice(0, -1));
        else setKeyPos(null);
      } else if (button === "MENU") setKeyPos(null);
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
          <OnScreenKeyboard pos={keyPos} status={`NAME: ${draft.name}_ (${draft.name.length}/${NAME_MAX}) · MENU: done`} onKey={pressKey} />
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
                <EditorRow row={r} draft={draft} onName={setName} onSubmit={save} onStep={(d) => step(r, d)} />
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

  return <TrainerCard bestId={totals.bestId} wins={totals.wins} losses={totals.losses} onEdit={startEditing} />;
}

interface EditorRowProps {
  row: Row;
  draft: Draft;
  onName: (value: string) => void;
  onSubmit: () => void;
  onStep: (delta: number) => void;
}

function EditorRow({ row, draft, onName, onSubmit, onStep }: EditorRowProps) {
  if (row === "random") return <span className={styles.action}>🎲 RANDOM LOOK</span>;
  if (row === "save") return <span className={styles.action}>✔ SAVE</span>;
  if (row === "name") {
    return (
      <>
        <span className={styles.label}>NAME</span>
        <input
          className={styles.nameInput}
          value={draft.name}
          maxLength={NAME_MAX}
          placeholder="type a name"
          aria-label="Trainer name"
          autoComplete="off"
          spellCheck={false}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onName(e.target.value)}
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
        {"text" in value ? <span>{value.text}</span> : <span className={styles.swatch} style={{ background: value.color }} />}
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
  onEdit: () => void;
}

/** The trainer card: portrait, rank and what you've done in the game. */
function TrainerCard({ bestId, wins, losses, onEdit }: CardProps) {
  const { name, appearance, id, since } = useTrainer();
  const list = usePokedex((s) => s.list);
  const pets = useTamagotchi((s) => s.pets);
  const coins = useTamagotchi((s) => s.coins);
  const favorites = useFavorites((s) => s.ids.size);
  const record = useBattleRecord((s) => (bestId !== null ? s.records[bestId] : undefined));
  const rank = rankOf(wins);
  const battles = wins + losses;
  const nameOf = (dexId: number) => (list.find((p) => p.id === dexId)?.name ?? `#${dexId}`).toUpperCase();

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
        <div className={styles.rank}>
          <span>{rank.title}</span>
          <small>{rank.next !== null ? `${rank.next} win${rank.next === 1 ? "" : "s"} to ${rankOf(wins + rank.next).title}` : "Top rank!"}</small>
        </div>
        <dl>
          <dt>BATTLES</dt>
          <dd>
            {wins}W {losses}L{battles > 0 && <small> ({Math.round((wins / battles) * 100)}%)</small>}
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
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={pet.uid} className={styles.mini} src={`/sprites/${pet.dexId}.png`} alt={nameOf(pet.dexId)} title={nameOf(pet.dexId)} draggable={false} />
              );
            })}
          </dd>
          <dt>FAVORITES</dt>
          <dd>★ {favorites}</dd>
          <dt>COINS</dt>
          <dd className={styles.coins}>{coins}₽</dd>
          <dt>STARTED</dt>
          <dd>{since ? new Date(since).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}</dd>
        </dl>
      </div>
    </div>
  );
}
