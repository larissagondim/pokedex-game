"use client";

import { useEffect, useState } from "react";
import { playSfx } from "@/lib/sfx";
import { type DevicePhase, useDeviceState } from "@/stores/deviceState";
import { useReducedMotion } from "./useReducedMotion";

export type ScreenPower = "off" | "booting" | "on" | "shutdown";

/** Length of the boot sequence; keep in sync with the CSS in screen.module.css. */
export const BOOT_MS = 1700;

const lit = (p: DevicePhase) => p === "OPEN" || p === "ZOOMING_IN" || p === "ZOOMED" || p === "ZOOMING_OUT";

/**
 * Screen power derived from the device phase: dark until the lid finishes
 * opening, then a retro boot, and a quick power-off when closing.
 */
export function useScreenPower(): ScreenPower {
  const reducedMotion = useReducedMotion();
  const [power, setPower] = useState<ScreenPower>(() => (lit(useDeviceState.getState().phase) ? "on" : "off"));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useDeviceState.subscribe(({ phase }, prev) => {
      if (phase === prev.phase) return;
      if (phase === "CLOSING") {
        clearTimeout(timer);
        setPower("shutdown");
      } else if (!lit(phase)) {
        clearTimeout(timer);
        setPower("off");
      } else if (!lit(prev.phase)) {
        if (reducedMotion) return setPower("on");
        setPower("booting");
        playSfx("boot");
        timer = setTimeout(() => setPower("on"), BOOT_MS);
      }
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [reducedMotion]);

  return power;
}
