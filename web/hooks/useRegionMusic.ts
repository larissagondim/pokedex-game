"use client";

import { useEffect } from "react";
import { duckMusic, setRegionMusic } from "@/lib/music";
import { regionOf } from "@/lib/regions";
import { useAudio } from "@/stores/audio";
import { type DevicePhase, useDeviceState } from "@/stores/deviceState";
import { usePokedex } from "@/stores/pokedex";
import { BOOT_MS } from "./useScreenPower";

const lit = (p: DevicePhase) => p === "OPEN" || p === "ZOOMING_IN" || p === "ZOOMED" || p === "ZOOMING_OUT";

/**
 * Plays the music of the region of the focused Pokémon while the screen is on.
 * Crossing a region boundary (e.g. #151 → #152, Kanto → Johto) crossfades.
 */
export function useRegionMusic() {
  useEffect(() => {
    let bootedAt = Infinity;
    let bootTimer: ReturnType<typeof setTimeout> | undefined;

    const update = () => {
      const { phase } = useDeviceState.getState();
      const { focusedId } = usePokedex.getState();
      const { unlocked, muted, musicOn } = useAudio.getState();
      const playing = lit(phase) && performance.now() >= bootedAt && unlocked && !muted && musicOn;
      setRegionMusic(playing && focusedId ? (regionOf(focusedId)?.id ?? null) : null);
    };

    const offDevice = useDeviceState.subscribe(({ phase }, prev) => {
      if (lit(phase) && !lit(prev.phase)) {
        // Start after the screen's boot jingle.
        bootedAt = performance.now() + BOOT_MS;
        clearTimeout(bootTimer);
        bootTimer = setTimeout(update, BOOT_MS);
      } else if (!lit(phase)) {
        bootedAt = Infinity;
      }
      update();
    });
    const offPokedex = usePokedex.subscribe((s, prev) => {
      if (s.cryRequest !== prev.cryRequest) duckMusic();
      if (s.focusedId !== prev.focusedId) update();
    });
    const offAudio = useAudio.subscribe(update);

    if (lit(useDeviceState.getState().phase)) bootedAt = 0;
    update();

    return () => {
      offDevice();
      offPokedex();
      offAudio();
      clearTimeout(bootTimer);
      setRegionMusic(null);
    };
  }, []);
}
