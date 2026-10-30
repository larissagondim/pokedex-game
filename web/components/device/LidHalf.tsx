"use client";

import type { Ref } from "react";
import type { Group } from "three";
import { useRoundedSlab } from "./geometry";
import { useCompactLayout } from "@/hooks/useDeviceLayout";
import { Controls } from "./Controls";
import { BODY, COLORS, COMPACT_CONTROLS, COMPACT_SPEAKER, SCREEN_CENTER, SCREEN_HALF, SEAM } from "./device.config";
import { MainScreen } from "./MainScreen";
import { Cover } from "./Cover";
import { Graphite, RedPlastic } from "./materials";
import { ModelPart } from "./ModelPart";
import { SpeakerGrill } from "./SpeakerGrill";

/**
 * Left half, the lid: swings open to the left. Main screen, indicator bar,
 * speaker, side seams and the cover on its outer face; on phones also all the
 * controls, under the screen. Inner frame x ∈ [-WIDTH, 0].
 */
export function LidHalf({ bodyRef }: { bodyRef?: Ref<Group> }) {
  const body = useRoundedSlab(BODY.width, BODY.height, BODY.depth, BODY.cornerRadius, BODY.edgeBevel);
  const { indicator, bezel, seams } = SCREEN_HALF;
  const indicatorY = SCREEN_CENTER.y - bezel.height / 2 - indicator.gapBelowBezel;
  const compact = useCompactLayout();

  return (
    <group>
      <group ref={bodyRef} position={[-BODY.width / 2, 0, -BODY.depth / 2]} userData={{ part: "lidBody" }}>
        <ModelPart name="lid_body">
          <mesh geometry={body} castShadow receiveShadow userData={{ part: "lidBody" }}>
            <RedPlastic />
          </mesh>
        </ModelPart>
      </group>

      {/* Dark strip along the hinge edge: fills the groove between the halves. */}
      <mesh position={[-(SEAM.width / 2 - SEAM.overlap), 0, -(SEAM.depth / 2 + SEAM.inset)]}>
        <boxGeometry args={[SEAM.width, BODY.height - 2 * BODY.cornerRadius, SEAM.depth]} />
        <Graphite />
      </mesh>

      <Cover />
      <MainScreen />

      <mesh position={[SCREEN_CENTER.x, indicatorY, indicator.raise / 2]}>
        <boxGeometry args={[indicator.width, indicator.height, indicator.raise]} />
        <meshStandardMaterial color={COLORS.grayLight} roughness={0.5} />
      </mesh>

      {compact ? (
        <>
          <Controls layout={COMPACT_CONTROLS} />
          <SpeakerGrill {...COMPACT_SPEAKER} />
        </>
      ) : (
        <SpeakerGrill />
      )}

      {/* Seam grooves along the outer left side. */}
      {seams.z.map((z) => (
        <mesh key={z} position={[-BODY.width + 0.004, 0, z]}>
          <boxGeometry args={[0.01, BODY.height - 2 * seams.inset, seams.width]} />
          <meshBasicMaterial color={COLORS.redDark} />
        </mesh>
      ))}
    </group>
  );
}
