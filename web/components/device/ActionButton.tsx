"use client";

import { Text } from "@react-three/drei";
import type { DeviceButton } from "@/stores/deviceInput";
import { COLORS, FONT_URL, CONTROL_HALF } from "./device.config";
import { ButtonMaterial } from "./materials";
import { ModelPart } from "./ModelPart";
import { PressableButton } from "./PressableButton";

interface Props {
  button: Extract<DeviceButton, "A" | "B">;
  x: number;
  y: number;
}

const STYLE = {
  A: { color: COLORS.graphite, label: COLORS.white },
  B: { color: COLORS.white, label: COLORS.graphite },
};

/** Round A/B button: cylinder with a pixel letter on top. */
export function ActionButton({ button, x, y }: Props) {
  const { diameter, height } = CONTROL_HALF.action;
  const r = diameter / 2;
  const { color, label } = STYLE[button];

  return (
    <group position={[x, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.01]}>
        <cylinderGeometry args={[r + 0.06, r + 0.06, 0.02, 48]} />
        <meshStandardMaterial color={COLORS.redDark} roughness={0.5} />
      </mesh>
      <PressableButton button={button}>
        <ModelPart name={`button_${button.toLowerCase()}`}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, height / 2]} castShadow>
            <cylinderGeometry args={[r, r, height, 48]} />
            <ButtonMaterial color={color} roughness={0.8} />
          </mesh>
          <Text font={FONT_URL} position={[0, 0, height + 0.002]} fontSize={0.5} color={label} anchorX="center" anchorY="middle">
            {button}
          </Text>
        </ModelPart>
      </PressableButton>
    </group>
  );
}
