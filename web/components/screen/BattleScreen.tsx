"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDexNumber, type Pokemon } from "@/data/pokedex";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { preBattleSnapshot, predictWin } from "@/lib/winPrediction";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { usePokedex } from "@/stores/pokedex";
import { useTamagotchi } from "@/stores/tamagotchi";
import styles from "./battle.module.css";
import { terrainFor } from "./battleTerrain";

/** Above the main screen handler (10), like the Tamagotchi tab. */
const INPUT_PRIORITY = 11;
/** The pre-battle model was trained on level-50 battles. */
const LEVEL = 50;

interface Props {
  /** The tab is visible and the screen accepts input. */
  active: boolean;
  onNotice: (text: string) => void;
}

const wrap = (i: number, n: number) => (n ? (i + n) % n : 0);

/**
 * BATTLE tab, before the fight: your Pokémon (back view) against a wild one,
 * a backdrop from the opponent's type, and the model's win chance.
 * Starting the fight is where the battle engine will plug in.
 */
export function BattleScreen({ active, onNotice }: Props) {
  const list = usePokedex((s) => s.list);
  const focusedId = usePokedex((s) => s.focusedId);
  const pets = useTamagotchi((s) => s.pets);

  // Your side: your Tamagotchi party if you have one, otherwise the whole Pokédex.
  const party = useMemo(() => pets.flatMap((p) => (p.dexId === null ? [] : [p.dexId])), [pets]);
  const candidates = party.length ? party : list.map((p) => p.id);
  const [playerIndex, setPlayerIndex] = useState(() => {
    const i = list.findIndex((p) => p.id === focusedId);
    return i >= 0 && !party.length ? i : 0;
  });
  const playerId = candidates[Math.min(playerIndex, candidates.length - 1)];
  const [foeId, setFoeId] = useState<number | null>(null);
  const [chance, setChance] = useState<{ key: string; value: number | null } | null>(null);

  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const player = playerId ? byId.get(playerId) : undefined;
  const foe = foeId ? byId.get(foeId) : undefined;

  const newFoe = () => {
    if (!list.length) return;
    const next = list[Math.floor(Math.random() * list.length)];
    setFoeId(next.id);
    onNotice(`A wild ${next.name.toUpperCase()} appeared!`);
    usePokedex.getState().playCry(next.id);
  };

  // First opponent once the Pokédex is loaded.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !list.length) return;
    started.current = true;
    setFoeId(list[Math.floor(Math.random() * list.length)].id);
  }, [list]);

  // Pre-battle win chance from the model (in the browser, or the API if configured).
  const key = `${playerId}-${foeId}`;
  useEffect(() => {
    if (!playerId || !foeId) return;
    const controller = new AbortController();
    preBattleSnapshot(playerId, foeId)
      .then((snapshot) => (snapshot ? predictWin(snapshot, controller.signal) : null))
      .then((p) => setChance({ key, value: p?.probability ?? null }))
      .catch(() => setChance({ key, value: null }));
    return () => controller.abort();
  }, [key, playerId, foeId]);
  const probability = chance?.key === key ? chance.value : undefined;

  // The secondary screen and the music follow the opponent.
  useEffect(() => {
    if (active && foeId) usePokedex.getState().focus(foeId);
  }, [active, foeId]);

  const handle = (button: DeviceButton): boolean => {
    switch (button) {
      case "LEFT":
      case "RIGHT":
        setPlayerIndex((i) => wrap(i + (button === "LEFT" ? -1 : 1), candidates.length));
        return true;
      case "UP":
      case "DOWN":
        newFoe();
        return true;
      case "A":
        if (player && foe) {
          onNotice(`${player.name.toUpperCase()} vs ${foe.name.toUpperCase()}! The battle itself is coming soon.`);
          usePokedex.getState().playCry(player.id);
        }
        return true;
    }
    return false; // B, MENU and ZOOM go to the screen / device
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

  return (
    <div className={styles.scene} data-terrain={terrainFor(foe?.types)}>
      <div className={styles.backdrop} aria-hidden />

      {foe && (
        <>
          <StatusBox pokemon={foe} side="foe" />
          <span className={styles.platform} data-side="foe" aria-hidden />
          <Sprite pokemon={foe} side="foe" />
        </>
      )}
      {player && (
        <>
          <StatusBox pokemon={player} side="player" />
          <span className={styles.platform} data-side="player" aria-hidden />
          <Sprite pokemon={player} side="player" />
        </>
      )}

      <WinChance probability={probability} hasParty={party.length > 0} />
    </div>
  );
}

function Sprite({ pokemon, side }: { pokemon: Pokemon; side: "player" | "foe" }) {
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState<string | null>(null);
  const gif = side === "foe" ? pokemon.animated : pokemon.animatedBack;
  const still = side === "foe" ? `/sprites/${pokemon.id}.png` : `/sprites/back/${pokemon.id}.png`;
  const src = gif && !reducedMotion && failed !== gif ? gif : still;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`${side}-${pokemon.id}`}
      className={styles.sprite}
      data-side={side}
      src={src}
      alt={pokemon.name}
      draggable={false}
      onError={() => gif && setFailed(gif)}
    />
  );
}

function StatusBox({ pokemon, side }: { pokemon: Pokemon; side: "player" | "foe" }) {
  return (
    <div className={styles.status} data-side={side}>
      <div className={styles.statusName}>
        <span>{pokemon.name.toUpperCase()}</span>
        <span>Lv{LEVEL}</span>
      </div>
      <div className={styles.hp}>
        <span>HP</span>
        <div className={styles.hpTrack}>
          <div className={styles.hpFill} />
        </div>
      </div>
      {side === "player" && <div className={styles.dexNo}>{formatDexNumber(pokemon.id)}</div>}
    </div>
  );
}

function WinChance({ probability, hasParty }: { probability: number | null | undefined; hasParty: boolean }) {
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
      <div className={styles.chanceHint}>{hasParty ? "◀▶ your party" : "◀▶ your Pokémon"} · ▲▼ new foe · A: fight</div>
    </div>
  );
}
