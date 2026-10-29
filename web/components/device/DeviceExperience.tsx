"use client";

import dynamic from "next/dynamic";
import { useDeviceController } from "@/hooks/useDeviceController";
import { useKeyboardInput } from "@/hooks/useKeyboardInput";
import { useDeviceState } from "@/stores/deviceState";
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

/** Client entry: lazy 3D scene plus input wiring and a small help overlay. */
export function DeviceExperience() {
  useKeyboardInput();
  useDeviceController();
  const open = useDeviceState((s) => s.open);
  const zoomed = useDeviceState((s) => s.zoomed);
  const { toggleOpen, setZoomed } = useDeviceState.getState();

  return (
    <div className={styles.root}>
      <DeviceScene />
      <div className={styles.hud}>
        <p className={styles.hint}>
          {zoomed
            ? "ESC ou B para sair do zoom"
            : open
              ? "Arraste para girar · duplo clique na tela para zoom"
              : "Clique na capa para abrir"}
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={toggleOpen}>
            {open ? "Fechar" : "Abrir"}
          </button>
          <button type="button" onClick={() => setZoomed(!zoomed)}>
            {zoomed ? "Sair do zoom" : "Zoom"}
          </button>
        </div>
        <p className={styles.keys}>
          Setas: direcional · Z: A · X: B · Enter: MENU · Espaço: ZOOM
        </p>
      </div>
    </div>
  );
}
