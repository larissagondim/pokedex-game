"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, type Group, LatheGeometry, MathUtils, Vector2 } from "three";
import type { DeviceButton } from "@/stores/deviceInput";
import { useDeviceInput } from "@/stores/deviceInput";
import { COLORS, CONTROL_HALF } from "./device.config";
import { HitAreaMaterial } from "./materials";
import { ModelPart } from "./ModelPart";
import { PressableButton } from "./PressableButton";

// `theta` centers the hit wedge once the cylinder faces +z (0 = down);
// `angle` is the screen-space direction used to place the arrow.
const DIRECTIONS: { button: DeviceButton; theta: number; angle: number }[] = [
  { button: "DOWN", theta: 0, angle: -Math.PI / 2 },
  { button: "RIGHT", theta: Math.PI / 2, angle: 0 },
  { button: "UP", theta: Math.PI, angle: Math.PI / 2 },
  { button: "LEFT", theta: (3 * Math.PI) / 2, angle: Math.PI },
];

/** Lathe profile (radius, height) turned around the z axis. */
function useLathe(points: [number, number][]) {
  return useMemo(() => {
    const g = new LatheGeometry(points.map(([r, h]) => new Vector2(r, h)), 64);
    g.rotateX(Math.PI / 2); // lathe axis y → z
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * White circular directional pad with engraved arrows and a concave gray
 * center. Four invisible quadrant hit areas; the disc tilts toward the
 * pressed direction instead of sinking.
 */
export function DPad() {
  const { diameter, raise, centerDiameter, tiltDeg } = CONTROL_HALF.dpad;
  const R = diameter / 2;
  const rc = centerDiameter / 2;
  const disc = useLathe([
    [rc, raise - 0.02],
    [rc + 0.03, raise],
    [R - 0.06, raise],
    [R, raise - 0.05],
    [R, 0],
  ]);
  const center = useLathe([
    [0, raise - 0.07],
    [rc * 0.6, raise - 0.06],
    [rc, raise - 0.02],
  ]);

  const tilt = useRef<Group>(null);
  const pressed = useDeviceInput((s) => s.pressed);
  const tiltRad = MathUtils.degToRad(tiltDeg);

  useFrame((_, dt) => {
    const g = tilt.current;
    if (!g) return;
    // Pressed edge sinks: UP tilts the top back, RIGHT tilts the right side.
    const rx = (pressed.DOWN ? 1 : 0) - (pressed.UP ? 1 : 0);
    const ry = (pressed.RIGHT ? 1 : 0) - (pressed.LEFT ? 1 : 0);
    g.rotation.x = MathUtils.damp(g.rotation.x, rx * tiltRad, 40, dt);
    g.rotation.y = MathUtils.damp(g.rotation.y, ry * tiltRad, 40, dt);
  });

  const arrowR = R * 0.68;

  return (
    <group>
      <group ref={tilt}>
        <ModelPart name="dpad">
          <mesh geometry={disc} castShadow>
            <meshStandardMaterial color={COLORS.white} roughness={0.45} side={DoubleSide} />
          </mesh>
          <mesh geometry={center}>
            <meshStandardMaterial color={COLORS.gray} roughness={0.6} side={DoubleSide} />
          </mesh>
          {DIRECTIONS.map(({ button, angle }) => (
            <mesh
              key={button}
              position={[Math.cos(angle) * arrowR, Math.sin(angle) * arrowR, raise + 0.001]}
              rotation={[0, 0, angle]}
            >
              <circleGeometry args={[0.16, 3]} />
              <meshStandardMaterial color={COLORS.engrave} roughness={0.7} />
            </mesh>
          ))}
        </ModelPart>
      </group>

      {DIRECTIONS.map(({ button, theta }) => (
        <PressableButton key={button} button={button} travel={0}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, raise / 2 + 0.01]}>
            <cylinderGeometry args={[R, R, raise + 0.02, 16, 1, false, theta - Math.PI / 4, Math.PI / 2]} />
            <HitAreaMaterial />
          </mesh>
        </PressableButton>
      ))}
    </group>
  );
}
