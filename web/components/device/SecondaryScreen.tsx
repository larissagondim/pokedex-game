"use client";

import { Html } from "@react-three/drei";
import type { RefObject } from "react";
import type { Object3D } from "three";
import { SecondaryDisplay } from "@/components/screen/SecondaryDisplay";
import { COLORS } from "./colors";
import { useRoundedSlab } from "./geometry";
import { htmlDistanceFactor, SECONDARY_SCREEN } from "./layout";
import { ModelPart } from "./ModelPart";

export function SecondaryScreen({ occluders }: { occluders: RefObject<Object3D | null>[] }) {
  const { x, y, width, height, depth, cssWidth, cssHeight } = SECONDARY_SCREEN;
  const strip = useRoundedSlab(width, height, depth, 0.05, 0.008);
  const inner = width - 0.08;

  return (
    <group position={[x, y, 0]}>
      <ModelPart name="screen_secondary">
        <mesh geometry={strip} position={[0, 0, depth / 2]}>
          <meshStandardMaterial color={COLORS.graphite} roughness={0.5} />
        </mesh>
      </ModelPart>
      <Html
        transform
        occlude={occluders as RefObject<Object3D>[]}
        position={[0, 0, depth + 0.002]}
        distanceFactor={htmlDistanceFactor(inner, cssWidth)}
        style={{ width: cssWidth, height: cssHeight }}
        pointerEvents="none"
        zIndexRange={[10, 0]}
      >
        <SecondaryDisplay />
      </Html>
    </group>
  );
}
