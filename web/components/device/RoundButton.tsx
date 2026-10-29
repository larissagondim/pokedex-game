"use client";

import { Text } from "@react-three/drei";
import type { DeviceButton } from "@/stores/deviceInput";
import { COLORS } from "./colors";
import { FONT_URL } from "./layout";
import { ModelPart } from "./ModelPart";
import { PressableButton } from "./PressableButton";

interface Props {
  button: DeviceButton;
  x: number;
  y: number;
  radius: number;
  color: string;
  labelColor: string;
}

const HEIGHT = 0.06;

export function RoundButton({ button, x, y, radius, color, labelColor }: Props) {
  return (
    <group position={[x, y, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.006]}>
        <cylinderGeometry args={[radius + 0.02, radius + 0.02, 0.012, 40]} />
        <meshStandardMaterial color={COLORS.redDark} roughness={0.6} />
      </mesh>
      <PressableButton button={button} position={[0, 0, 0]}>
        <ModelPart name={`button_${button.toLowerCase()}`}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.012 + HEIGHT / 2]}>
            <cylinderGeometry args={[radius, radius, HEIGHT, 40]} />
            <meshStandardMaterial color={color} roughness={0.35} />
          </mesh>
          <Text
            font={FONT_URL}
            position={[0, 0, 0.012 + HEIGHT + 0.001]}
            fontSize={radius * 1.1}
            color={labelColor}
            anchorX="center"
            anchorY="middle"
          >
            {button}
          </Text>
        </ModelPart>
      </PressableButton>
    </group>
  );
}
