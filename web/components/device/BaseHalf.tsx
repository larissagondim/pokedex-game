"use client";

import type { Ref } from "react";
import type { Group } from "three";
import { useCompactLayout } from "@/hooks/useDeviceLayout";
import { Controls } from "./Controls";
import { BODY, COLORS, SEAM, SHELL, SPLIT_CONTROLS } from "./device.config";
import { useRoundedSlab } from "./geometry";
import { HingeLeaves } from "./Hinge";
import { Engraved, Graphite, RedPlastic, Screw } from "./materials";
import { ModelPart } from "./ModelPart";
import { SecondaryScreen } from "./SecondaryScreen";
import { StatusLed } from "./StatusLed";

/**
 * Right half (fixed): secondary screen, LED and, on desktop, the controls
 * (on phones they move to the screen half), the base's hinge leaves, the
 * engraved brand, parting lines on the outer side and screws on the back.
 * Inner frame x ∈ [0, WIDTH].
 */
export function BaseHalf({ bodyRef }: { bodyRef?: Ref<Group> }) {
  const body = useRoundedSlab(BODY.width, BODY.height, BODY.depth, BODY.cornerRadius, BODY.edgeBevel);
  const compact = useCompactLayout();

  return (
    <group>
      <group ref={bodyRef} position={[BODY.width / 2, 0, -BODY.depth / 2]} userData={{ part: "baseBody" }}>
        <ModelPart name="base_body">
          <mesh geometry={body} castShadow receiveShadow>
            <RedPlastic />
          </mesh>
        </ModelPart>
      </group>

      {/* Dark strip along the hinge edge: fills the groove between the halves. */}
      <mesh position={[(SEAM.width / 2 - SEAM.overlap), 0, -(SEAM.depth / 2 + SEAM.inset)]}>
        <boxGeometry args={[SEAM.width, BODY.height - 2 * BODY.cornerRadius, SEAM.depth]} />
        <Graphite />
      </mesh>

      <HingeLeaves half="base" />
      <SecondaryScreen />
      <StatusLed />
      {!compact && <Controls layout={SPLIT_CONTROLS} />}

      <Engraved
        text={SHELL.brand.text}
        size={SHELL.brand.size}
        letterSpacing={SHELL.brand.letterSpacing}
        position={[BODY.width / 2, -BODY.height / 2 + SHELL.brand.fromBottom, 0]}
      />

      <ShellSeams x={BODY.width} />

      {/* Screws on the back (outer face, facing -z). */}
      <group position={[BODY.width / 2, 0, -BODY.depth]} rotation={[0, Math.PI, 0]}>
        <CornerScrews />
      </group>
    </group>
  );
}

/** Parting-line grooves along the outer side wall at `x` (the wall away from the hinge). */
export function ShellSeams({ x }: { x: number }) {
  const { seams } = SHELL;
  const out = Math.sign(x) * 0.004;
  return seams.z.map((z) => (
    <mesh key={z} position={[x - out, 0, z]}>
      <boxGeometry args={[0.01, BODY.height - 2 * seams.inset, seams.width]} />
      <meshBasicMaterial color={COLORS.redDark} />
    </mesh>
  ));
}

/** Four screws near the corners of an outer face (group centered on the face, facing +z). */
export function CornerScrews() {
  const { screws } = SHELL;
  const sx = BODY.width / 2 - screws.inset;
  const sy = BODY.height / 2 - screws.inset;
  return [
    [-sx, sy],
    [sx, sy],
    [-sx, -sy],
    [sx, -sy],
  ].map(([x, y], i) => <Screw key={i} {...screws} position={[x, y, 0]} angle={0.7 * i} />);
}
