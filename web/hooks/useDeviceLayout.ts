"use client";

import { useSyncExternalStore } from "react";

/** Touch screen held in portrait and not too wide: a phone (or small tablet). */
const COMPACT_QUERY = "(pointer: coarse) and (orientation: portrait) and (max-width: 900px)";

/** `?layout=compact` or `?layout=split` forces a layout (handy on desktop). */
function override(): boolean | null {
  const value = new URLSearchParams(window.location.search).get("layout");
  return value === "compact" ? true : value === "split" ? false : null;
}

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(COMPACT_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * True on phones: all controls go next to the screen on one half, the lid
 * opens flat and the camera frames just that half.
 */
export function useCompactLayout() {
  return useSyncExternalStore(
    subscribe,
    () => override() ?? window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );
}
