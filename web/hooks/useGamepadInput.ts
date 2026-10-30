"use client";

import { useEffect } from "react";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";

/** Standard-mapping button indices (https://w3c.github.io/gamepad/#remapping). */
const BUTTON_MAP: [number, DeviceButton][] = [
  [12, "UP"],
  [13, "DOWN"],
  [14, "LEFT"],
  [15, "RIGHT"],
  [0, "A"],
  [1, "B"],
  [9, "MENU"], // Start
  [8, "ZOOM"], // Select
  [3, "ZOOM"], // Y / triangle
];

const STICK_THRESHOLD = 0.6;

/** Polls connected gamepads and forwards edges to the deviceInput store. */
export function useGamepadInput() {
  useEffect(() => {
    if (!("getGamepads" in navigator)) return;
    const { press, release } = useDeviceInput.getState();
    const down = new Set<DeviceButton>();
    let frame = 0;

    const poll = () => {
      frame = requestAnimationFrame(poll);
      const now = new Set<DeviceButton>();
      for (const pad of navigator.getGamepads()) {
        if (!pad) continue;
        for (const [index, button] of BUTTON_MAP) {
          if (pad.buttons[index]?.pressed) now.add(button);
        }
        const [x = 0, y = 0] = pad.axes;
        if (y < -STICK_THRESHOLD) now.add("UP");
        if (y > STICK_THRESHOLD) now.add("DOWN");
        if (x < -STICK_THRESHOLD) now.add("LEFT");
        if (x > STICK_THRESHOLD) now.add("RIGHT");
      }
      for (const b of now) if (!down.has(b)) press(b);
      for (const b of down) if (!now.has(b)) release(b);
      down.clear();
      now.forEach((b) => down.add(b));
    };

    // Only poll while a pad is connected.
    const start = () => {
      if (!frame) poll();
    };
    const stop = () => {
      if (navigator.getGamepads().some(Boolean)) return;
      cancelAnimationFrame(frame);
      frame = 0;
      down.forEach(release);
      down.clear();
    };
    window.addEventListener("gamepadconnected", start);
    window.addEventListener("gamepaddisconnected", stop);
    if (navigator.getGamepads().some(Boolean)) start();
    return () => {
      window.removeEventListener("gamepadconnected", start);
      window.removeEventListener("gamepaddisconnected", stop);
      cancelAnimationFrame(frame);
    };
  }, []);
}
