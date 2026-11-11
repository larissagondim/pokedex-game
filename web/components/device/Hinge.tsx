"use client";

import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useState } from "react";
import { isLidOpen, useDeviceState } from "@/stores/deviceState";
import { BODY, GAP, HINGE, INPUT } from "./device.config";
import { useRoundedSlab } from "./geometry";
import { Graphite, Metal, Screw } from "./materials";
import { ModelPart } from "./ModelPart";

/** Length of the barrel and of each knuckle, and the knuckles' centers (bottom to top). */
function knuckles() {
  const length = BODY.height - 2 * HINGE.endInset;
  const each = (length - (HINGE.knuckles - 1) * HINGE.knuckleGap) / HINGE.knuckles;
  const centers = Array.from({ length: HINGE.knuckles }, (_, i) => -length / 2 + each / 2 + i * (each + HINGE.knuckleGap));
  return { length, each, centers };
}

/** Knuckles that belong to each half: the base holds the even ones (both ends), the lid the odd ones. */
const owned = (half: "base" | "lid") => knuckles().centers.filter((_, i) => (i % 2 === 0) === (half === "base"));

/**
 * The barrel on the pivot axis, the full height of the device: knuckles
 * that alternate between the halves (each one's leaf is drawn by its half),
 * with pin caps at both ends. Centered on the axis, it looks the same at any
 * angle. Clicking it closes the device.
 */
export function Hinge() {
  const open = useDeviceState((s) => isLidOpen(s.phase));
  const [hovered, setHovered] = useState(false);
  useCursor(hovered && open);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > INPUT.dragTolerancePx || !open) return;
    e.stopPropagation();
    useDeviceState.getState().close();
  };

  const radius = HINGE.diameter / 2;
  const { length, each, centers } = knuckles();
  const cap = HINGE.pinCap;
  return (
    <group
      position={[0, 0, GAP / 2]}
      onClick={onClick}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <ModelPart name="hinge">
        {centers.map((y) => (
          <mesh key={y} position={[0, y, 0]} castShadow>
            <cylinderGeometry args={[radius, radius, each, 32]} />
            <Graphite roughness={0.5} />
          </mesh>
        ))}
        {[1, -1].map((end) => (
          <mesh key={end} position={[0, end * (length / 2 + cap.height / 2), 0]}>
            <cylinderGeometry args={[cap.diameter / 2, cap.diameter / 2, cap.height, 24]} />
            <Metal />
          </mesh>
        ))}
      </ModelPart>
    </group>
  );
}

/**
 * The plates that tie one half to its knuckles: screwed to the half's inner
 * face along the hinge edge. Drawn inside the half's own frame, so the lid's
 * swing with it.
 */
export function HingeLeaves({ half }: { half: "base" | "lid" }) {
  const { leaf, screw } = HINGE;
  const { each } = knuckles();
  const length = each - 2 * leaf.endInset;
  const plate = useRoundedSlab(leaf.reach, length, leaf.thickness, leaf.radius, leaf.bevel);
  // The base spans x ≥ 0 from the hinge edge, the lid x ≤ 0.
  const dir = half === "base" ? 1 : -1;
  const x = dir * (leaf.start + leaf.reach / 2);
  const screwX = dir * screw.fromEdge;
  const screwY = length / 2 - screw.fromEnd;

  return (
    <ModelPart name={`hinge_leaf_${half}`}>
      {owned(half).map((y, i) => (
        <group key={y} position={[0, y, 0]}>
          <mesh geometry={plate} position={[x, 0, leaf.thickness / 2]} castShadow receiveShadow>
            <Graphite roughness={0.55} />
          </mesh>
          {[1, -1].map((s) => (
            <Screw key={s} {...screw} position={[screwX, s * screwY, leaf.thickness]} angle={0.4 + i + s} />
          ))}
        </group>
      ))}
    </ModelPart>
  );
}
