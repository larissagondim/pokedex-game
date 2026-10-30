import { AudioContext as ThreeAudioContext } from "three";
import { audioEnabled } from "@/stores/audio";

export type Sfx = "dpad" | "a" | "b" | "click" | "open" | "close" | "boot";

/** Shared with three.js so PositionalAudio and the UI blips use one context. */
export const getAudioContext = () => ThreeAudioContext.getContext() as unknown as globalThis.AudioContext;

interface Note {
  freq: number;
  /** Frequency at the end of the note (for sweeps). */
  to?: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

const SOUNDS: Record<Sfx, Note[]> = {
  dpad: [{ freq: 880, at: 0, dur: 0.03, type: "square", gain: 0.05 }],
  a: [
    { freq: 990, at: 0, dur: 0.05, type: "square", gain: 0.06 },
    { freq: 1480, at: 0.05, dur: 0.07, type: "square", gain: 0.06 },
  ],
  b: [
    { freq: 660, at: 0, dur: 0.05, type: "square", gain: 0.06 },
    { freq: 440, at: 0.05, dur: 0.07, type: "square", gain: 0.06 },
  ],
  click: [{ freq: 520, at: 0, dur: 0.035, type: "triangle", gain: 0.08 }],
  open: [{ freq: 220, to: 880, at: 0, dur: 0.35, type: "triangle", gain: 0.08 }],
  close: [{ freq: 880, to: 180, at: 0, dur: 0.3, type: "triangle", gain: 0.08 }],
  boot: [
    { freq: 523, at: 0, dur: 0.09, type: "square", gain: 0.05 },
    { freq: 659, at: 0.1, dur: 0.09, type: "square", gain: 0.05 },
    { freq: 784, at: 0.2, dur: 0.09, type: "square", gain: 0.05 },
    { freq: 1047, at: 0.3, dur: 0.22, type: "square", gain: 0.05 },
  ],
};

/** Plays a short synthesized blip (no audio files needed). */
export function playSfx(name: Sfx) {
  if (!audioEnabled()) return;
  const ctx = getAudioContext();
  const start = ctx.currentTime + 0.005;
  for (const n of SOUNDS[name]) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const t0 = start + n.at;
    const t1 = t0 + n.dur;
    osc.type = n.type ?? "square";
    osc.frequency.setValueAtTime(n.freq, t0);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t1);
    amp.gain.setValueAtTime(n.gain ?? 0.06, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }
}
