"use client";

import { Text } from "@react-three/drei";
import type { DeviceButton } from "@/stores/deviceInput";
import { useRoundedSlab } from "./geometry";
import { COLORS, FONT_URL, CONTROL_HALF } from "./device.config";
import { ButtonMaterial } from "./materials";
import { ModelPart } from "./ModelPart";
import { PressableButton } from "./PressableButton";

/** Dark red pill button with a white pixel label. */
export function PillButton({ button, x, y }: { button: Extract<DeviceButton, "MENU" | "ZOOM">; x: number; y: number }) {
  const { width, height, depth } = CONTROL_HALF.pill;
  const pill = useRoundedSlab(width, height, depth, height / 2, 0.03);

  return (
    <group position={[x, y, 0]}>
      <PressableButton button={button}>
        <ModelPart name={`button_${button.toLowerCase()}`}>
          <mesh geometry={pill} position={[0, 0, depth / 2]} castShadow>
            <ButtonMaterial color={COLORS.redDark} roughness={0.5} />
          </mesh>
          <Text font={FONT_URL} position={[0, 0, depth + 0.002]} fontSize={0.24} letterSpacing={0.08} color={COLORS.white} anchorX="center" anchorY="middle">
            {button}
          </Text>
        </ModelPart>
      </PressableButton>
    </group>
  );
}
