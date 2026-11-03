"use client";

import { useEffect, useState } from "react";
import { moodOf, tick } from "@/lib/tamagotchi";
import { useTamagotchi } from "@/stores/tamagotchi";

const CHECK_MS = 30_000;

/**
 * True when a party member needs attention (hungry, tired or sad) or an egg
 * is ready to hatch. Needs decay with time, so it's re-checked periodically.
 */
export function useTamagotchiAlert(): boolean {
  const pets = useTamagotchi((s) => s.pets);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CHECK_MS);
    return () => clearInterval(id);
  }, []);

  return pets.some((pet) => {
    if (pet.dexId === null) return pet.hatchAt !== null && pet.hatchAt <= now;
    const mood = moodOf(tick(pet, now));
    return mood === "hungry" || mood === "tired" || mood === "sad";
  });
}
