"use client";

import { SCREEN_HALF, BODY, COLORS } from "./device.config";
import { CryEmitter } from "./CryEmitter";
import { ModelPart } from "./ModelPart";

/** Six slits at the bottom right of the base; Pokémon cries come from here. */
export function SpeakerGrill() {
  const { slits, slitWidth, slitHeight, spacing, fromRight, fromBottom } = SCREEN_HALF.speaker;
  const x = -fromRight;
  const y = -BODY.height / 2 + fromBottom;
  const firstY = ((slits - 1) * spacing) / 2;

  return (
    <group position={[x, y, 0]}>
      <ModelPart name="speaker">
        {Array.from({ length: slits }, (_, i) => (
          <mesh key={i} position={[0, firstY - i * spacing, 0.001]}>
            <planeGeometry args={[slitWidth, slitHeight]} />
            <meshBasicMaterial color={COLORS.graphite} />
          </mesh>
        ))}
      </ModelPart>
      <CryEmitter />
    </group>
  );
}
