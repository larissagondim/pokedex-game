"use client";

import { CornerScrews } from "./BaseHalf";
import { BODY, CONTROL_HALF } from "./device.config";
import { Engraved, Graphite } from "./materials";
import { ModelPart } from "./ModelPart";

/**
 * Outer face of the lid (screen half). The group is turned to face outward, so when the
 * device is closed +x points right and +z points at the viewer.
 * All red, with the project name engraved, four rubber feet and four screws.
 */
export function Cover() {
  const { feet, name, nameSize, nameSpacing } = CONTROL_HALF.cover;
  const fx = BODY.width / 2 - feet.inset;
  const fy = BODY.height / 2 - feet.inset;
  const fr = feet.diameter / 2;
  const nameY = -BODY.height / 6;

  return (
    <group position={[-BODY.width / 2, 0, -BODY.depth]} rotation={[0, Math.PI, 0]} userData={{ part: "cover" }}>
      <ModelPart name="cover">
        <Engraved text={name} size={nameSize} letterSpacing={nameSpacing} position={[0, nameY, 0]} />
        <CornerScrews />

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
