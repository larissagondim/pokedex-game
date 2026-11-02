"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDexNumber, type Pokemon } from "@/data/pokedex";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { preBattleSnapshot, predictWin } from "@/lib/winPrediction";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { usePokedex } from "@/stores/pokedex";
import { useFavorites } from "@/stores/favorites";
import { useTamagotchi } from "@/stores/tamagotchi";
import styles from "./battle.module.css";
import { terrainFor } from "./battleTerrain";
import { PokemonPicker } from "./PokemonPicker";

/** Above the main screen handler (10), like the Tamagotchi tab. */
const INPUT_PRIORITY = 11;
/** The pre-battle model was trained on level-50 battles. */
const LEVEL = 50;

interface Props {
  /** The tab is visible and the screen accepts input. */
  active: boolean;
  onNotice: (text: string) => void;
}

type Step = "player" | "foe" | "scene";

/**
 * BATTLE tab, before the fight: choose your Pokémon, then the opponent
 * (favorites first, searchable), then see both on a backdrop from the
 * opponent's type with the model's win chance. Starting the fight is where
 * the battle engine will plug in.
 */
export function BattleScreen({ active, onNotice }: Props) {
  const list = usePokedex((s) => s.list);
  const favorites = useFavorites((s) => s.ids);
  const pets = useTamagotchi((s) => s.pets);
  const party = useMemo(() => pets.flatMap((p) => (p.dexId === null ? [] : [p.dexId])), [pets]);

  const [step, setStep] = useState<Step>("player");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [foeId, setFoeId] = useState<number | null>(null);
  const [chance, setChance] = useState<{ key: string; value: number | null } | null>(null);

  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const player = playerId ? byId.get(playerId) : undefined;
  const foe = foeId ? byId.get(foeId) : undefined;

  // Tell the player what to do at each step.
  const greeted = useRef<Step | null>(null);
  useEffect(() => {
    if (!active || greeted.current === step) return;
    greeted.current = step;
    if (step === "player") onNotice("Choose your Pokémon! ★ favorites come first. ▲ on the top row: search.");
    else if (step === "foe") onNotice("Now choose your opponent! B: change your Pokémon.");
  }, [active, step, onNotice]);

  // Pre-battle win chance from the model (in the browser, or the API if configured).
  const key = `${playerId}-${foeId}`;
  useEffect(() => {
    if (step !== "scene" || !playerId || !foeId) return;
    const controller = new AbortController();
    preBattleSnapshot(playerId, foeId)
      .then((snapshot) => (snapshot ? predictWin(snapshot, controller.signal) : null))
      .then((p) => setChance({ key, value: p?.probability ?? null }))
      .catch(() => setChance({ key, value: null }));
    return () => controller.abort();
  }, [step, key, playerId, foeId]);
  const probability = chance?.key === key ? chance.value : undefined;

  // In the scene, the secondary screen and the music follow the opponent.
  useEffect(() => {
    if (active && step === "scene" && foeId) usePokedex.getState().focus(foeId);
  }, [active, step, foeId]);

  const handleScene = (button: DeviceButton): boolean => {
    if (button === "A" && player && foe) {
      onNotice(`${player.name.toUpperCase()} vs ${foe.name.toUpperCase()}! The battle itself is coming soon.`);
      usePokedex.getState().playCry(player.id);
      return true;
    }
    if (button === "B") {
      setStep("foe");
      return true;
    }
    return button !== "MENU" && button !== "ZOOM"; // swallow the D-pad here
  };

  const handler = useRef(handleScene);
  const sceneActive = useRef(false);
  useEffect(() => {
    handler.current = handleScene;
    sceneActive.current = active && step === "scene";
  });
  useEffect(
    () => useDeviceInput.getState().subscribe((button) => sceneActive.current && handler.current(button), INPUT_PRIORITY),
    [],
  );

  if (step === "player") {
    return (
      <PokemonPicker
        key="player"
        title="CHOOSE YOUR POKÉMON"
        active={active}
        favorites={favorites}
        pinned={party}
        onPick={(p) => {
          setPlayerId(p.id);
          setStep("foe");
          usePokedex.getState().playCry(p.id);
        }}
        onBack={() => false}
      />
    );
  }
  if (step === "foe") {
    return (
      <PokemonPicker
        key="foe"
        title={`${player?.name.toUpperCase() ?? ""} VS ...?`}
        active={active}
        favorites={favorites}
        onPick={(p) => {
          setFoeId(p.id);
          setStep("scene");
          onNotice(`${p.name.toUpperCase()} wants to battle! A: fight   B: change opponent`);
          usePokedex.getState().playCry(p.id);
        }}
        onBack={() => {
          setStep("player");
          return true;
        }}
      />
    );
  }

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

      <WinChance probability={probability} />
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
