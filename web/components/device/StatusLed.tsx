"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { MeshStandardMaterial } from "three";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useDeviceInput } from "@/stores/deviceInput";
import { acceptsInput, isLidOpen, useDeviceState } from "@/stores/deviceState";
import { COLORS, CONTROL_HALF, SECONDARY_CENTER } from "./device.config";
import { ModelPart } from "./ModelPart";

const BLINK_S = 0.36;
const BLINK_HZ = 16;

/** Single status LED: off when closed, white when open, quick blink on A. */
export function StatusLed() {
  const material = useRef<MeshStandardMaterial>(null);
  const blinkUntil = useRef(0);
  const reducedMotion = useReducedMotion();

  useEffect(
    () =>
      // Observer only (very high priority, never consumes).
      useDeviceInput.getState().subscribe((button) => {
        if (button === "A" && acceptsInput(useDeviceState.getState().phase)) {
          blinkUntil.current = performance.now() / 1000 + BLINK_S;
        }
        return false;
      }, 1000),
    [],
  );

  useFrame(({ clock }) => {
    const m = material.current;
    if (!m) return;
    const phase = useDeviceState.getState().phase;
    const lit = isLidOpen(phase) && phase !== "OPENING";
    const now = performance.now() / 1000;
    const blinking = !reducedMotion && now < blinkUntil.current;
    const on = lit && (!blinking || Math.sin(clock.elapsedTime * BLINK_HZ * Math.PI * 2) > 0);
    m.emissiveIntensity = on ? 2.2 : 0;
  });

  const y = SECONDARY_CENTER.y + CONTROL_HALF.secondary.height / 2 + CONTROL_HALF.led.gapAbove;
  const r = CONTROL_HALF.led.diameter / 2;
  return (
    <group position={[SECONDARY_CENTER.x, y, 0]}>
      <ModelPart name="status_led">
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]}>
          <cylinderGeometry args={[r, r, 0.04, 24]} />
          <meshStandardMaterial ref={material} color={COLORS.gray} emissive={COLORS.white} emissiveIntensity={0} roughness={0.2} />
        </mesh>
      </ModelPart>
    </group>
  );
}
