"use client";

import { useEffect } from "react";
import { getAudioContext, playSfx } from "@/lib/sfx";
import { useAudio } from "@/stores/audio";
import { isDirection, useDeviceInput } from "@/stores/deviceInput";
import { useDeviceState } from "@/stores/deviceState";

/**
 * UI sounds: blips for buttons and open/close sweeps. Audio unlocks on the
 * first user gesture (browser autoplay rules).
 */
export function useSoundEffects() {
  useEffect(() => {
    const unlock = () => {
      getAudioContext().resume();
      useAudio.getState().unlock();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);

    const offInput = useDeviceInput.getState().subscribe((button) => {
      playSfx(isDirection(button) ? "dpad" : button === "A" ? "a" : button === "B" ? "b" : "click");
      return false; // observer only
    }, 1000);

    const offPhase = useDeviceState.subscribe((s, prev) => {
      if (s.phase === prev.phase) return;
      if (s.phase === "OPENING") playSfx("open");
      if (s.phase === "CLOSING") playSfx("close");
    });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      offInput();
      offPhase();
    };
  }, []);
}
