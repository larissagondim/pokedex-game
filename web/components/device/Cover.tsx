"use client";

import { Text } from "@react-three/drei";
import { BODY, COLORS, FONT_URL, CONTROL_HALF } from "./device.config";
import { Graphite } from "./materials";
import { ModelPart } from "./ModelPart";

/**
 * Outer face of the lid (screen half). The group is turned to face outward, so when the
 * device is closed +x points right and +z points at the viewer.
 * All red, with the project name engraved and four rubber feet.
 */
export function Cover() {
  const { feet, name, nameSize } = CONTROL_HALF.cover;
  const fx = BODY.width / 2 - feet.inset;
  const fy = BODY.height / 2 - feet.inset;
  const fr = feet.diameter / 2;
  const nameY = -BODY.height / 6;

  return (
    <group position={[-BODY.width / 2, 0, -BODY.depth]} rotation={[0, Math.PI, 0]} userData={{ part: "cover" }}>
      <ModelPart name="cover">
        {/* Engraved name: a darker offset copy reads as the shadowed wall. */}
        <Text font={FONT_URL} position={[-0.015, nameY + 0.015, 0.001]} fontSize={nameSize} letterSpacing={0.06} color="#6E0919" anchorX="center" anchorY="middle">
          {name}
        </Text>
        <Text font={FONT_URL} position={[0, nameY, 0.002]} fontSize={nameSize} letterSpacing={0.06} color={COLORS.redDark} anchorX="center" anchorY="middle">
          {name}
        </Text>

        {[
          [-fx, fy],
          [fx, fy],
          [-fx, -fy],
          [fx, -fy],
        ].map(([x, y]) => (
          <mesh key={`${x},${y}`} rotation={[Math.PI / 2, 0, 0]} position={[x, y, feet.height / 2]}>
            <cylinderGeometry args={[fr, fr, feet.height, 24]} />
            <Graphite />
          </mesh>
        ))}
      </ModelPart>
    </group>
  );
}
