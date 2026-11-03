"use client";

import { useEffect, useRef, useState } from "react";
import { formatDexNumber, type Pokemon } from "@/data/pokedex";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { chooseMove } from "@/lib/battle/ai";
import { winChance } from "@/lib/battle/montecarlo";
import { effectiveness } from "@/lib/typeChart";
import { type BattleEvent, type BattleState, createBattle, runTurn, type Side } from "@/lib/battle/engine";
import type { BattlePokemon, Status } from "@/lib/battle/types";
import { playSfx } from "@/lib/sfx";
import { loadBattleSets, preBattleSnapshot, predictWin } from "@/lib/winPrediction";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { usePokedex } from "@/stores/pokedex";
import { useScreen } from "@/stores/screen";
import { useBattleRecord } from "@/stores/battleRecord";
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
/** Below this share of HP the low-HP beep plays (once per drop). */
const LOW_HP = 0.2;
/** Simulations per live win-chance update, run in chunks so the screen stays responsive. */
const LIVE_RUNS = 600;
const LIVE_CHUNK = 100;
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
  /** Win chance during the fight, from simulating the rest of it (Monte Carlo). */
  const [live, setLive] = useState<number | null>(null);
  const shownHp = useRef<Record<Side, number>>({ a: 0, b: 0 });
  /** Bumped to cancel an in-progress live estimate. */
  const liveJob = useRef(0);
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
      // A counter, not a DOM ref: bumping it cancels the running estimate.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      liveJob.current++;
    };
  }, [player.id, foe.id]);

  /**
   * Re-estimates the live win chance from this state: chunks of simulations
   * between frames, showing the running average as it gets more precise
   * (600 runs: about ±2%). A newer state cancels the old estimate.
   */
  const updateLive = (st: BattleState) => {
    const job = ++liveJob.current;
    if (st.winner) return setLive(st.winner === "a" ? 1 : 0);
    let total = 0;
    let done = 0;
    const step = () => {
      if (job !== liveJob.current) return;
      total += winChance(st, LIVE_CHUNK) * LIVE_CHUNK;
      done += LIVE_CHUNK;
      setLive(total / done);
      if (done < LIVE_RUNS) setTimeout(step, 0);
    };
    setTimeout(step, 0);
  };

  const start = () => {
    if (!sets) return onNotice("Loading the battle data...");
    const st = createBattle(sets.a, sets.b);
    shownHp.current = { a: st.a.hp, b: st.b.hp };
    setLive(null);
    updateLive(st);
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
    const setHp = (side: Side, hp: number) => {
      // Classic warning beeps when your Pokémon drops into the red.
      const max = battle?.[side].maxHp ?? 1;
      if (side === "a" && hp > 0 && hp <= max * LOW_HP && shownHp.current.a > max * LOW_HP) playSfx("lowHp");
      shownHp.current[side] = hp;
      setView((v) => v && { ...v, [side]: { ...v[side], hp } });
    };
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
      case "hp-cost":
        setHp(event.side, event.hp);
        break;
      case "pain-split":
        setHp("a", event.hp.a);
        setHp("b", event.hp.b);
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
    updateLive(final);
    const me = player.name.toUpperCase();
    if (!final.winner) {
      setPhase("choose");
      if (final.a.mustRecharge) onNotice(`${me} must recharge! Press A.`);
      else if (final.a.locked) onNotice(`${me} keeps using ${final.a.moves[final.a.locked.index].name}! Press A.`);
      else onNotice(`What will ${me} do?`);
      return;
    }
    setPhase("over");
    const won = final.winner === "a";
    useBattleRecord.getState().record(player.id, won);
    // A party member of this species gets XP (and may evolve).
    const party = useTamagotchi.getState().battled(player.id, won, usePokedex.getState().list);
    if (won) {
      playSfx("win");
      useTamagotchi.getState().reward(WIN_REWARD);
      const xp = party ? ` ${me} gained ${party.xp} XP!` : "";
      const evolved = party?.evolvedTo ? usePokedex.getState().list.find((p) => p.id === party.evolvedTo)?.name.toUpperCase() : null;
      onNotice(`You won! +${WIN_REWARD}₽${xp}${evolved ? ` It evolved into ${evolved}!` : ""}   A: rematch   B: new opponent`);
    } else {
      playSfx("lose");
      onNotice(`${me} lost... A: rematch   B: new opponent`);
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
    const me = battle.a;
    if (!me.locked && !me.mustRecharge && me.moves[index]?.ppLeft === 0 && me.moves.some((m) => m.ppLeft > 0)) {
      onNotice("There's no PP left for this move!");
      return;
    }
    const result = runTurn(battle, index, chooseMove(battle.b, battle.a));
    playback.current = { events: result.events, final: result.state, index: 0 };
    setPhase("playing");
    playNext();
  };

  const handle = (button: DeviceButton): boolean => {
    if (button === "ZOOM") return false;
    // No switching tabs in the middle of a fight (it would end it).
    if (button === "MENU") return phase === "choose" || phase === "playing";
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

  const record = useBattleRecord((s) => s.records[player.id]);
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

      {phase !== "ready" && <LiveChance value={live} />}

      {phase === "ready" ? (
        <WinChance probability={chance} record={record} />
      ) : (
        <MoveMenu
          battle={battle}
          foeTypes={foe.types}
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

function WinChance({ probability, record }: { probability: number | null | undefined; record?: { wins: number; losses: number } }) {
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
      <div className={styles.chanceHint}>
        A: fight · B: change opponent{record ? ` · record ${record.wins}W ${record.losses}L` : ""}
      </div>
    </div>
  );
}

/** Win chance during the fight (Monte Carlo over the rest of the battle). */
function LiveChance({ value }: { value: number | null }) {
  const pct = value === null ? null : Math.round(value * 100);
  return (
    <div className={styles.live} title="Simulated from the current state">
      <span>WIN</span>
      <b>{pct === null ? "…" : `${pct}%`}</b>
      <div className={styles.liveTrack}>
        <div className={styles.chanceFill} style={{ width: `${pct ?? 50}%` }} />
      </div>
    </div>
  );
}

const EFFECT_LABEL = (multiplier: number) =>
  multiplier === 0 ? "NO EFFECT" : multiplier > 1 ? "SUPER EFFECTIVE" : multiplier < 1 ? "NOT VERY EFFECTIVE" : null;

function MoveMenu({
  battle,
  foeTypes,
  selected,
  disabled,
  onPick,
}: {
  battle: BattleState | null;
  foeTypes: string[];
  selected: number;
  disabled: boolean;
  onPick: (i: number) => void;
}) {
  const moves = battle?.a.moves ?? [];
  const current = moves[selected];
  const hint = current && current.category !== "status" ? EFFECT_LABEL(effectiveness(current.type, foeTypes)) : null;
  return (
    <div className={styles.moves} data-disabled={disabled}>
      {moves.map((m, i) => (
        <button key={m.id + i} type="button" className={styles.move} data-empty={m.ppLeft === 0} onClick={() => onPick(i)}>
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
          {hint && (
            <span className={styles.effect} data-effect={hint}>
              {hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
