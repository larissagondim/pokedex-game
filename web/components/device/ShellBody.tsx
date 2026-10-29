"use client";

import type { Ref } from "react";
import type { Group } from "three";
import { COLORS } from "./colors";
import { useRoundedSlab } from "./geometry";
import { SHELL } from "./layout";
import { ModelPart } from "./ModelPart";

interface Props {
  name: string;
  /** Center x of the half, in the half's inner-face frame. */
  x: number;
  ref?: Ref<Group>;
}

/** One half of the red shell, inner face at z = 0. */
export function ShellBody({ name, x, ref }: Props) {
  const geometry = useRoundedSlab(SHELL.width, SHELL.height, SHELL.depth, SHELL.radius, SHELL.bevel);
  return (
    <group ref={ref} position={[x, 0, -SHELL.depth / 2]} userData={{ part: "shellBody" }}>
      <ModelPart name={name}>
        <mesh geometry={geometry} userData={{ part: "shellBody" }}>
          <meshStandardMaterial color={COLORS.red} roughness={0.42} metalness={0.05} />
        </mesh>
      </ModelPart>
    </group>
  );
}
