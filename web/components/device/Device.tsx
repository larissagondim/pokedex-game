"use client";

import { useCursor } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { MathUtils, type Group, type Object3D } from "three";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useDeviceState } from "@/stores/deviceState";
import { COLORS } from "./colors";
import { Cover } from "./Cover";
import { DPad } from "./DPad";
import { HingeSpine } from "./HingeSpine";
import { CONTROLS, HINGE, SHELL } from "./layout";
import { MainScreen } from "./MainScreen";
import { PillButton } from "./PillButton";
import { RoundButton } from "./RoundButton";
import { SecondaryScreen } from "./SecondaryScreen";
import { ShellBody } from "./ShellBody";
import { SpeakerGrill } from "./SpeakerGrill";

/** Pointer travel (px) above which a click is treated as the end of a drag. */
const DRAG_TOLERANCE_PX = 5;

/** True when the hit is the cover: its decorations or the shell's outer face. */
function isCoverHit(e: ThreeEvent<PointerEvent | MouseEvent>) {
  for (let o: Object3D | null = e.object; o && o !== e.eventObject; o = o.parent) {
    if (o.userData.part === "cover") return true;
    if (o.userData.part === "shellBody") return (e.face?.normal.z ?? 0) < -0.5;
  }
  return false;
}

export function Device() {
  const open = useDeviceState((s) => s.open);
  const zoomed = useDeviceState((s) => s.zoomed);
  const reducedMotion = useReducedMotion();

  const hinge = useRef<Group>(null);
  const angle = useRef(0);
  const leftBody = useRef<Group>(null);
  const rightBody = useRef<Group>(null);
  const occluders = [leftBody, rightBody];

  const [coverHovered, setCoverHovered] = useState(false);
  useCursor(coverHovered);

  const targetDeg = zoomed ? HINGE.zoomDeg : open ? HINGE.openDeg : 0;
  useFrame((_, dt) => {
    angle.current = reducedMotion
      ? targetDeg
      : MathUtils.damp(angle.current, targetDeg, HINGE.lambda, dt);
    if (hinge.current) {
      hinge.current.rotation.y = Math.PI - MathUtils.degToRad(angle.current);
    }
  });

  const onLeftClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > DRAG_TOLERANCE_PX || !isCoverHit(e)) return;
    e.stopPropagation();
    useDeviceState.getState().toggleOpen();
  };

  return (
    <group>
      <HingeSpine />

      {/* Left half: pivots on the hinge axis, which sits half a gap in front of
          the inner faces so the closed halves end up `gap` apart. */}
      <group ref={hinge} position={[0, 0, SHELL.gap / 2]}>
        <group
          position={[0, 0, -SHELL.gap / 2]}
          onClick={onLeftClick}
          onPointerMove={(e) => setCoverHovered(isCoverHit(e))}
          onPointerOut={() => setCoverHovered(false)}
        >
          <ShellBody ref={leftBody} name="shell_left" x={-SHELL.width / 2} />
          <Cover />
          <MainScreen occluders={occluders} />
          <SpeakerGrill position={[-0.46, -0.62]} slits={4} width={0.5} />
          <mesh position={[-1.18, -0.66, 0.006]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.012, 20]} />
            <meshStandardMaterial color={COLORS.ledGreen} emissive={COLORS.ledGreen} emissiveIntensity={open ? 0.9 : 0} />
          </mesh>
        </group>
      </group>

      {/* Right half: fixed. */}
      <group>
        <ShellBody ref={rightBody} name="shell_right" x={SHELL.width / 2} />
        <SecondaryScreen occluders={occluders} />
        <DPad />
        <RoundButton button="A" {...CONTROLS.a} color={COLORS.graphite} labelColor={COLORS.grayLight} />
        <RoundButton button="B" {...CONTROLS.b} color={COLORS.white} labelColor={COLORS.graphite} />
        <PillButton button="MENU" {...CONTROLS.menu} />
        <PillButton button="ZOOM" {...CONTROLS.zoom} />
        <SpeakerGrill position={[1.0, -0.92]} slits={3} width={0.4} />
      </group>
    </group>
  );
}
