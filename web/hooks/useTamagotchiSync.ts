"use client";

import { useEffect } from "react";
import { useTamaSync } from "@/stores/tamaSync";

/** Keeps the Tamagotchi save synced with the server while the page is open. */
export function useTamagotchiSync() {
  useEffect(() => useTamaSync.getState().start(), []);
}
