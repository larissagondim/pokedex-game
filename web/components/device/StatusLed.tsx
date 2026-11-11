"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Color, type MeshStandardMaterial } from "three";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTamagotchiAlert } from "@/hooks/useTamagotchiAlert";
import { useDeviceInput } from "@/stores/deviceInput";
import { acceptsInput, isLidOpen, useDeviceState } from "@/stores/deviceState";
import { BATTLE_TAB, TAMAGOTCHI_TAB, useScreen } from "@/stores/screen";
import { COLORS, CONTROL_HALF, SECONDARY_CENTER } from "./device.config";
import { Graphite } from "./materials";
import { ModelPart } from "./ModelPart";

const WHITE = new Color(COLORS.ledWhite);
const BATTLE = new Color(COLORS.ledBattle);
const ALERT = new Color(COLORS.ledAlert);

/**
 * Status LED in a dark ring. Open: white, a quick blink on A, red pulse on
 * the BATTLE tab. A Tamagotchi that needs attention makes it pulse amber
 * (even with the device closed) unless that tab is already showing.
 * Reduced motion: steady colors, no blinking or pulsing.
 */
export function StatusLed() {
  const material = useRef<MeshStandardMaterial>(null);
  const blinkUntil = useRef(0);
  const reducedMotion = useReducedMotion();
  const needsCare = useTamagotchiAlert();
  const alert = useRef(false);
  const led = CONTROL_HALF.led;

  useEffect(() => {
    alert.current = needsCare;
  }, [needsCare]);

  useEffect(
    () =>
      // Observer only (very high priority, never consumes).
      useDeviceInput.getState().subscribe((button) => {
        if (button === "A" && acceptsInput(useDeviceState.getState().phase)) {
          blinkUntil.current = performance.now() / 1000 + led.blinkS;
        }
        return false;
      }, 1000),
    [led.blinkS],
  );

  useFrame(({ clock }) => {
    const m = material.current;
    if (!m) return;
    const phase = useDeviceState.getState().phase;
    const tab = useScreen.getState().tab;
    const lit = isLidOpen(phase) && phase !== "OPENING";
    const t = clock.elapsedTime;
    // 0..1 sine pulse that never goes fully dark.
    const pulse = (hz: number) => (reducedMotion ? 1 : led.pulseFloor + (1 - led.pulseFloor) * (0.5 + 0.5 * Math.sin(t * hz * Math.PI * 2)));

    let color = WHITE;
    let level = 0;
    if (alert.current && !(lit && tab === TAMAGOTCHI_TAB)) {
      color = ALERT;
      level = pulse(led.pulseHz);
    } else if (lit && tab === BATTLE_TAB) {
      color = BATTLE;
      level = pulse(led.battleHz);
    } else if (lit) {
      const blinking = !reducedMotion && performance.now() / 1000 < blinkUntil.current;
      level = !blinking || Math.sin(t * led.blinkHz * Math.PI * 2) > 0 ? 1 : 0;
    }
    m.emissive.copy(color);
    m.emissiveIntensity = level * led.intensity;
  });

  const y = SECONDARY_CENTER.y + CONTROL_HALF.secondary.height / 2 + led.gapAbove;
  const r = led.diameter / 2;
  return (
    <group position={[SECONDARY_CENTER.x, y, 0]}>
      <ModelPart name="status_led">
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, led.bezelHeight / 2]}>
          <cylinderGeometry args={[r + led.bezel, r + led.bezel, led.bezelHeight, 32]} />
          <Graphite roughness={0.6} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.025]}>
          <cylinderGeometry args={[r, r, 0.04, 24]} />
          <meshStandardMaterial ref={material} color={COLORS.gray} emissive={COLORS.ledWhite} emissiveIntensity={0} roughness={0.2} />
        </mesh>
      </ModelPart>
    </group>
  );
}
