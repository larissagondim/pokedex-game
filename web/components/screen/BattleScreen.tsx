"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePokedex } from "@/stores/pokedex";
import { useFavorites } from "@/stores/favorites";
import { useTamagotchi } from "@/stores/tamagotchi";
import { BattleArena } from "./BattleArena";
import { PokemonPicker } from "./PokemonPicker";

interface Props {
  /** The tab is visible and the screen accepts input. */
  active: boolean;
  onNotice: (text: string) => void;
}

type Step = "player" | "foe" | "battle";

/**
 * BATTLE tab: choose your Pokémon, then the opponent (favorites first,
 * searchable), then fight in the arena.
 */
export function BattleScreen({ active, onNotice }: Props) {
  const list = usePokedex((s) => s.list);
  const favorites = useFavorites((s) => s.ids);
  const pets = useTamagotchi((s) => s.pets);
  const party = useMemo(() => pets.flatMap((p) => (p.dexId === null ? [] : [p.dexId])), [pets]);

  const [step, setStep] = useState<Step>("player");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [foeId, setFoeId] = useState<number | null>(null);
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const player = playerId ? byId.get(playerId) : undefined;
  const foe = foeId ? byId.get(foeId) : undefined;

  // Tell the player what to do when entering a picker.
  const greeted = useRef<Step | null>(null);
  useEffect(() => {
    if (!active || greeted.current === step) return;
    greeted.current = step;
    if (step === "player") onNotice("Choose your Pokémon! ★ favorites come first. ▲ on the top row: search.");
    else if (step === "foe") onNotice("Now choose your opponent! B: change your Pokémon.");
  }, [active, step, onNotice]);

  if (step === "battle" && player && foe) {
    return (
      <BattleArena
        key={`${player.id}-${foe.id}`}
        player={player}
        foe={foe}
        active={active}
        onNotice={onNotice}
        onLeave={() => setStep("foe")}
      />
    );
  }
  if (step === "foe" && player) {
    return (
      <PokemonPicker
        key="foe"
        title={`${player.name.toUpperCase()} VS ...?`}
        active={active}
        favorites={favorites}
        onPick={(p) => {
          setFoeId(p.id);
          setStep("battle");
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
