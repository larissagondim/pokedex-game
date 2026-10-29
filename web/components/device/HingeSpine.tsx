"use client";

import { COLORS } from "./colors";
import { SHELL } from "./layout";
import { ModelPart } from "./ModelPart";

/**
 * Fills the gap between the halves along the hinge axis. It's centered on the
 * axis, so it looks the same at any angle and needs no animation.
 */
export function HingeSpine() {
  const radius = SHELL.gap / 2;
  return (
    <group position={[0, 0, SHELL.gap / 2]}>
      <ModelPart name="hinge">
        <mesh>
          <cylinderGeometry args={[radius, radius, SHELL.height - 2 * SHELL.radius, 24]} />
          <meshStandardMaterial color={COLORS.redDark} roughness={0.5} />
        </mesh>
      </ModelPart>
    </group>
  );
}
