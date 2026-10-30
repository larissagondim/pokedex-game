"use client";

import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useState } from "react";
import { isLidOpen, useDeviceState } from "@/stores/deviceState";
import { BODY, GAP, HINGE, INPUT } from "./device.config";
import { Graphite } from "./materials";
import { ModelPart } from "./ModelPart";

/**
 * Two short knuckles on the pivot axis, tucked into the rounded corners at the
 * top and bottom of the seam; the rest of the hinge stays hidden. Centered on
 * the axis, they look the same at any angle. Clicking them closes the device.
 */
export function Hinge() {
  const open = useDeviceState((s) => isLidOpen(s.phase));
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && open);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > INPUT.dragTolerancePx || !open) return;
    e.stopPropagation();
    useDeviceState.getState().close();
  };

  const radius = HINGE.diameter / 2;
  const knuckleY = BODY.height / 2 - HINGE.endInset - HINGE.knuckleLength / 2;
  return (
    <group
      position={[0, 0, GAP / 2]}
      onClick={onClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <ModelPart name="hinge">
        {[1, -1].map((side) => (
          <mesh key={side} position={[0, side * knuckleY, 0]} castShadow>
            <cylinderGeometry args={[radius, radius, HINGE.knuckleLength, 32]} />
            <Graphite roughness={0.5} />
          </mesh>
        ))}
      </ModelPart>
    </group>
  );
}
