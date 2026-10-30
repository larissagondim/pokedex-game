"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Mesh } from "three";
import { formatDexNumber } from "@/data/pokedex";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { isLidOpen, useDeviceState } from "@/stores/deviceState";
import { usePokedex } from "@/stores/pokedex";
import { useRoundedSlab } from "./geometry";
import { COLORS, FONT_URL, CONTROL_HALF, SECONDARY_CENTER } from "./device.config";
import { ModelPart } from "./ModelPart";

/** Pause at each end of the marquee, in seconds. */
const MARQUEE_PAUSE = 1;

type TroikaText = Mesh & {
  clipRect: [number, number, number, number] | null;
  textRenderInfo?: { blockBounds: [number, number, number, number] };
};

/**
 * Graphite strip on the lid showing "#0000 · NAME" for the focused Pokémon.
 * Names wider than the strip scroll back and forth. Dark while closed.
 */
export function SecondaryScreen() {
  const { width, height, radius, depth, fontSize, padding, scrollSpeed, emissiveOn } = CONTROL_HALF.secondary;
  const strip = useRoundedSlab(width, height, depth, radius, 0.01);
  const on = useDeviceState((s) => isLidOpen(s.phase) && s.phase !== "OPENING");
  const reducedMotion = useReducedMotion();
  const pokemon = usePokedex((s) => s.list.find((p) => p.id === s.focusedId));
  const label = pokemon ? `${formatDexNumber(pokemon.id)} · ${pokemon.name.toUpperCase()}` : "#0000 · ----------";

  const text = useRef<TroikaText>(null);
  const [overflow, setOverflow] = useState(0);
  const elapsed = useRef(0);
  const visible = width - 2 * padding;
  const left = -visible / 2;

  useFrame((_, dt) => {
    const t = text.current;
    if (!t) return;
    let shift = 0;
    if (overflow > 0 && !reducedMotion) {
      // Ping-pong: pause, scroll left, pause, scroll back.
      const travel = overflow / scrollSpeed;
      const cycle = 2 * (travel + MARQUEE_PAUSE);
      elapsed.current = (elapsed.current + dt) % cycle;
      const e = elapsed.current;
      const pos =
        e < MARQUEE_PAUSE ? 0
        : e < MARQUEE_PAUSE + travel ? (e - MARQUEE_PAUSE) / travel
        : e < 2 * MARQUEE_PAUSE + travel ? 1
        : 1 - (e - 2 * MARQUEE_PAUSE - travel) / travel;
      shift = pos * overflow;
    }
    t.position.x = left - shift;
    // clipRect is in the text's own space, so it moves opposite to the text.
    t.clipRect = [shift, -height / 2, shift + visible, height / 2];
  });

  return (
    <group position={[SECONDARY_CENTER.x, SECONDARY_CENTER.y, 0]}>
      <ModelPart name="screen_secondary">
        <mesh geometry={strip} position={[0, 0, depth / 2]}>
          <meshStandardMaterial
            color={COLORS.graphite}
            roughness={0.4}
            emissive={COLORS.secondaryText}
            emissiveIntensity={on ? emissiveOn * 0.15 : 0}
          />
        </mesh>
      </ModelPart>
      <Text
        ref={text}
        visible={on}
        font={FONT_URL}
        fontSize={fontSize}
        anchorX="left"
        anchorY="middle"
        position={[left, 0, depth + 0.002]}
        color={COLORS.secondaryText}
        whiteSpace="nowrap"
        onSync={(troika: TroikaText) => {
          const [minX, , maxX] = troika.textRenderInfo?.blockBounds ?? [0, 0, 0, 0];
          elapsed.current = 0;
          setOverflow(Math.max(0, maxX - minX - visible));
        }}
      >
        {label}
      </Text>
    </group>
  );
}
