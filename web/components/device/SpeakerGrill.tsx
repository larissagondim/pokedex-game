"use client";

import { SCREEN_HALF, BODY, COLORS } from "./device.config";
import { CryEmitter } from "./CryEmitter";
import { ModelPart } from "./ModelPart";

interface Props {
  /** Overrides for the compact layout; defaults come from the config. */
  x?: number;
  y?: number;
  slits?: number;
  width?: number;
}

/** Slits at the bottom of the screen half; Pokémon cries come from here. */
export function SpeakerGrill(props: Props) {
  const { slitHeight, spacing, fromRight, fromBottom } = SCREEN_HALF.speaker;
  const {
    x = -fromRight,
    y = -BODY.height / 2 + fromBottom,
    slits = SCREEN_HALF.speaker.slits,
    width: slitWidth = SCREEN_HALF.speaker.slitWidth,
  } = props;
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
