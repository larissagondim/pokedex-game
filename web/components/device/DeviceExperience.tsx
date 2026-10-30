"use client";

import dynamic from "next/dynamic";
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
      <p>Carregando Pokédex…</p>
    </div>
  ),
});

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
        <button type="button" onClick={resetView}>
          Resetar visão
        </button>
        <button type="button" onClick={useAudio.getState().toggleMute} aria-pressed={!muted}>
          {muted || !unlocked ? "Som: desligado" : "Som: ligado"}
        </button>
        <button type="button" onClick={useAudio.getState().toggleMusic} aria-pressed={musicOn}>
          {musicOn ? `♪ Música: ${(focused && regionOf(focused.id)?.name) ?? "ligada"}` : "♪ Música: desligada"}
        </button>
      </div>

      <div className={styles.hud}>
        <p className={styles.hint}>
          {zoomed
            ? "ESC, ZOOM ou B para sair do zoom"
            : open
              ? "Arraste para girar · duplo clique na tela para zoom · clique na dobradiça para fechar"
              : "Clique na capa para abrir"}
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={toggle}>
            {open ? "Fechar dispositivo" : "Abrir dispositivo"}
          </button>
          <button type="button" onClick={toggleZoom} disabled={!open}>
            {zoomed ? "Sair do zoom" : "Zoom na tela"}
          </button>
        </div>
        <p className={styles.keys}>Setas: direcional · Z: A · X: B · Enter: MENU · Espaço: ZOOM · Esc: sair do zoom</p>
      </div>

      {/* The secondary screen is WebGL text; mirror it for screen readers. */}
      <p className={styles.srOnly} aria-live="polite">
        {open && focused ? `${formatDexNumber(focused.id)} ${focused.name}` : ""}
      </p>
    </div>
  );
}
