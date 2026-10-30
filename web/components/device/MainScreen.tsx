"use client";

import { Html } from "@react-three/drei";
import { DeviceScreen } from "@/components/screen/DeviceScreen";
import { useDeviceState } from "@/stores/deviceState";
import { useRoundedFrame } from "./geometry";
import { COLORS, HTML_Z_RANGE, htmlDistanceFactor, SCREEN_CENTER, SCREEN_HALF } from "./device.config";
import { ModelPart } from "./ModelPart";

/**
 * 4:3 main screen on the base: graphite bezel, recessed black screen, the DOM
 * interface (drei <Html>, blending occlusion) and a faint glass layer on top.
 */
export function MainScreen() {
  const { width, height, recess, glassOpacity, cssWidth, cssHeight } = SCREEN_HALF.screen;
  const bezel = SCREEN_HALF.bezel;
  const frame = useRoundedFrame(bezel.width, bezel.height, bezel.raise, bezel.radius, width, height);
  const screenZ = bezel.raise - recess;
  const zoomIn = () => useDeviceState.getState().zoomIn();

  return (
    <group position={[SCREEN_CENTER.x, SCREEN_CENTER.y, 0]}>
      <ModelPart name="screen_bezel">
        <mesh geometry={frame} position={[0, 0, bezel.raise / 2]}>
          <meshStandardMaterial color={COLORS.graphite} roughness={0.3} />
        </mesh>
      </ModelPart>

      {/* Black backing, kept well behind the Html's blending hole so the two
          never z-fight (the hole must win for the DOM to show through). */}
      <mesh position={[0, 0, screenZ - 0.015]} onDoubleClick={zoomIn}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color={COLORS.screenOff} />
      </mesh>

      <Html
        transform
        occlude="blending"
        // Blending puts the canvas at zIndexRange[0] / 2 and the DOM below it;
        // keep both low so the page HUD (HUD_Z_INDEX) stays on top.
        zIndexRange={[HTML_Z_RANGE, 0]}
        position={[0, 0, screenZ]}
        distanceFactor={htmlDistanceFactor(width, cssWidth)}
        style={{ width: cssWidth, height: cssHeight }}
      >
        <DeviceScreen onRequestZoom={zoomIn} />
      </Html>

      <mesh position={[0, 0, screenZ + 0.008]} raycast={() => null}>
        <planeGeometry args={[width, height]} />
        <meshPhysicalMaterial color={COLORS.white} roughness={0.1} transparent opacity={glassOpacity} depthWrite={false} />
      </mesh>
    </group>
  );
}
