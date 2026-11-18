"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Pokemon } from "@/data/pokedex";
import { useBattleRecord } from "@/stores/battleRecord";
import { usePokedex } from "@/stores/pokedex";
import { useFavorites } from "@/stores/favorites";
import { canChallenge, LEAGUE, leagueBonus, leaderState } from "@/lib/league";
import { battleCondition, tick } from "@/lib/tamagotchi";
import { useLeague } from "@/stores/league";
import { useTamagotchi } from "@/stores/tamagotchi";
import styles from "./battle.module.css";
import { BattleArena } from "./BattleArena";
import { BattleMenu } from "./BattleMenu";
import { PokemonPicker } from "./PokemonPicker";

interface Props {
  /** The tab is visible and the screen accepts input. */
  active: boolean;
  onNotice: (text: string) => void;
}

type Mode = "single" | "team" | "full";
type Step = "menu" | "record" | "league" | "player" | "foeSource" | "foe" | "battle";

const TEAM_SIZE: Record<Mode, number> = { single: 1, team: 3, full: 6 };

const MODES: { label: string; detail: string; mode?: Mode; step?: Step }[] = [
  { label: "SINGLE BATTLE", detail: "1 vs 1. The ML model predicts the winner before you start.", mode: "single" },
  { label: "TEAM BATTLE", detail: "3 vs 3. Switch Pokémon, use items; the last one standing wins.", mode: "team" },
  { label: "FULL BATTLE", detail: "6 vs 6, a full team each, like a real trainer battle.", mode: "full" },
  { label: "LEAGUE", detail: "8 leaders, 3 vs 3, one after another. Beat them all!", step: "league" },
  { label: "RECORD", detail: "Your wins and losses.", step: "record" },
];
const FOE_SOURCES = [
  { label: "CHOOSE", detail: "Pick the opponent from the list." },
  { label: "RANDOM", detail: "A surprise opponent from all 1025 Pokémon." },
];

const randomPicks = (list: readonly Pokemon[], n: number) => {
  const picked = new Map<number, Pokemon>();
  while (picked.size < Math.min(n, list.length)) {
    const p = list[Math.floor(Math.random() * list.length)];
    picked.set(p.id, p);
  }
  return [...picked.values()];
};

const CONDITION_NOTE = { great: "is in great shape!", tired: "is tired and fights weaker.", hungry: "is hungry and fights weaker." } as const;

/** "PIKACHU is tired and fights weaker." for each party member not in an ordinary condition. */
function conditionNotes(team: readonly Pokemon[]): string {
  const pets = useTamagotchi.getState().pets;
  const now = Date.now();
  return team
    .flatMap((p) => {
      const pet = pets.find((x) => x.dexId === p.id);
      const c = pet ? battleCondition(tick(pet, now)) : "ok";
      return c === "ok" ? [] : [`${p.name.toUpperCase()} ${CONDITION_NOTE[c]}`];
    })
    .join(" ");
}

const names = (team: readonly Pokemon[]) => team.map((p) => p.name.toUpperCase()).join(", ");

/**
 * BATTLE tab: a menu (single or team battle, record), then your Pokémon (one
 * or a team of three: favorites first, then your Tamagotchi party,
 * searchable), then the opponent (chosen or random), then the arena.
 */
export function BattleScreen({ active, onNotice }: Props) {
  const list = usePokedex((s) => s.list);
  const favorites = useFavorites((s) => s.ids);
  const pets = useTamagotchi((s) => s.pets);
  const party = useMemo(() => pets.flatMap((p) => (p.dexId === null ? [] : [p.dexId])), [pets]);

  const [step, setStep] = useState<Step>("menu");
  const [mode, setMode] = useState<Mode>("single");
  const [playerTeam, setPlayerTeam] = useState<Pokemon[]>([]);
  const [foeTeam, setFoeTeam] = useState<Pokemon[]>([]);
  /** The league leader being challenged, or null for an ordinary battle. */
  const [leader, setLeader] = useState<number | null>(null);
  const beaten = useLeague((s) => s.beaten);
  const size = TEAM_SIZE[mode];

  // Tell the player what to do when entering a step.
  const greeted = useRef<string | null>(null);
  const stepKey = `${step}-${playerTeam.length}-${foeTeam.length}`;
  useEffect(() => {
    if (!active || greeted.current === stepKey) return;
    greeted.current = stepKey;
    if (step === "menu") onNotice("BATTLE! ▲▼ choose   A: OK");
    else if (step === "league") onNotice(beaten >= LEAGUE.length ? "You are the league champion! Fight any leader again." : `Next: LEADER ${LEAGUE[beaten].name}. A: challenge   B: back`);
    else if (step === "player" && size === 1) onNotice("Choose your Pokémon! ★ favorites come first. ▲ on the top row: search.");
    else if (step === "player") {
      onNotice(playerTeam.length ? `Team: ${names(playerTeam)}. Choose #${playerTeam.length + 1}! B: undo` : `Choose ${size} Pokémon for your team! ★ favorites first.`);
    } else if (step === "foeSource") onNotice("Who will you battle? B: back");
    else if (step === "foe") {
      onNotice(size === 1 ? "Now choose your opponent! B: back" : `Choose the foe team (${foeTeam.length + 1}/${size}). B: undo`);
    }
  }, [active, step, stepKey, size, playerTeam, foeTeam, onNotice, beaten]);

  const startBattle = (foes: Pokemon[], team = playerTeam) => {
    setFoeTeam(foes);
    setStep("battle");
    const notes = conditionNotes(team);
    const who = leader !== null ? `LEADER ${LEAGUE[leader].name}` : size === 1 ? foes[0].name.toUpperCase() : `A team of ${names(foes)}`;
    onNotice(`${who} wants to battle!${notes ? ` ${notes}` : ""} A: fight   B: ${leader !== null ? "back" : "new opponent"}`);
    usePokedex.getState().playCry(foes[0].id);
  };

  if (step === "battle" && playerTeam.length === size && foeTeam.length === size) {
    return (
      <BattleArena
        key={`${playerTeam.map((p) => p.id)}-${foeTeam.map((p) => p.id)}`}
        player={playerTeam}
        foe={foeTeam}
        active={active}
        onNotice={onNotice}
        foeTrainer={leader !== null ? `LEADER ${LEAGUE[leader].name}` : undefined}
        onResult={leader !== null ? (won) => leagueResult(leader, won) : undefined}
        onLeave={() => {
          setFoeTeam([]);
          setStep(leader !== null ? "league" : "foeSource");
        }}
      />
    );
  }

  if (step === "league") {
    return (
      <BattleMenu
        key="league"
        title={`LEAGUE · ${beaten}/${LEAGUE.length} BEATEN`}
        options={LEAGUE.map((l, i) => {
          const state = leaderState(i, beaten);
          const team = l.team.map((id) => list.find((p) => p.id === id)?.name.toUpperCase() ?? `#${id}`).join(", ");
          return {
            label: `${state === "beaten" ? "✓" : state === "next" ? "\u00a0" : "·"} ${l.name} · ${l.type.toUpperCase()}`,
            detail: state === "locked" ? `Beat ${LEAGUE[i - 1].name} first.` : `${team}. First win: +${leagueBonus(i)}₽`,
          };
        })}
        active={active}
        onPick={(i) => {
          if (!canChallenge(i, beaten)) return onNotice(`LEADER ${LEAGUE[i].name} only accepts challengers who beat ${LEAGUE[beaten].name}.`);
          setLeader(i);
          setMode("team");
          setPlayerTeam([]);
          setFoeTeam([]);
          setStep("player");
        }}
        onBack={() => (setStep("menu"), true)}
      />
    );
  }

  if (step === "record") {
    return (
      <BattleMenu key="record" title="RECORD" options={[{ label: "BACK" }]} active={active} onPick={() => setStep("menu")} onBack={() => (setStep("menu"), true)}>
        <RecordSummary list={list} />
      </BattleMenu>
    );
  }

  if (step === "foeSource") {
    return (
      <BattleMenu
        key="foeSource"
        title={size === 1 ? `${names(playerTeam)} VS ...?` : `${size} VS ${size}: WHO WILL YOU BATTLE?`}
        options={FOE_SOURCES}
        active={active}
        onPick={(i) => (i === 0 ? setStep("foe") : startBattle(randomPicks(list, size)))}
        onBack={() => {
          setPlayerTeam((t) => t.slice(0, -1));
          setStep("player");
          return true;
        }}
      />
    );
  }

  if (step === "foe") {
    return (
      <PokemonPicker
        key="foe"
        title={size === 1 ? `${names(playerTeam)} VS ...?` : `FOE TEAM ${foeTeam.length + 1}/${size}${foeTeam.length ? ` · ${names(foeTeam)}` : ""}`}
        active={active}
        favorites={favorites}
        onPick={(p) => {
          if (foeTeam.some((f) => f.id === p.id)) return onNotice(`${p.name.toUpperCase()} is already in the foe team!`);
          const foes = [...foeTeam, p];
          if (foes.length < size) {
            setFoeTeam(foes);
            usePokedex.getState().playCry(p.id);
          } else {
            startBattle(foes);
          }
        }}
        onBack={() => {
          if (foeTeam.length) setFoeTeam((t) => t.slice(0, -1));
          else setStep("foeSource");
          return true;
        }}
      />
    );
  }

  if (step === "player") {
    return (
      <PokemonPicker
        key="player"
        title={size === 1 ? "CHOOSE YOUR POKÉMON" : `YOUR TEAM ${playerTeam.length + 1}/${size}${playerTeam.length ? ` · ${names(playerTeam)}` : ""}`}
        active={active}
        favorites={favorites}
        pinned={party}
        onPick={(p) => {
          if (playerTeam.some((f) => f.id === p.id)) return onNotice(`${p.name.toUpperCase()} is already in your team!`);
          const team = [...playerTeam, p];
          setPlayerTeam(team);
          usePokedex.getState().playCry(p.id);
          if (team.length < size) return;
          if (leader === null) return setStep("foeSource");
          const foes = LEAGUE[leader].team.flatMap((id) => list.find((x) => x.id === id) ?? []);
          startBattle(foes, team);
        }}
        onBack={() => {
          if (playerTeam.length) setPlayerTeam((t) => t.slice(0, -1));
          else setStep(leader !== null ? "league" : "menu");
          return true;
        }}
      />
    );
  }

  return (
    <BattleMenu
      key="menu"
      title="BATTLE"
      options={MODES}
      active={active}
      onPick={(i) => {
        const chosen = MODES[i].mode;
        setLeader(null);
        if (!chosen) return setStep(MODES[i].step ?? "menu");
        setMode(chosen);
        setPlayerTeam([]);
        setFoeTeam([]);
        setStep("player");
      }}
      onBack={() => false}
    />
  );
}

/** Records a league battle: a first win against the next leader pays a bonus. */
function leagueResult(index: number, won: boolean): string | null {
  if (!useLeague.getState().result(index, won)) return null;
  const bonus = leagueBonus(index);
  useTamagotchi.getState().reward(bonus);
  const champion = index === LEAGUE.length - 1;
  return `You beat LEADER ${LEAGUE[index].name}! +${bonus}₽${champion ? " You are the LEAGUE CHAMPION!" : ` Next: ${LEAGUE[index + 1].name}.`}`;
}

/** Total wins and losses, and the Pokémon with the most wins. */
function RecordSummary({ list }: { list: readonly Pokemon[] }) {
  const records = useBattleRecord((s) => s.records);
  const entries = Object.entries(records).map(([id, r]) => ({ id: Number(id), ...r }));
  const wins = entries.reduce((n, r) => n + r.wins, 0);
  const losses = entries.reduce((n, r) => n + r.losses, 0);
  const top = [...entries].sort((a, b) => b.wins - a.wins || a.losses - b.losses).slice(0, 4);
  const nameOf = (id: number) => list.find((p) => p.id === id)?.name.toUpperCase() ?? `#${id}`;
  return (
    <div className={styles.record}>
      <div className={styles.recordTotal}>
        <span>WINS {wins}</span>
        <span>LOSSES {losses}</span>
      </div>
      {top.length === 0 ? (
        <p>No battles yet.</p>
      ) : (
        top.map((r) => (
          <div key={r.id} className={styles.recordRow}>
            <span>{nameOf(r.id)}</span>
            <span>
              {r.wins}W {r.losses}L
            </span>
          </div>
        ))
      )}
    </div>
  );
}
