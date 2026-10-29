"use client";

import { COLORS } from "./colors";

interface Props {
  position: [number, number];
  slits?: number;
  width?: number;
}

export function SpeakerGrill({ position: [x, y], slits = 4, width = 0.36 }: Props) {
  return (
    <group position={[x, y, 0.003]}>
      {Array.from({ length: slits }, (_, i) => (
        <mesh key={i} position={[0, -i * 0.05, 0]}>
          <boxGeometry args={[width, 0.022, 0.006]} />
          <meshStandardMaterial color={COLORS.redDark} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
