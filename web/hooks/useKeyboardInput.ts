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

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** Space/Enter on a focused page button should click it, not press ZOOM/MENU. */
const isActivatingControl = (e: KeyboardEvent) =>
  (e.key === " " || e.key === "Enter") &&
  e.target instanceof HTMLElement &&
  ["BUTTON", "A"].includes(e.target.tagName);

/**
 * Maps the keyboard onto the same events the 3D buttons emit. OS key repeat
 * is ignored: the store repeats held directions itself.
 */
export function useKeyboardInput() {
  useEffect(() => {
    const { press, release } = useDeviceInput.getState();
    const lookup = (e: KeyboardEvent) => KEY_MAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || isActivatingControl(e)) return;
      if (e.key === "Escape") {
        useDeviceState.getState().zoomOut();
        return;
      }
      const button = lookup(e);
      if (!button) return;
      e.preventDefault();
      if (!e.repeat) press(button);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const button = lookup(e);
      if (button) release(button);
    };

    // Don't leave buttons stuck down when the window loses focus.
    const releaseAll = () => Object.values(KEY_MAP).forEach(release);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
    };
  }, []);
}
