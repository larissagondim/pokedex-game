"use client";

import type { Ref } from "react";
import type { Group } from "three";
import { useCompactLayout } from "@/hooks/useDeviceLayout";
import { Controls } from "./Controls";
import { BODY, SEAM, SPLIT_CONTROLS } from "./device.config";
import { useRoundedSlab } from "./geometry";
import { Graphite, RedPlastic } from "./materials";
import { ModelPart } from "./ModelPart";
import { SecondaryScreen } from "./SecondaryScreen";
import { StatusLed } from "./StatusLed";

/**
 * Right half (fixed): secondary screen, LED and, on desktop, the controls
 * (on phones they move to the screen half). Inner frame x ∈ [0, WIDTH].
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

      <SecondaryScreen />
      <StatusLed />
      {!compact && <Controls layout={SPLIT_CONTROLS} />}
    </group>
  );
}
