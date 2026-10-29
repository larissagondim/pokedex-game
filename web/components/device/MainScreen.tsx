"use client";

import { Html } from "@react-three/drei";
import type { RefObject } from "react";
import type { Object3D } from "three";
import { DeviceScreen } from "@/components/screen/DeviceScreen";
import { useDeviceState } from "@/stores/deviceState";
import { COLORS } from "./colors";
import { useRoundedSlab } from "./geometry";
import { htmlDistanceFactor, MAIN_SCREEN } from "./layout";
import { ModelPart } from "./ModelPart";

interface Props {
  /** Meshes that can hide the screen (the shell halves). */
  occluders: RefObject<Object3D | null>[];
}

/** 4:3 main screen: graphite bezel plus the DOM interface mounted on top. */
export function MainScreen({ occluders }: Props) {
  const { x, y, width, height, bezel, bezelDepth, cssWidth, cssHeight } = MAIN_SCREEN;
  const frame = useRoundedSlab(width + 2 * bezel, height + 2 * bezel, bezelDepth, 0.06, 0.01);
  const zoomIn = () => useDeviceState.getState().setZoomed(true);

  return (
    <group position={[x, y, 0]}>
      <group
        onDoubleClick={(e) => {
          e.stopPropagation();
          zoomIn();
        }}
      >
        <ModelPart name="screen_bezel">
          <mesh geometry={frame} position={[0, 0, bezelDepth / 2]}>
            <meshStandardMaterial color={COLORS.graphite} roughness={0.55} />
          </mesh>
        </ModelPart>
        <mesh position={[0, 0, bezelDepth + 0.001]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial color={COLORS.screenOff} />
        </mesh>
      </group>

      <Html
        transform
        occlude={occluders as RefObject<Object3D>[]}
        position={[0, 0, bezelDepth + 0.002]}
        distanceFactor={htmlDistanceFactor(width, cssWidth)}
        style={{ width: cssWidth, height: cssHeight }}
        zIndexRange={[10, 0]}
      >
        <DeviceScreen onRequestZoom={zoomIn} />
      </Html>
    </group>
  );
}
