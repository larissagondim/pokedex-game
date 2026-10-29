"use client";

import { useCursor } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { type ReactNode, useRef, useState } from "react";
import { MathUtils, type Group } from "three";
import { type DeviceButton, useDeviceInput } from "@/stores/deviceInput";
import { CONTROLS } from "./layout";

interface Props {
  button: DeviceButton;
  position: [number, number, number];
  children: ReactNode;
}

/**
 * Makes its children a physical button: pointer down emits the deviceInput
 * event, and the visual sinks whenever the button is pressed (by pointer or
 * keyboard, since both go through the same store).
 */
export function PressableButton({ button, position, children }: Props) {
  const cap = useRef<Group>(null);
  const holding = useRef(false);
  const [hovered, setHovered] = useState(false);
  const pressed = useDeviceInput((s) => s.pressed[button]);
  useCursor(hovered);

  useFrame((_, dt) => {
    if (!cap.current) return;
    const target = pressed ? -CONTROLS.travel : 0;
    cap.current.position.z = MathUtils.damp(cap.current.position.z, target, 40, dt);
  });

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    holding.current = true;
    useDeviceInput.getState().press(button);
  };
  const up = () => {
    if (!holding.current) return;
    holding.current = false;
    useDeviceInput.getState().release(button);
  };

  return (
    <group position={position}>
      <group
        ref={cap}
        onPointerDown={down}
        onPointerUp={(e) => {
          e.stopPropagation();
          up();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => {
          setHovered(false);
          up();
        }}
      >
        {children}
      </group>
    </group>
  );
}
