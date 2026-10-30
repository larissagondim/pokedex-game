"use client";

import { useCursor } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { BUTTON } from "./device.config";
import { ButtonHoverContext } from "./materials";

interface Props {
  button: DeviceButton;
  position?: [number, number, number];
  /** How far the cap sinks when pressed (0 for parts that animate themselves). */
  travel?: number;
  children: ReactNode;
}

/**
 * Makes its children a physical button: pointer down emits the deviceInput
 * event, and the cap sinks whenever the button is pressed (by pointer,
 * keyboard or gamepad, since all go through the same store).
 */
export function PressableButton({ button, position = [0, 0, 0], travel = BUTTON.travel, children }: Props) {
  const cap = useRef<Group>(null);
  const holding = useRef(false);
  const [hovered, setHovered] = useState(false);
  const pressed = useDeviceInput((s) => s.pressed[button]);
  useCursor(hovered);

  useFrame((_, dt) => {
    if (!cap.current || travel === 0) return;
    const target = pressed ? -travel : 0;
    const z = cap.current.position.z;
    const step = (travel / BUTTON.pressS) * dt;
    cap.current.position.z = Math.abs(target - z) <= step ? target : z + Math.sign(target - z) * step;
  });

  const up = () => {
    if (!holding.current) return;
    holding.current = false;
    useDeviceInput.getState().release(button);
  };

  // A pointer released outside the button still ends the press.
  useEffect(() => {
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    holding.current = true;
    navigator.vibrate?.(10);
    useDeviceInput.getState().press(button);
  };

  return (
    <group position={position}>
      <group
        ref={cap}
        onPointerDown={down}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => {
          setHovered(false);
          up();
        }}
      >
        <ButtonHoverContext.Provider value={hovered}>{children}</ButtonHoverContext.Provider>
      </group>
    </group>
  );
}
