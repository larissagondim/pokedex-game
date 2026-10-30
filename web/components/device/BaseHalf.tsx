"use client";

import type { Ref } from "react";
import type { Group } from "three";
import { ActionButton } from "./ActionButton";
import { BODY, CONTROL_HALF, PILL_Y, SEAM } from "./device.config";
import { DPad } from "./DPad";
import { useRoundedSlab } from "./geometry";
import { Graphite, RedPlastic } from "./materials";
import { ModelPart } from "./ModelPart";
import { PillButton } from "./PillButton";
import { SecondaryScreen } from "./SecondaryScreen";
import { StatusLed } from "./StatusLed";

/** Right half (fixed): secondary screen, LED and controls. Inner frame x ∈ [0, WIDTH]. */
export function BaseHalf({ bodyRef }: { bodyRef?: Ref<Group> }) {
  const body = useRoundedSlab(BODY.width, BODY.height, BODY.depth, BODY.cornerRadius, BODY.edgeBevel);
  const { pill, action } = CONTROL_HALF;
  const pillOffset = (pill.width + pill.gap) / 2;

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
      <DPad />
      <ActionButton button="A" {...action.a} />
      <ActionButton button="B" {...action.b} />
      <PillButton button="MENU" x={BODY.width / 2 - pillOffset} y={PILL_Y} />
      <PillButton button="ZOOM" x={BODY.width / 2 + pillOffset} y={PILL_Y} />
    </group>
  );
}
