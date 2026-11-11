"use client";

import { Text } from "@react-three/drei";
import { createContext, useContext, useMemo } from "react";
import { Color, DataTexture, RepeatWrapping, RGBAFormat } from "three";
import { BUTTON, COLORS, FONT_URL, SHELL } from "./device.config";

let plasticNoise: DataTexture | null = null;

/**
 * Fine grayscale noise shared by the shell: as a bump map it gives the
 * plastic a light grain, as a roughness map a slightly uneven sheen.
 * Deterministic (hashed), built once on first use.
 */
function plasticTexture() {
  if (plasticNoise) return plasticNoise;
  const { size, repeat, roughnessSpread } = SHELL.texture;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const h = Math.sin(i * 12.9898 + (i % size) * 78.233) * 43758.5453;
    const n = h - Math.floor(h); // 0..1
    const v = Math.round(255 * (1 - roughnessSpread * n));
    data.set([v, v, v, 255], i * 4);
  }
  plasticNoise = new DataTexture(data, size, size, RGBAFormat);
  plasticNoise.wrapS = plasticNoise.wrapT = RepeatWrapping;
  plasticNoise.repeat.set(repeat, repeat);
  plasticNoise.needsUpdate = true;
  return plasticNoise;
}

/** Glossy red plastic of the shell, with a faint grain. */
export function RedPlastic() {
  const grain = plasticTexture();
  return (
    <meshPhysicalMaterial
      color={COLORS.red}
      roughness={0.35}
      roughnessMap={grain}
      bumpMap={grain}
      bumpScale={SHELL.texture.bumpScale}
      clearcoat={0.6}
      clearcoatRoughness={0.2}
    />
  );
}

export function Graphite({ roughness = 0.8 }: { roughness?: number }) {
  return <meshStandardMaterial color={COLORS.graphite} roughness={roughness} />;
}

/** Brushed metal (hinge pins, screws). */
export function Metal() {
  return <meshStandardMaterial color={COLORS.metal} metalness={0.8} roughness={0.35} />;
}

/** Hover and press state of the enclosing PressableButton, for the cap material. */
export const ButtonHoverContext = createContext(false);
export const ButtonPressContext = createContext(false);

/** Material for a button cap: brightens slightly while hovered, darkens while pressed. */
export function ButtonMaterial({ color, roughness }: { color: string; roughness: number }) {
  const hovered = useContext(ButtonHoverContext);
  const pressed = useContext(ButtonPressContext);
  const shade = useMemo(() => new Color(color).multiplyScalar(pressed ? BUTTON.pressedShade : 1), [color, pressed]);
  return (
    <meshStandardMaterial
      color={shade}
      roughness={roughness}
      emissive={color}
      emissiveIntensity={hovered && !pressed ? BUTTON.hoverEmissive : 0}
    />
  );
}

/** Invisible but still raycastable (for hit areas). */
export function HitAreaMaterial() {
  return <meshBasicMaterial transparent opacity={0} depthWrite={false} />;
}

interface EngravedProps {
  text: string;
  size: number;
  letterSpacing?: number;
  position: [number, number, number];
  color?: string;
}

/** Lettering cut into the shell: a darker copy, offset down-left, reads as the cut's wall. */
export function Engraved({ text, size, letterSpacing = 0, position: [x, y, z], color = COLORS.redDark }: EngravedProps) {
  const off = SHELL.engraveOffset * (size / SHELL.engraveReference);
  return (
    <group position={[x, y, z]}>
      <Text font={FONT_URL} position={[-off, off, 0.001]} fontSize={size} letterSpacing={letterSpacing} color={COLORS.engraveWall} anchorX="center" anchorY="middle">
        {text}
      </Text>
      <Text font={FONT_URL} position={[0, 0, 0.002]} fontSize={size} letterSpacing={letterSpacing} color={color} anchorX="center" anchorY="middle">
        {text}
      </Text>
    </group>
  );
}

interface ScrewProps {
  diameter: number;
  height: number;
  slotWidth: number;
  position: [number, number, number];
  /** Slot angle (radians), so a row of screws doesn't look stamped. */
  angle?: number;
}

/** Slotted screw head, its base on z = 0 of the group, facing +z. */
export function Screw({ diameter, height, slotWidth, position, angle = 0 }: ScrewProps) {
  const r = diameter / 2;
  return (
    <group position={position} rotation={[0, 0, angle]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, height / 2]}>
        <cylinderGeometry args={[r, r * 1.05, height, 20]} />
        <Metal />
      </mesh>
      <mesh position={[0, 0, height + 0.001]}>
        <planeGeometry args={[diameter * 0.8, slotWidth]} />
        <meshBasicMaterial color={COLORS.graphite} />
      </mesh>
    </group>
  );
}
