"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDexNumber, type Pokemon } from "@/data/pokedex";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { chooseAction, chooseReplacement } from "@/lib/battle/ai";
import { choiceWinChance, winChance } from "@/lib/battle/montecarlo";
import { effectiveness } from "@/lib/typeChart";
import {
  type BattleEvent,
  type BattleState,
  canSwitch,
  type Choice,
  createTeamBattle,
  type Fighter,
  type ItemId,
  ITEMS,
  needsReplacement,
  runTurn,
  type Side,
  switchIn,
} from "@/lib/battle/engine";
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
/** Coins per foe Pokémon beaten. */
const WIN_REWARD = 15;
/** How long each event stays on screen (A skips ahead). */
const EVENT_MS = 1100;
const SILENT_EVENT_MS = 450;
/** Below this share of HP the low-HP beep plays (once per drop). */
const LOW_HP = 0.2;
/** Simulations per live win-chance update, run in chunks so the screen stays responsive. */
const LIVE_RUNS = 600;
const LIVE_CHUNK = 100;
/** Simulations per option on the party screen (each switch is estimated separately). */
const PARTY_RUNS = 300;
/** D-pad in the 2×2 menus. */
const GRID_STEPS: Partial<Record<DeviceButton, number>> = { UP: -2, DOWN: 2, LEFT: -1, RIGHT: 1 };
/** D-pad in the bag and party lists. */
const LIST_STEPS: Partial<Record<DeviceButton, number>> = { UP: -1, DOWN: 1 };
const COMMANDS = ["FIGHT", "BAG", "POKéMON", "RUN"] as const;
const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const ITEM_INFO: Record<ItemId, string> = { potion: "Restores 60 HP.", fullheal: "Cures status and confusion." };

/**
 * ready: win chance, A to start. command: FIGHT / BAG / POKéMON / RUN.
 * fight / bag / party: the submenus. playing: events playing back. over.
 */
type Phase = "ready" | "command" | "fight" | "bag" | "party" | "playing" | "over";

interface SideView {
  dexId: number;
  hp: number;
  maxHp: number;
  status: Status | null;
  /** Team members down (for the ball row). */
  fainted: number;
}

interface Props {
  /** One Pokémon each in a single battle, three in a team battle (the first leads). */
  player: Pokemon[];
  foe: Pokemon[];
  active: boolean;
  onNotice: (text: string) => void;
  /** Back to choosing the opponent. */
  onLeave: () => void;
}

const team = (st: BattleState, side: Side) => [st[side], ...st.bench[side]];

const sideView = (st: BattleState, side: Side): SideView => ({
  dexId: st[side].dexId,
  hp: st[side].hp,
  maxHp: st[side].maxHp,
  status: st[side].status,
  fainted: team(st, side).filter((f) => f.hp <= 0).length,
});

const viewOf = (st: BattleState): Record<Side, SideView> => ({ a: sideView(st, "a"), b: sideView(st, "b") });

/**
 * The battle itself: win chance before it starts, then turns. You pick a
 * command (a move, an item, a switch or running away), the foe's AI picks
 * one, the engine resolves the turn and its events are played back one by
 * one (messages, HP bars, hits, sounds). In a team battle, a fainted Pokémon
 * is replaced (you choose yours) until one side has nobody left.
 */
export function BattleArena({ player, foe, active, onNotice, onLeave }: Props) {
  const single = player.length === 1 && foe.length === 1;
  const byId = useMemo(() => new Map([...player, ...foe].map((p) => [p.id, p])), [player, foe]);
  const [sets, setSets] = useState<{ a: BattlePokemon[]; b: BattlePokemon[] } | null>(null);
  /** Pre-battle win chance from the ML model (single battles only). */
  const [chance, setChance] = useState<number | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>("ready");
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [view, setView] = useState<Record<Side, SideView> | null>(null);
  /** Cursors of the command menu, the moves, the bag and the party. */
  const [cursor, setCursor] = useState({ command: 0, fight: 0, bag: 0, party: 0 });
  /** The party menu opened because your Pokémon fainted (can't cancel). */
  const [forced, setForced] = useState(false);
  const [hit, setHit] = useState<{ side: Side; key: number } | null>(null);
  const [fainted, setFainted] = useState<Record<Side, boolean>>({ a: false, b: false });
  /** Win chance from simulating the rest of the battle (Monte Carlo). */
  const [live, setLive] = useState<number | null>(null);
  const shownHp = useRef<Record<Side, { hp: number; max: number }>>({ a: { hp: 0, max: 1 }, b: { hp: 0, max: 1 } });
  /** The Pokémon on the field as the playback shows it (for names in messages). */
  const shownId = useRef<Record<Side, number>>({ a: player[0].id, b: foe[0].id });
  /** Win chance if each party row is sent out / switched in (null while estimating). */
  const [partyChances, setPartyChances] = useState<(number | null)[]>([]);
  /** Bumped to cancel an in-progress live estimate (and the party estimates). */
  const liveJob = useRef(0);
  const partyJob = useRef(0);
  const playback = useRef<{ events: BattleEvent[]; final: BattleState; index: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Legendary and mythical foes get their own theme; otherwise one of the two battle themes.
  useEffect(() => {
    const track = foe.some((p) => p.isLegendary || p.isMythical) ? "battleLegend" : Math.random() < 0.5 ? "battle" : "battle2";
    useScreen.getState().setBattleTrack(track);
    return () => useScreen.getState().setBattleTrack("battle");
  }, [foe]);

  const nameOf = (id: number) => (byId.get(id)?.name ?? "?").toUpperCase();
  const name = (side: Side) => (side === "a" ? nameOf(shownId.current.a) : `Foe ${nameOf(shownId.current.b)}`);

  /**
   * Estimates side A's win chance from this state: chunks of simulations
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

  /**
   * On the party screen: the win chance for each Pokémon you could send out.
   * Forced (yours fainted): the battle with that one sent in. By choice: that
   * switch as this turn's action, against the foe's reply; the Pokémon already
   * out shows the current chance. Chunks of simulations per option, refined
   * in turns so all the numbers fill in together.
   */
  const estimateParty = (st: BattleState, isForced: boolean) => {
    const job = ++partyJob.current;
    const members = team(st, "a");
    const totals = members.map(() => 0);
    let done = 0;
    setPartyChances(members.map(() => null));
    const step = () => {
      if (job !== partyJob.current) return;
      done += LIVE_CHUNK;
      const chances = members.map((f, i) => {
        if (f.hp <= 0 || (isForced && i === 0)) return null;
        if (i === 0) totals[0] += winChance(st, LIVE_CHUNK) * LIVE_CHUNK;
        else if (isForced) totals[i] += winChance(switchIn(st, "a", i - 1).state, LIVE_CHUNK) * LIVE_CHUNK;
        else totals[i] += choiceWinChance(st, { switchTo: i - 1 }, LIVE_CHUNK) * LIVE_CHUNK;
        return totals[i] / done;
      });
      setPartyChances(chances);
      if (done < PARTY_RUNS) setTimeout(step, 0);
    };
    setTimeout(step, 0);
  };

  // Battle sets (stats and moves) and the pre-battle win chance: the ML model
  // for a single battle, a simulation of the whole battle for teams.
  const playerKey = player.map((p) => p.id).join();
  const foeKey = foe.map((p) => p.id).join();
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    loadBattleSets()
      .then((all) => {
        const a = player.map((p) => all[p.id]);
        const b = foe.map((p) => all[p.id]);
        if (cancelled || a.some((s) => !s) || b.some((s) => !s)) return;
        setSets({ a, b });
        if (!single) updateLive(createTeamBattle(a, b));
      })
      .catch(() => {});
    if (single) {
      preBattleSnapshot(player[0].id, foe[0].id)
        .then((snapshot) => (snapshot ? predictWin(snapshot, controller.signal) : null))
        .then((p) => !cancelled && setChance(p?.probability ?? null))
        .catch(() => !cancelled && setChance(null));
    }
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer.current);
      // A counter, not a DOM ref: bumping it cancels the running estimate.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      liveJob.current++;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      partyJob.current++;
    };
    // The keys stand for the teams (new arrays on every render of the parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerKey, foeKey]);

  const start = () => {
    if (!sets) return onNotice("Loading the battle data...");
    const st = createTeamBattle(sets.a, sets.b);
    shownHp.current = { a: { hp: st.a.hp, max: st.a.maxHp }, b: { hp: st.b.hp, max: st.b.maxHp } };
    shownId.current = { a: st.a.dexId, b: st.b.dexId };
    setLive(null);
    updateLive(st);
    setBattle(st);
    setView(viewOf(st));
    setFainted({ a: false, b: false });
    setCursor({ command: 0, fight: 0, bag: 0, party: 0 });
    setPhase("command");
    const go = `Go, ${name("a")}!`;
    onNotice(single ? `${go} What will it do?` : `The foe sent out ${nameOf(st.b.dexId)}! ${go}`);
    usePokedex.getState().playCry(st.a.dexId);
  };

  /** Applies one event to the screen; returns how long to show it. */
  const show = (event: BattleEvent): number => {
    const setHp = (side: Side, hp: number) => {
      // Classic warning beeps when your Pokémon drops into the red.
      const { hp: before, max } = shownHp.current[side];
      if (side === "a" && hp > 0 && hp <= max * LOW_HP && before > max * LOW_HP) playSfx("lowHp");
      shownHp.current[side] = { hp, max };
      setView((v) => v && { ...v, [side]: { ...v[side], hp } });
    };
    // Text first: a switch event names the Pokémon that is leaving.
    const text = describeBattleEvent(event, name);
    switch (event.kind) {
      case "damage":
        setHp(event.side, event.hp);
        setHit({ side: event.side, key: Date.now() });
        playSfx(event.effectiveness > 1 ? "superHit" : event.effectiveness < 1 ? "weakHit" : "hit");
        break;
      case "heal":
        setHp(event.side, event.hp);
        playSfx("heal");
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
      case "cure":
        setView((v) => v && { ...v, [event.side]: { ...v[event.side], status: null } });
        if (event.kind === "cure") playSfx("heal");
        break;
      case "faint":
        setFainted((f) => ({ ...f, [event.side]: true }));
        setView((v) => v && { ...v, [event.side]: { ...v[event.side], fainted: v[event.side].fainted + 1 } });
        playSfx("faint");
        usePokedex.getState().playCry(shownId.current[event.side]);
        break;
      case "switch":
        shownId.current[event.side] = event.dexId;
        shownHp.current[event.side] = { hp: event.hp, max: event.maxHp };
        setFainted((f) => ({ ...f, [event.side]: false }));
        setView((v) => v && { ...v, [event.side]: { ...v[event.side], dexId: event.dexId, hp: event.hp, maxHp: event.maxHp, status: event.status } });
        playSfx("ball");
        usePokedex.getState().playCry(event.dexId);
        break;
    }
    if (text) onNotice(text);
    return text ? EVENT_MS : SILENT_EVENT_MS;
  };

  const play = (events: BattleEvent[], final: BattleState) => {
    partyJob.current++;
    playback.current = { events, final, index: 0 };
    setPhase("playing");
    playNext();
  };

  const finish = (final: BattleState) => {
    playback.current = null;
    setBattle(final);
    setView(viewOf(final));
    if (final.winner) return gameOver(final);
    // Your Pokémon fainted: choose the next one (the foe's replacement comes after).
    if (needsReplacement(final, "a")) {
      // The live chance drops right away (assuming the best replacement).
      updateLive(final);
      estimateParty(final, true);
      setForced(true);
      setCursor((c) => ({ ...c, party: 1 + final.bench.a.findIndex((f) => f.hp > 0) }));
      setPhase("party");
      onNotice("Choose the next Pokémon! A: send out");
      return;
    }
    if (needsReplacement(final, "b")) {
      const { state, events } = switchIn(final, "b", chooseReplacement(final.bench.b, final.a));
      return play(events, state);
    }
    updateLive(final);
    setPhase("command");
    const me = nameOf(final.a.dexId);
    if (final.a.mustRecharge) onNotice(`${me} must recharge! Press A.`);
    else if (final.a.locked) onNotice(`${me} keeps using ${final.a.moves[final.a.locked.index].name}! Press A.`);
    else onNotice(`What will ${me} do?`);
  };

  const gameOver = (final: BattleState) => {
    updateLive(final);
    setPhase("over");
    const won = final.winner === "a";
    const list = usePokedex.getState().list;
    const notes: string[] = [];
    for (const p of player) {
      useBattleRecord.getState().record(p.id, won);
      // A party member of this species gets XP (and may evolve).
      const pet = useTamagotchi.getState().battled(p.id, won, list);
      if (won && pet) {
        const evolved = pet.evolvedTo ? list.find((x) => x.id === pet.evolvedTo)?.name.toUpperCase() : null;
        notes.push(`${p.name.toUpperCase()} gained ${pet.xp} XP!${evolved ? ` It evolved into ${evolved}!` : ""}`);
      }
    }
    if (won) {
      const coins = WIN_REWARD * foe.length;
      playSfx("win");
      useTamagotchi.getState().reward(coins);
      onNotice(`You won! +${coins}₽ ${notes.join(" ")}   A: rematch   B: new opponent`);
    } else {
      playSfx("lose");
      onNotice(`${single ? `${nameOf(final.a.dexId)} lost...` : "Your team was defeated..."} A: rematch   B: new opponent`);
    }
  };

  const playNext = () => {
    const pb = playback.current;
    if (!pb) return;
    if (pb.index >= pb.events.length) return finish(pb.final);
    const delay = show(pb.events[pb.index++]);
    timer.current = setTimeout(playNext, delay);
  };

  /** Your choice for the turn; the foe's AI picks its own and the turn plays. */
  const submit = (choice: Choice) => {
    if (!battle) return;
    const result = runTurn(battle, choice, chooseAction(battle, "b"));
    play(result.events, result.state);
  };

  const runAway = () => {
    clearTimeout(timer.current);
    setPhase("ready");
    setBattle(null);
    setView(null);
    onNotice("Got away safely!");
    if (!single && sets) updateLive(createTeamBattle(sets.a, sets.b));
  };

  const command = (index: number) => {
    if (!battle) return;
    const me = battle.a;
    // Locked into a move or recharging: the turn just goes on.
    if ((me.locked || me.mustRecharge) && COMMANDS[index] !== "RUN") return submit(0);
    switch (COMMANDS[index]) {
      case "FIGHT":
        setPhase("fight");
        return;
      case "BAG":
        setPhase("bag");
        onNotice("Use which item? B: back");
        return;
      case "POKéMON":
        if (!single) estimateParty(battle, false);
        setForced(false);
        setCursor((c) => ({ ...c, party: 0 }));
        setPhase("party");
        onNotice(single ? "No other Pokémon in this battle. B: back" : "Switch to which Pokémon? B: back");
        return;
      case "RUN":
        runAway();
    }
  };

  const fight = (index: number) => {
    if (!battle) return;
    const me = battle.a;
    if (me.moves[index]?.ppLeft === 0 && me.moves.some((m) => m.ppLeft > 0)) return onNotice("There's no PP left for this move!");
    submit(index);
  };

  const pickItem = (index: number) => {
    if (!battle) return;
    const item = ITEM_IDS[index];
    if (!(battle.bag.a[item] > 0)) return onNotice(`No ${ITEMS[item].name.toUpperCase()} left!`);
    submit({ item });
  };

  /** Party row `index`: 0 is the Pokémon out, then the bench. */
  const sendOut = (index: number) => {
    if (!battle) return;
    const f = team(battle, "a")[index];
    if (!f) return;
    if (f.hp <= 0) return onNotice(`${f.name.toUpperCase()} has no energy left to battle!`);
    if (index === 0) return onNotice(`${f.name.toUpperCase()} is already in battle!`);
    if (forced) {
      // Between turns: no turn is spent. The foe replaces its own after.
      let { state, events } = switchIn(battle, "a", index - 1);
      if (needsReplacement(state, "b")) {
        const foeSwitch = switchIn(state, "b", chooseReplacement(state.bench.b, state.a));
        state = foeSwitch.state;
        events = [...events, ...foeSwitch.events];
      }
      setForced(false);
      return play(events, state);
    }
    if (!canSwitch(battle, "a")) return onNotice(`${nameOf(battle.a.dexId)} can't be switched out now!`);
    submit({ switchTo: index - 1 });
  };

  const moveCursor = (key: "command" | "fight" | "bag" | "party", count: number, button: DeviceButton, steps = GRID_STEPS) => {
    const step = steps[button] ?? 0;
    setCursor((c) => ({ ...c, [key]: Math.max(0, Math.min(count - 1, c[key] + step)) }));
  };

  const handle = (button: DeviceButton): boolean => {
    if (button === "ZOOM") return false;
    // No switching tabs in the middle of a fight (it would end it).
    if (button === "MENU") return phase !== "ready" && phase !== "over";
    switch (phase) {
      case "ready":
        if (button === "A") start();
        else if (button === "B") onLeave();
        return true;
      case "command":
        if (button === "A") command(cursor.command);
        else moveCursor("command", COMMANDS.length, button);
        return true;
      case "fight":
        if (button === "A") fight(cursor.fight);
        else if (button === "B") setPhase("command");
        else moveCursor("fight", battle?.a.moves.length ?? 0, button);
        return true;
      case "bag":
        if (button === "A") pickItem(cursor.bag);
        else if (button === "B") setPhase("command");
        else moveCursor("bag", ITEM_IDS.length, button, LIST_STEPS);
        return true;
      case "party":
        if (button === "A") sendOut(cursor.party);
        else if (button === "B") {
          if (forced) onNotice("Choose a Pokémon to send out!");
          else {
            partyJob.current++;
            setPhase("command");
          }
        } else moveCursor("party", battle ? team(battle, "a").length : 0, button, LIST_STEPS);
        return true;
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

  const record = useBattleRecord((s) => (single ? s.records[player[0].id] : undefined));
  const sideOf = (s: Side): SideView =>
    view?.[s] ?? { dexId: (s === "a" ? player : foe)[0].id, hp: 1, maxHp: 1, status: null, fainted: 0 };
  const shown = { a: byId.get(sideOf("a").dexId) ?? player[0], b: byId.get(sideOf("b").dexId) ?? foe[0] };
  const balls = (s: Side) => (single ? undefined : { size: (s === "a" ? player : foe).length, fainted: sideOf(s).fainted });

  let bottom;
  if (phase === "ready") {
    bottom = <WinChance probability={single ? chance : (live ?? undefined)} simulated={!single} record={record} />;
  } else if (phase === "command") {
    bottom = (
      <CommandMenu
        selected={cursor.command}
        turn={battle?.turn ?? 1}
        onPick={(i) => {
          setCursor((c) => ({ ...c, command: i }));
          command(i);
        }}
      />
    );
  } else if (phase === "bag" && battle) {
    bottom = (
      <BagMenu
        bag={battle.bag.a}
        selected={cursor.bag}
        onPick={(i) => {
          setCursor((c) => ({ ...c, bag: i }));
          pickItem(i);
        }}
      />
    );
  } else {
    bottom = (
      <MoveMenu
        fighter={battle?.a ?? null}
        foeTypes={battle?.b.types ?? shown.b.types}
        selected={cursor.fight}
        disabled={phase !== "fight"}
        onPick={(i) => {
          if (phase !== "fight") return;
          setCursor((c) => ({ ...c, fight: i }));
          fight(i);
        }}
      />
    );
  }

  return (
    <div className={styles.scene} data-terrain={terrainFor(foe[0].types)}>
      <div className={styles.backdrop} aria-hidden />

      <StatusBox pokemon={shown.b} side="foe" view={sideOf("b")} balls={balls("b")} />
      <span className={styles.platform} data-side="foe" aria-hidden />
      <Sprite pokemon={shown.b} side="foe" hitKey={hit?.side === "b" ? hit.key : null} fainted={fainted.b} />

      <StatusBox pokemon={shown.a} side="player" view={sideOf("a")} balls={balls("a")} />
      <span className={styles.platform} data-side="player" aria-hidden />
      <Sprite pokemon={shown.a} side="player" hitKey={hit?.side === "a" ? hit.key : null} fainted={fainted.a} />

      {phase !== "ready" && <LiveChance value={live} />}

      {bottom}

      {phase === "party" && battle && (
        <PartyMenu
          members={team(battle, "a")}
          chances={partyChances}
          selected={cursor.party}
          forced={forced}
          onPick={(i) => {
            setCursor((c) => ({ ...c, party: i }));
            sendOut(i);
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
      // A new key on each hit (or Pokémon) restarts the animation.
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

const hpTone = (pct: number) => (pct > 50 ? "high" : pct >= 20 ? "mid" : "low");

function StatusBox({
  pokemon,
  side,
  view,
  balls,
}: {
  pokemon: Pokemon;
  side: "player" | "foe";
  view: SideView;
  /** Team battles: one ball per team member, empty once fainted. */
  balls?: { size: number; fainted: number };
}) {
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
          <div className={styles.hpFill} data-tone={hpTone(pct)} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className={styles.statusFoot}>
        {balls && (
          <span className={styles.balls} aria-label={`${balls.size - balls.fainted} of ${balls.size} able to battle`}>
            {Array.from({ length: balls.size }, (_, i) => (
              <i key={i} className={styles.ball} data-fainted={i >= balls.size - balls.fainted} />
            ))}
          </span>
        )}
        {side === "player" && <span className={styles.dexNo}>{view.maxHp > 1 ? `${view.hp}/${view.maxHp}` : formatDexNumber(pokemon.id)}</span>}
      </div>
    </div>
  );
}

function WinChance({
  probability,
  simulated,
  record,
}: {
  probability: number | null | undefined;
  /** From simulating the battle (teams) rather than the ML model. */
  simulated: boolean;
  record?: { wins: number; losses: number };
}) {
  const pct = probability == null ? null : Math.round(probability * 100);
  return (
    <div className={styles.chance} role="meter" aria-label="Win chance" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
      <div className={styles.chanceLabel}>
        <span>{simulated ? "TEAM WIN CHANCE" : "WIN CHANCE"}</span>
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

/** FIGHT / BAG / POKéMON / RUN, 2×2 like the classic battle menu. */
function CommandMenu({ selected, turn, onPick }: { selected: number; turn: number; onPick: (i: number) => void }) {
  return (
    <div className={styles.moves}>
      {COMMANDS.map((c, i) => (
        <button key={c} type="button" className={styles.move} onClick={() => onPick(i)}>
          <span className={styles.moveCursor} aria-hidden>
            {i === selected ? "▶" : ""}
          </span>
          <span className={styles.moveName}>{c}</span>
        </button>
      ))}
      <div className={styles.moveInfo}>
        <span>TURN {turn}</span>
        <span>◀▲▼▶ choose</span>
        <span>A: OK</span>
      </div>
    </div>
  );
}

function BagMenu({ bag, selected, onPick }: { bag: Record<ItemId, number>; selected: number; onPick: (i: number) => void }) {
  return (
    <div className={styles.moves} data-layout="list">
      {ITEM_IDS.map((id, i) => (
        <button key={id} type="button" className={styles.move} data-empty={bag[id] === 0} onClick={() => onPick(i)}>
          <span className={styles.moveCursor} aria-hidden>
            {i === selected ? "▶" : ""}
          </span>
          <span className={styles.moveName}>
            {ITEMS[id].name.toUpperCase()} ×{bag[id]}
          </span>
        </button>
      ))}
      <div className={styles.moveInfo}>
        <span>{ITEM_INFO[ITEM_IDS[selected]]}</span>
        <span>Uses your turn.</span>
      </div>
    </div>
  );
}

/** Your team: the Pokémon out first, then the bench. */
function PartyMenu({
  members,
  chances,
  selected,
  forced,
  onPick,
}: {
  members: Fighter[];
  /** Win chance with each one out (null: estimating or not an option). */
  chances: (number | null)[];
  selected: number;
  forced: boolean;
  onPick: (i: number) => void;
}) {
  return (
    <div className={styles.party} role="menu" aria-label="Your Pokémon">
      <div className={styles.menuTitle}>{forced ? "SEND OUT WHICH POKéMON?" : "POKéMON"}</div>
      {members.map((f, i) => {
        const pct = Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100));
        return (
          <button
            key={`${f.dexId}-${i}`}
            type="button"
            role="menuitem"
            className={styles.partyRow}
            aria-current={i === selected}
            data-fainted={f.hp <= 0}
            onClick={() => onPick(i)}
          >
            <span className={styles.moveCursor} aria-hidden>
              {i === selected ? "▶" : ""}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.partyIcon} src={`/sprites/${f.dexId}.png`} alt="" draggable={false} />
            <span className={styles.partyName}>
              {f.name.toUpperCase()}
              {i === 0 && <small> IN BATTLE</small>}
            </span>
            <span className={styles.partyChance} title="Win chance with this Pokémon out (simulated)">
              {chances.length > 0 && f.hp > 0 && !(forced && i === 0) && (
                <>
                  WIN <b>{chances[i] == null ? "…" : `${Math.round(chances[i]! * 100)}%`}</b>
                </>
              )}
            </span>
            <span className={styles.partyHp}>
              {f.hp <= 0 ? (
                <b className={styles.statusTag}>FNT</b>
              ) : (
                f.status && <b className={styles.statusTag} data-status={f.status}>{STATUS_LABEL[f.status]}</b>
              )}
              <span className={styles.hpTrack}>
                <span className={styles.hpFill} data-tone={hpTone(pct)} style={{ width: `${pct}%` }} />
              </span>
              <span>
                {f.hp}/{f.maxHp}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

const EFFECT_LABEL = (multiplier: number) =>
  multiplier === 0 ? "NO EFFECT" : multiplier > 1 ? "SUPER EFFECTIVE" : multiplier < 1 ? "NOT VERY EFFECTIVE" : null;

function MoveMenu({
  fighter,
  foeTypes,
  selected,
  disabled,
  onPick,
}: {
  fighter: Fighter | null;
  foeTypes: string[];
  selected: number;
  disabled: boolean;
  onPick: (i: number) => void;
}) {
  const moves = fighter?.moves ?? [];
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
