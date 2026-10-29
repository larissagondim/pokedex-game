"use client";

import { useEffect } from "react";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { useDeviceState } from "@/stores/deviceState";

const KEY_MAP: Record<string, DeviceButton> = {
  ArrowUp: "UP",
  ArrowDown: "DOWN",
  ArrowLeft: "LEFT",
  ArrowRight: "RIGHT",
  z: "A",
  x: "B",
  Enter: "MENU",
  " ": "ZOOM",
};

const REPEATABLE: DeviceButton[] = ["UP", "DOWN", "LEFT", "RIGHT"];

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** Maps the keyboard onto the same events the 3D buttons emit. */
export function useKeyboardInput() {
  useEffect(() => {
    const { press, release } = useDeviceInput.getState();
    const lookup = (e: KeyboardEvent) =>
      KEY_MAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "Escape") {
        useDeviceState.getState().setZoomed(false);
        return;
      }
      const button = lookup(e);
      if (!button) return;
      e.preventDefault();
      if (e.repeat && !REPEATABLE.includes(button)) return;
      press(button);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const button = lookup(e);
      if (button) release(button);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
