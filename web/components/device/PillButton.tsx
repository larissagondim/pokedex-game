"use client";

import { Text } from "@react-three/drei";
import type { DeviceButton } from "@/stores/deviceInput";
import { COLORS } from "./colors";
import { CONTROLS, FONT_URL } from "./layout";
import { ModelPart } from "./ModelPart";
import { PressableButton } from "./PressableButton";

const FLATTEN = 0.45;

export function PillButton({ button, x, y }: { button: DeviceButton; x: number; y: number }) {
  const { radius, length } = CONTROLS.pill;
  const depth = radius * 2 * FLATTEN;
  return (
    <group position={[x, y, 0]}>
      <PressableButton button={button} position={[0, 0, 0]}>
        <ModelPart name={`button_${button.toLowerCase()}`}>
          <mesh rotation={[0, 0, Math.PI / 2]} scale={[1, 1, FLATTEN]} position={[0, 0, depth / 2 + 0.004]}>
            <capsuleGeometry args={[radius, length, 6, 20]} />
            <meshStandardMaterial color={COLORS.graphite} roughness={0.45} />
          </mesh>
        </ModelPart>
      </PressableButton>
      <Text
        font={FONT_URL}
        position={[0, -radius - 0.07, 0.002]}
        fontSize={0.06}
        letterSpacing={0.08}
        color={COLORS.grayLight}
        anchorX="center"
        anchorY="middle"
      >
        {button}
      </Text>
    </group>
  );
}
