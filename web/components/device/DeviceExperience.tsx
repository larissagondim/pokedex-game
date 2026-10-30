"use client";

import dynamic from "next/dynamic";
import type { MouseEvent } from "react";
import { formatDexNumber } from "@/data/pokedex";
import { regionOf } from "@/lib/regions";
import { useDeviceController } from "@/hooks/useDeviceController";
import { useGamepadInput } from "@/hooks/useGamepadInput";
import { useKeyboardInput } from "@/hooks/useKeyboardInput";
import { useRegionMusic } from "@/hooks/useRegionMusic";
import { useSoundEffects } from "@/hooks/useSoundEffects";
import { useAudio } from "@/stores/audio";
import { isLidOpen, isZoomedIn, useDeviceState } from "@/stores/deviceState";
import { usePokedex } from "@/stores/pokedex";
import styles from "./experience.module.css";

const DeviceScene = dynamic(() => import("./DeviceScene"), {
  ssr: false,
  loading: () => (
    <div className={styles.fallback} role="status">
      <div className={styles.fallbackDevice} />
      <p>Loading Pokédex…</p>
    </div>
  ),
});

/**
 * After a mouse/touch click, drop focus from the page button so Enter (MENU)
 * and Space (ZOOM) go to the device instead of clicking it again. Keyboard
 * activation (detail === 0) keeps focus for keyboard users.
 */
const releaseFocus = (e: MouseEvent<HTMLButtonElement>) => {
  if (e.detail > 0) e.currentTarget.blur();
};

/** Client entry: lazy 3D scene, input wiring and the page-level controls. */
export function DeviceExperience() {
  useKeyboardInput();
  useGamepadInput();
  useDeviceController();
  useSoundEffects();
  useRegionMusic();

  const phase = useDeviceState((s) => s.phase);
  const open = isLidOpen(phase);
  const zoomed = isZoomedIn(phase);
  const { toggle, toggleZoom, resetView } = useDeviceState.getState();
  const muted = useAudio((s) => s.muted);
  const unlocked = useAudio((s) => s.unlocked);
  const musicOn = useAudio((s) => s.musicOn);
  const focused = usePokedex((s) => s.list.find((p) => p.id === s.focusedId));

  return (
    <div className={styles.root}>
      <DeviceScene />

      <div className={styles.corner}>
        {zoomed && (
          <button type="button" onMouseUp={releaseFocus} onClick={toggleZoom}>
            Leave zoom
          </button>
        )}
        <button type="button" onMouseUp={releaseFocus} onClick={resetView}>
          Reset view
        </button>
        <button type="button" onMouseUp={releaseFocus} onClick={useAudio.getState().toggleMute} aria-pressed={!muted}>
          {muted || !unlocked ? "Sound: off" : "Sound: on"}
        </button>
        <button type="button" onMouseUp={releaseFocus} onClick={useAudio.getState().toggleMusic} aria-pressed={musicOn}>
          {musicOn ? `♪ Music: ${(focused && regionOf(focused.id)?.name) ?? "on"}` : "♪ Music: off"}
        </button>
      </div>

      {/* Zoomed in, the screen fills the window: only the corner buttons stay. */}
      <div className={styles.hud} hidden={zoomed}>
        <p className={styles.hint}>
          {zoomed
            ? "ESC, ZOOM or B to leave zoom"
            : open
              ? "Drag to rotate · double-click the screen to zoom · click the hinge to close"
              : "Click the cover to open"}
        </p>
        <div className={styles.actions}>
          <button type="button" onMouseUp={releaseFocus} onClick={toggle}>
            {open ? "Close device" : "Open device"}
          </button>
          <button type="button" onMouseUp={releaseFocus} onClick={toggleZoom} disabled={!open}>
            {zoomed ? "Leave zoom" : "Zoom into screen"}
          </button>
        </div>
        <p className={styles.keys}>Arrows: D-pad · Z: A · X: B · Enter: MENU · Space: ZOOM · Esc: leave zoom · /: search</p>
      </div>

      {/* The secondary screen is WebGL text; mirror it for screen readers. */}
      <p className={styles.srOnly} aria-live="polite">
        {open && focused ? `${formatDexNumber(focused.id)} ${focused.name}` : ""}
      </p>
    </div>
  );
}
