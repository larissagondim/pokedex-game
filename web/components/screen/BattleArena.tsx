"use client";

import { useEffect, useRef, useState } from "react";
import { formatDexNumber, type Pokemon } from "@/data/pokedex";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { chooseMove } from "@/lib/battle/ai";
import { type BattleEvent, type BattleState, createBattle, runTurn, type Side } from "@/lib/battle/engine";
import type { BattlePokemon, Status } from "@/lib/battle/types";
import { playSfx } from "@/lib/sfx";
import { loadBattleSets, preBattleSnapshot, predictWin } from "@/lib/winPrediction";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { usePokedex } from "@/stores/pokedex";
import { useScreen } from "@/stores/screen";
import { useTamagotchi } from "@/stores/tamagotchi";
import styles from "./battle.module.css";
import { describeBattleEvent } from "./battleMessages";
import { terrainFor } from "./battleTerrain";

/** Above the main screen handler (10), like the other tabs. */
const INPUT_PRIORITY = 11;
const WIN_REWARD = 15;
/** How long each event stays on screen (A skips ahead). */
const EVENT_MS = 1100;
const SILENT_EVENT_MS = 450;
/** D-pad in the 2×2 move menu. */
const MENU_STEPS = { UP: -2, DOWN: 2, LEFT: -1, RIGHT: 1 };

type Phase = "ready" | "choose" | "playing" | "over";

interface SideView {
  hp: number;
  maxHp: number;
  status: Status | null;
}

interface Props {
  player: Pokemon;
  foe: Pokemon;
  active: boolean;
  onNotice: (text: string) => void;
  /** Back to choosing the opponent. */
  onLeave: () => void;
}

const viewOf = (st: BattleState): Record<Side, SideView> => ({
  a: { hp: st.a.hp, maxHp: st.a.maxHp, status: st.a.status },
  b: { hp: st.b.hp, maxHp: st.b.maxHp, status: st.b.status },
});

/**
 * The battle itself: win chance before it starts, then turns. You pick a
 * move, the foe's AI picks one, the engine resolves the turn and its events
 * are played back one by one (messages, HP bars, hits, sounds).
 */
export function BattleArena({ player, foe, active, onNotice, onLeave }: Props) {
  const [sets, setSets] = useState<{ a: BattlePokemon; b: BattlePokemon } | null>(null);
  const [chance, setChance] = useState<number | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("ready");
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [view, setView] = useState<Record<Side, SideView> | null>(null);
  const [menu, setMenu] = useState(0);
  const [hit, setHit] = useState<{ side: Side; key: number } | null>(null);
  const [fainted, setFainted] = useState<Side | null>(null);
  const playback = useRef<{ events: BattleEvent[]; final: BattleState; index: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Legendary and mythical foes get their own theme; otherwise one of the two battle themes.
  useEffect(() => {
    const track = foe.isLegendary || foe.isMythical ? "battleLegend" : Math.random() < 0.5 ? "battle" : "battle2";
    useScreen.getState().setBattleTrack(track);
    return () => useScreen.getState().setBattleTrack("battle");
  }, [foe]);

  const name = (side: Side) => (side === "a" ? player.name.toUpperCase() : `Foe ${foe.name.toUpperCase()}`);

  // Battle sets (stats and moves) and the pre-battle win chance.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    loadBattleSets()
      .then((all) => {
        if (!cancelled && all[player.id] && all[foe.id]) setSets({ a: all[player.id], b: all[foe.id] });
      })
      .catch(() => {});
    preBattleSnapshot(player.id, foe.id)
      .then((snapshot) => (snapshot ? predictWin(snapshot, controller.signal) : null))
      .then((p) => !cancelled && setChance(p?.probability ?? null))
      .catch(() => !cancelled && setChance(null));
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer.current);
    };
  }, [player.id, foe.id]);

  const start = () => {
    if (!sets) return onNotice("Loading the battle data...");
    const st = createBattle(sets.a, sets.b);
    setBattle(st);
    setView(viewOf(st));
    setFainted(null);
    setMenu(0);
    setPhase("choose");
    onNotice(`Go, ${player.name.toUpperCase()}! What will it do?`);
    usePokedex.getState().playCry(player.id);
  };

  /** Applies one event to the screen; returns how long to show it. */
  const show = (event: BattleEvent): number => {
    const setHp = (side: Side, hp: number) => setView((v) => v && { ...v, [side]: { ...v[side], hp } });
    switch (event.kind) {
      case "damage":
        setHp(event.side, event.hp);
        setHit({ side: event.side, key: Date.now() });
        playSfx(event.effectiveness > 1 ? "superHit" : event.effectiveness < 1 ? "weakHit" : "hit");
        break;
      case "heal":
        setHp(event.side, event.hp);
        break;
      case "recoil":
      case "residual":
      case "self-hit":
        setHp(event.side, event.hp);
        setHit({ side: event.side, key: Date.now() });
        if (event.kind === "self-hit") playSfx("hit");
        break;
      case "leech":
        setHp(event.side, event.hp);
        setHp(event.side === "a" ? "b" : "a", event.healerHp);
        setHit({ side: event.side, key: Date.now() });
        break;
      case "status":
        setView((v) => v && { ...v, [event.side]: { ...v[event.side], status: event.status } });
        break;
      case "wake":
        setView((v) => v && { ...v, [event.side]: { ...v[event.side], status: null } });
        break;
      case "faint":
        setFainted(event.side);
        playSfx("faint");
        usePokedex.getState().playCry(event.side === "a" ? player.id : foe.id);
        break;
    }
    const text = describeBattleEvent(event, name);
    if (text) onNotice(text);
    return text ? EVENT_MS : SILENT_EVENT_MS;
  };

  const finish = (final: BattleState) => {
    playback.current = null;
    setBattle(final);
    setView(viewOf(final));
    if (!final.winner) {
      setPhase("choose");
      onNotice(`What will ${player.name.toUpperCase()} do?`);
      return;
    }
    setPhase("over");
    if (final.winner === "a") {
      playSfx("win");
      useTamagotchi.getState().reward(WIN_REWARD);
      onNotice(`You won! +${WIN_REWARD}₽   A: rematch   B: new opponent`);
    } else {
      playSfx("lose");
      onNotice(`${player.name.toUpperCase()} lost... A: rematch   B: new opponent`);
    }
  };

  const playNext = () => {
    const pb = playback.current;
    if (!pb) return;
    if (pb.index >= pb.events.length) return finish(pb.final);
    const delay = show(pb.events[pb.index++]);
    timer.current = setTimeout(playNext, delay);
  };

  const choose = (index: number) => {
    if (!battle) return;
    const result = runTurn(battle, index, chooseMove(battle.b, battle.a));
    playback.current = { events: result.events, final: result.state, index: 0 };
    setPhase("playing");
    playNext();
  };

  const handle = (button: DeviceButton): boolean => {
    if (button === "MENU" || button === "ZOOM") return false;
    switch (phase) {
      case "ready":
        if (button === "A") start();
        else if (button === "B") onLeave();
        return true;
      case "choose": {
        const moves = battle?.a.moves.length ?? 0;
        if (button === "A") choose(menu);
        else if (button === "B") {
          setPhase("ready");
          setBattle(null);
          setView(null);
          onNotice("Got away safely!");
        } else if (moves > 0) {
          const step = (MENU_STEPS as Partial<Record<DeviceButton, number>>)[button] ?? 0;
          setMenu((m) => Math.max(0, Math.min(moves - 1, m + step)));
        }
        return true;
      }
      case "playing":
        if (button === "A") {
          clearTimeout(timer.current);
          playNext();
        }
        return true;
      case "over":
        if (button === "A") start();
        else if (button === "B") onLeave();
        return true;
    }
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

  const side = (s: Side): SideView => view?.[s] ?? { hp: 1, maxHp: 1, status: null };

  return (
    <div className={styles.scene} data-terrain={terrainFor(foe.types)}>
      <div className={styles.backdrop} aria-hidden />

      <StatusBox pokemon={foe} side="foe" view={side("b")} />
      <span className={styles.platform} data-side="foe" aria-hidden />
      <Sprite pokemon={foe} side="foe" hitKey={hit?.side === "b" ? hit.key : null} fainted={fainted === "b"} />

      <StatusBox pokemon={player} side="player" view={side("a")} />
      <span className={styles.platform} data-side="player" aria-hidden />
      <Sprite pokemon={player} side="player" hitKey={hit?.side === "a" ? hit.key : null} fainted={fainted === "a"} />

      {phase === "ready" ? (
        <WinChance probability={chance} />
      ) : (
        <MoveMenu
          battle={battle}
          selected={menu}
          disabled={phase !== "choose"}
          onPick={(i) => {
            if (phase !== "choose") return;
            setMenu(i);
            choose(i);
          }}
        />
      )}
    </div>
  );
}

function Sprite({ pokemon, side, hitKey, fainted }: { pokemon: Pokemon; side: "player" | "foe"; hitKey: number | null; fainted: boolean }) {
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState<string | null>(null);
  const gif = side === "foe" ? pokemon.animated : pokemon.animatedBack;
  const still = side === "foe" ? `/sprites/${pokemon.id}.png` : `/sprites/back/${pokemon.id}.png`;
  const src = gif && !reducedMotion && failed !== gif ? gif : still;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      // A new key on each hit restarts the blink animation.
      key={`${side}-${pokemon.id}-${hitKey ?? "idle"}`}
      className={styles.sprite}
      data-side={side}
      data-hit={hitKey !== null}
      data-fainted={fainted}
      src={src}
      alt={pokemon.name}
      draggable={false}
      onError={() => gif && setFailed(gif)}
    />
  );
}

const STATUS_LABEL: Record<Status, string> = { brn: "BRN", par: "PAR", psn: "PSN", tox: "PSN", slp: "SLP" };

function StatusBox({ pokemon, side, view }: { pokemon: Pokemon; side: "player" | "foe"; view: SideView }) {
  const pct = Math.max(0, Math.min(100, (view.hp / view.maxHp) * 100));
  return (
    <div className={styles.status} data-side={side}>
      <div className={styles.statusName}>
        <span>{pokemon.name.toUpperCase()}</span>
        <span>
          {view.status && <b className={styles.statusTag} data-status={view.status}>{STATUS_LABEL[view.status]}</b>}
          Lv50
        </span>
      </div>
      <div className={styles.hp}>
        <span>HP</span>
        <div className={styles.hpTrack}>
          <div className={styles.hpFill} data-tone={pct > 50 ? "high" : pct >= 20 ? "mid" : "low"} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {side === "player" && (
        <div className={styles.dexNo}>
          {view.maxHp > 1 ? `${view.hp}/${view.maxHp}` : formatDexNumber(pokemon.id)}
        </div>
      )}
    </div>
  );
}

function WinChance({ probability }: { probability: number | null | undefined }) {
  const pct = probability == null ? null : Math.round(probability * 100);
  return (
    <div className={styles.chance} role="meter" aria-label="Win chance" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
      <div className={styles.chanceLabel}>
        <span>WIN CHANCE</span>
        <span>{probability === undefined ? "…" : pct === null ? "?" : `${pct}%`}</span>
      </div>
      <div className={styles.chanceTrack}>
        <div className={styles.chanceFill} style={{ width: `${pct ?? 50}%` }} data-unknown={pct === null} />
      </div>
      <div className={styles.chanceHint}>A: fight · B: change opponent</div>
    </div>
  );
}

function MoveMenu({ battle, selected, disabled, onPick }: { battle: BattleState | null; selected: number; disabled: boolean; onPick: (i: number) => void }) {
  const moves = battle?.a.moves ?? [];
  const current = moves[selected];
  return (
    <div className={styles.moves} data-disabled={disabled}>
      {moves.map((m, i) => (
        <button key={m.id + i} type="button" className={styles.move} onClick={() => onPick(i)}>
          <span className={styles.moveCursor} aria-hidden>
            {i === selected && !disabled ? "▶" : ""}
          </span>
          <span className={styles.moveName}>{m.name.toUpperCase()}</span>
        </button>
      ))}
      {current && (
        <div className={styles.moveInfo}>
          <span className={styles.moveType} data-type={current.type}>
            {current.type.toUpperCase()}
          </span>
          <span>
            PP {current.ppLeft}/{current.pp}
          </span>
          <span>{current.category === "status" ? "STATUS" : `POW ${current.power || "—"}`}</span>
        </div>
      )}
    </div>
  );
}
