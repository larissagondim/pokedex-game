"use client";

import { createContext, useContext } from "react";
import { BUTTON, COLORS } from "./device.config";

/** Glossy red plastic of the shell. */
export function RedPlastic() {
  return <meshPhysicalMaterial color={COLORS.red} roughness={0.35} clearcoat={0.6} clearcoatRoughness={0.2} />;
}

export function Graphite({ roughness = 0.8 }: { roughness?: number }) {
  return <meshStandardMaterial color={COLORS.graphite} roughness={roughness} />;
}

/** Hover state of the enclosing PressableButton, for the hover highlight. */
export const ButtonHoverContext = createContext(false);

/** Material for a button cap: brightens slightly while hovered. */
export function ButtonMaterial({ color, roughness }: { color: string; roughness: number }) {
  const hovered = useContext(ButtonHoverContext);
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      emissive={color}
      emissiveIntensity={hovered ? BUTTON.hoverEmissive : 0}
    />
  );
}

/** Invisible but still raycastable (for hit areas). */
export function HitAreaMaterial() {
  return <meshBasicMaterial transparent opacity={0} depthWrite={false} />;
}
