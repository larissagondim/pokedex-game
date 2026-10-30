"use client";

import { ActionButton } from "./ActionButton";
import type { ControlLayout } from "./device.config";
import { DPad } from "./DPad";
import { PillButton } from "./PillButton";

/** D-pad, A/B and MENU/ZOOM placed by a layout (split or compact). */
export function Controls({ layout }: { layout: ControlLayout }) {
  const at = ({ x, y }: { x: number; y: number }) => ({ position: [x, y, 0] as [number, number, number], scale: layout.scale });
  return (
    <>
      <group {...at(layout.dpad)}>
        <DPad />
      </group>
      <group {...at(layout.a)}>
        <ActionButton button="A" x={0} y={0} />
      </group>
      <group {...at(layout.b)}>
        <ActionButton button="B" x={0} y={0} />
      </group>
      <group {...at(layout.menu)}>
        <PillButton button="MENU" x={0} y={0} />
      </group>
      <group {...at(layout.zoom)}>
        <PillButton button="ZOOM" x={0} y={0} />
      </group>
    </>
  );
}
