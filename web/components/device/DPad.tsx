"use client";

import type { DeviceButton } from "@/stores/deviceInput";
import { COLORS } from "./colors";
import { CONTROLS } from "./layout";
import { ModelPart } from "./ModelPart";
import { PressableButton } from "./PressableButton";

const HEIGHT = 0.05;
const WEDGE_DEG = 84;

// `theta` is the cylinder sweep center once rotated to face +z (0 = down);
// `angle` is the screen-space direction used to point the arrow.
const DIRECTIONS: { button: DeviceButton; theta: number; angle: number }[] = [
  { button: "DOWN", theta: 0, angle: -Math.PI / 2 },
  { button: "RIGHT", theta: Math.PI / 2, angle: 0 },
  { button: "UP", theta: Math.PI, angle: Math.PI / 2 },
  { button: "LEFT", theta: (3 * Math.PI) / 2, angle: Math.PI },
];

/** Circular white directional pad, split into four pressable wedges. */
export function DPad() {
  const { x, y, radius } = CONTROLS.dpad;
  const sweep = (WEDGE_DEG * Math.PI) / 180;
  const arrowR = radius * 0.64;

  return (
    <group position={[x, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.008]}>
        <cylinderGeometry args={[radius + 0.03, radius + 0.03, 0.016, 48]} />
        <meshStandardMaterial color={COLORS.graphite} roughness={0.6} />
      </mesh>

      {DIRECTIONS.map(({ button, theta, angle }) => (
        <PressableButton key={button} button={button} position={[0, 0, 0]}>
          <ModelPart name={`dpad_${button.toLowerCase()}`}>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.016 + HEIGHT / 2]}>
              <cylinderGeometry args={[radius, radius, HEIGHT, 24, 1, false, theta - sweep / 2, sweep]} />
              <meshStandardMaterial color={COLORS.white} roughness={0.4} />
            </mesh>
            <mesh
              position={[Math.cos(angle) * arrowR, Math.sin(angle) * arrowR, 0.016 + HEIGHT + 0.001]}
              rotation={[0, 0, angle]}
            >
              <circleGeometry args={[0.045, 3]} />
              <meshBasicMaterial color={COLORS.graphite} />
            </mesh>
          </ModelPart>
        </PressableButton>
      ))}

      <ModelPart name="dpad_center">
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.016 + HEIGHT / 2]}>
          <cylinderGeometry args={[radius * 0.3, radius * 0.3, HEIGHT, 32]} />
          <meshStandardMaterial color={COLORS.white} roughness={0.4} />
        </mesh>
      </ModelPart>
    </group>
  );
}
