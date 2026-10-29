"use client";

import { Text } from "@react-three/drei";
import { COLORS } from "./colors";
import { useRoundedSlab } from "./geometry";
import { FONT_URL, SHELL } from "./layout";
import { ModelPart } from "./ModelPart";

const LEDS = [COLORS.ledRed, COLORS.ledYellow, COLORS.ledGreen];

/**
 * Outer face of the left half. Its frame is turned to face outward, so when the
 * device is closed +x points right and +z points at the viewer.
 */
export function Cover() {
  const band = useRoundedSlab(SHELL.width - 0.14, 0.34, 0.02, 0.06, 0.006);

  return (
    <group position={[-SHELL.width / 2, 0, -SHELL.depth]} rotation={[0, Math.PI, 0]} userData={{ part: "cover" }}>
      <ModelPart name="cover">
        {/* Lens */}
        <group position={[-0.36, 0.74, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.012]}>
            <cylinderGeometry args={[0.2, 0.2, 0.024, 40]} />
            <meshStandardMaterial color={COLORS.white} roughness={0.35} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.018]}>
            <cylinderGeometry args={[0.155, 0.155, 0.024, 40]} />
            <meshStandardMaterial color={COLORS.lens} emissive={COLORS.lens} emissiveIntensity={0.35} roughness={0.15} />
          </mesh>
          <mesh position={[-0.05, 0.05, 0.031]}>
            <circleGeometry args={[0.035, 20]} />
            <meshBasicMaterial color={COLORS.white} transparent opacity={0.8} />
          </mesh>
        </group>

        {LEDS.map((color, i) => (
          <mesh key={color} rotation={[Math.PI / 2, 0, 0]} position={[0.04 + i * 0.13, 0.86, 0.01]}>
            <cylinderGeometry args={[0.035, 0.035, 0.02, 20]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.3} />
          </mesh>
        ))}

        {/* Band with the engraved name */}
        <mesh geometry={band} position={[0, -0.08, 0.01]}>
          <meshStandardMaterial color={COLORS.redDark} roughness={0.55} />
        </mesh>
        <Text
          font={FONT_URL}
          position={[0, -0.08, 0.021]}
          fontSize={0.12}
          letterSpacing={0.06}
          color={COLORS.grayLight}
          anchorX="center"
          anchorY="middle"
        >
          POKÉDEX GAME
        </Text>
      </ModelPart>
    </group>
  );
}
