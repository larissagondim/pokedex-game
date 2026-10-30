"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { AudioListener, AudioLoader, type Group, PositionalAudio } from "three";
import { audioEnabled } from "@/stores/audio";
import { usePokedex } from "@/stores/pokedex";

const loader = new AudioLoader();
const buffers = new Map<string, Promise<AudioBuffer>>();

const loadBuffer = (url: string) => {
  let p = buffers.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    p.catch(() => buffers.delete(url)); // allow a retry later
    buffers.set(url, p);
  }
  return p;
};

/**
 * Positional sound source at the speaker grill. Plays the cry whenever the
 * pokedex store requests one (three.js PositionalAudio, like drei's
 * <PositionalAudio>, but with a URL that changes per Pokémon).
 */
export function CryEmitter() {
  const camera = useThree((s) => s.camera);
  const anchor = useRef<PositionalAudio | null>(null);
  const group = useRef<Group>(null);

  useEffect(() => {
    const listener = new AudioListener();
    camera.add(listener);
    const sound = new PositionalAudio(listener);
    sound.setRefDistance(15);
    group.current?.add(sound);
    anchor.current = sound;
    return () => {
      if (sound.isPlaying) sound.stop();
      sound.removeFromParent();
      camera.remove(listener);
    };
  }, [camera]);

  useEffect(
    () =>
      usePokedex.subscribe(async ({ cryRequest: request }, prev) => {
          if (request === prev.cryRequest) return;
          const sound = anchor.current;
          if (!request || !sound || !audioEnabled()) return;
          try {
            const buffer = await loadBuffer(request.url);
            if (usePokedex.getState().cryRequest !== request) return; // superseded
            if (sound.isPlaying) sound.stop();
            sound.setBuffer(buffer);
            sound.play();
          } catch {
            // Missing or undecodable cry (e.g. .ogg on old Safari): stay silent.
          }
        }),
    [],
  );

  return <group ref={group} />;
}
