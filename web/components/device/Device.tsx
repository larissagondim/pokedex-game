"use client";

import { useCursor } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { type Group, MathUtils, type Object3D } from "three";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { isLidOpen, isZoomedIn, useDeviceState } from "@/stores/deviceState";
import { BaseHalf } from "./BaseHalf";
import { GAP, HINGE, IDLE, INPUT } from "./device.config";
import { Hinge } from "./Hinge";
import { LidHalf } from "./LidHalf";

/** Below these, the lid spring counts as settled. */
const SETTLE_DEG = 0.3;
const SETTLE_SPEED = 2;

/** True when the hit is the cover: its decorations or the lid's outer face. */
function isCoverHit(e: ThreeEvent<PointerEvent | MouseEvent>) {
  for (let o: Object3D | null = e.object; o && o !== e.eventObject; o = o.parent) {
    if (o.userData.part === "cover") return true;
    if (o.userData.part === "lidBody") return (e.face?.normal.z ?? 0) < -0.5;
  }
  return false;
}

/** Root of the device: fixed controls half, hinge and the spring-driven screen lid. */
export function Device() {
  const reducedMotion = useReducedMotion();
  const idle = useRef<Group>(null);
  const lid = useRef<Group>(null);
  const angle = useRef(0); // degrees, 0 = closed
  const velocity = useRef(0);
  /** When CLOSING started, for the screen power-off delay. */
  const closingSince = useRef(0);

  useEffect(
    () =>
      useDeviceState.subscribe((s, prev) => {
        if (s.phase === "CLOSING" && prev.phase !== "CLOSING") closingSince.current = performance.now();
      }),
    [],
  );

  const [coverHovered, setCoverHovered] = useState(false);
  const closed = useDeviceState((s) => s.phase === "CLOSED");
  useCursor(coverHovered && closed);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30); // keep the spring stable on frame drops
    const { phase, interacted, finish } = useDeviceState.getState();

    // Lid: damped spring toward the target angle (slight overshoot when opening).
    const target = isZoomedIn(phase) ? HINGE.zoomDeg : isLidOpen(phase) ? HINGE.openDeg : 0;
    const waitingForScreenOff = phase === "CLOSING" && performance.now() - closingSince.current < HINGE.closeDelayS * 1000;
    if (reducedMotion) {
      angle.current = target;
      velocity.current = 0;
    } else if (!waitingForScreenOff) {
      const k = HINGE.stiffness;
      const c = 2 * HINGE.dampingRatio * Math.sqrt(k);
      velocity.current += (k * (target - angle.current) - c * velocity.current) * dt;
      angle.current += velocity.current * dt;
      if (angle.current < 0 || angle.current > HINGE.zoomDeg) {
        // The lid can't pass through the base, nor fold past flat.
        angle.current = MathUtils.clamp(angle.current, 0, HINGE.zoomDeg);
        velocity.current = 0;
      }
    }
    if (lid.current) lid.current.rotation.y = MathUtils.degToRad(180 - angle.current);

    const settled = Math.abs(target - angle.current) < SETTLE_DEG && Math.abs(velocity.current) < SETTLE_SPEED;
    if (settled && (phase === "OPENING" || phase === "CLOSING")) finish(phase);

    // Idle float and sway while closed and untouched.
    const g = idle.current;
    if (g) {
      const idling = phase === "CLOSED" && !interacted && !reducedMotion;
      const t = clock.elapsedTime;
      const y = idling ? Math.sin(t * IDLE.floatSpeed) * IDLE.floatAmplitude : 0;
      const ry = idling ? Math.sin(t * IDLE.swaySpeed) * IDLE.swayRad : 0;
      g.position.y = MathUtils.damp(g.position.y, y, 4, rawDt);
      g.rotation.y = MathUtils.damp(g.rotation.y, ry, 4, rawDt);
    }
  });

  const onLidClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > INPUT.dragTolerancePx || !isCoverHit(e)) return;
    e.stopPropagation();
    useDeviceState.getState().toggle();
  };

  return (
    <group ref={idle}>
      <BaseHalf />
      <Hinge />
      {/* The lid pivots on the hinge axis, half a gap in front of the inner
          faces, so the closed halves end up GAP apart. */}
      <group ref={lid} position={[0, 0, GAP / 2]} rotation={[0, Math.PI, 0]}>
        <group
          position={[0, 0, -GAP / 2]}
          onClick={onLidClick}
          onPointerMove={(e) => setCoverHovered(isCoverHit(e))}
          onPointerOut={() => setCoverHovered(false)}
        >
          <LidHalf />
        </group>
      </group>
    </group>
  );
}
