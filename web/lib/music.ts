import type { RegionId } from "./regions";
import { getAudioContext } from "./sfx";

/**
 * Background music per region. Each region has an original chiptune loop
 * generated from a small "theme" (key, mode, chord progression, tempo, timbre)
 * and a seed, so it always plays the same tune. No game music is bundled.
 *
 * To use your own recordings, put files in web/public/music/ (git-ignored)
 * and map them here; a mapped region plays its file instead of the synth loop.
 */
export const CUSTOM_TRACKS: Partial<Record<RegionId, string>> = {
  // kanto: "/music/kanto.ogg",
};

const MASTER_VOLUME = 0.16;
const FADE_S = 0.6;
const LOOKAHEAD_S = 0.15;
const TICK_MS = 30;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
const PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10];

interface Theme {
  /** MIDI note of the tonic (60 = middle C). */
  root: number;
  scale: number[];
  /** Chord roots as scale degrees (0 = I), one per bar; the loop plays it twice. */
  chords: number[];
  bpm: number;
  beatsPerBar: 3 | 4;
  lead: OscillatorType;
  bass: OscillatorType;
  /** 0..1: chance of a rest on weak eighths (sparser = calmer). */
  rests: number;
  seed: number;
}

const THEMES: Record<RegionId, Theme> = {
  kanto: { root: 60, scale: MAJOR, chords: [0, 4, 5, 3], bpm: 120, beatsPerBar: 4, lead: "square", bass: "triangle", rests: 0.2, seed: 11 },
  johto: { root: 62, scale: MAJOR, chords: [0, 5, 3, 4], bpm: 100, beatsPerBar: 4, lead: "triangle", bass: "triangle", rests: 0.3, seed: 23 },
  hoenn: { root: 63, scale: MIXOLYDIAN, chords: [0, 6, 3, 0], bpm: 128, beatsPerBar: 4, lead: "square", bass: "triangle", rests: 0.15, seed: 37 },
  sinnoh: { root: 57, scale: MINOR, chords: [0, 5, 2, 6], bpm: 96, beatsPerBar: 4, lead: "sine", bass: "triangle", rests: 0.35, seed: 41 },
  unova: { root: 55, scale: MAJOR, chords: [0, 3, 4, 5], bpm: 132, beatsPerBar: 4, lead: "square", bass: "square", rests: 0.15, seed: 53 },
  kalos: { root: 65, scale: MAJOR, chords: [0, 3, 4, 0], bpm: 108, beatsPerBar: 3, lead: "triangle", bass: "sine", rests: 0.25, seed: 67 },
  alola: { root: 58, scale: MAJOR, chords: [0, 3, 0, 4], bpm: 112, beatsPerBar: 4, lead: "triangle", bass: "triangle", rests: 0.3, seed: 79 },
  galar: { root: 64, scale: MINOR, chords: [0, 5, 6, 4], bpm: 140, beatsPerBar: 4, lead: "square", bass: "square", rests: 0.1, seed: 83 },
  hisui: { root: 62, scale: DORIAN, chords: [0, 6, 0, 3], bpm: 90, beatsPerBar: 4, lead: "sine", bass: "triangle", rests: 0.4, seed: 97 },
  paldea: { root: 57, scale: PHRYGIAN_DOMINANT, chords: [0, 6, 5, 0], bpm: 124, beatsPerBar: 4, lead: "square", bass: "triangle", rests: 0.2, seed: 101 },
};

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** MIDI note for a scale degree (can be negative or above 6). */
const degreeToMidi = (theme: Theme, degree: number) =>
  theme.root + theme.scale[((degree % 7) + 7) % 7] + 12 * Math.floor(degree / 7);

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface Step {
  lead: number | null;
  bass: number | null;
}

/** One loop: eighth-note steps over the progression played twice. */
function compose(theme: Theme): Step[] {
  const random = rng(theme.seed);
  const stepsPerBar = theme.beatsPerBar * 2;
  const bars = [...theme.chords, ...theme.chords];
  const steps: Step[] = [];
  let last = theme.chords[0] + 7;

  bars.forEach((chord, bar) => {
    const chordTones = [chord, chord + 2, chord + 4].map((d) => d + 7);
    for (let s = 0; s < stepsPerBar; s++) {
      const strong = s % 2 === 0;
      let lead: number | null;
      if (!strong && random() < theme.rests) {
        lead = null;
      } else if (strong) {
        // Strong eighths land on a chord tone near the previous note.
        lead = chordTones.reduce((best, d) => (Math.abs(d - last) < Math.abs(best - last) || random() < 0.25 ? d : best));
      } else {
        // Weak eighths step to a neighbor in the scale.
        lead = last + (random() < 0.5 ? -1 : 1);
      }
      // Second half: end the phrase on the tonic.
      if (bar === bars.length - 1 && s === stepsPerBar - 2) lead = theme.chords[0] + 7;
      if (lead !== null) last = Math.max(5, Math.min(14, lead));
      const beat = s / 2;
      const bass = strong ? (beat % 2 === 0 ? chord - 7 : chord - 3) : null;
      steps.push({ lead: lead === null ? null : degreeToMidi(theme, last), bass: bass === null ? null : degreeToMidi(theme, bass) });
    }
  });
  return steps;
}

interface Voice {
  stop: (at: number) => void;
}

/** Plays a synthesized theme by scheduling notes slightly ahead of time. */
function startSynth(ctx: AudioContext, out: GainNode, theme: Theme): Voice {
  const steps = compose(theme);
  const stepS = 60 / theme.bpm / 2;
  let next = ctx.currentTime + 0.05;
  let index = 0;

  const note = (midi: number, at: number, dur: number, type: OscillatorType, gain: number) => {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(midiToHz(midi), at);
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(gain, at + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(amp).connect(out);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  };

  const timer = setInterval(() => {
    while (next < ctx.currentTime + LOOKAHEAD_S) {
      const { lead, bass } = steps[index];
      if (lead !== null) note(lead, next, stepS * 0.9, theme.lead, theme.lead === "square" ? 0.18 : 0.32);
      if (bass !== null) note(bass, next, stepS * 1.8, theme.bass, theme.bass === "square" ? 0.12 : 0.3);
      next += stepS;
      index = (index + 1) % steps.length;
    }
  }, TICK_MS);

  return { stop: () => clearInterval(timer) };
}

const buffers = new Map<string, Promise<AudioBuffer>>();

/** Loops a user-provided recording. */
function startFile(ctx: AudioContext, out: GainNode, url: string): Voice {
  let source: AudioBufferSourceNode | null = null;
  let stopped = false;
  let buffer = buffers.get(url);
  if (!buffer) {
    buffer = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data));
    buffers.set(url, buffer);
  }
  buffer
    .then((b) => {
      if (stopped) return;
      source = ctx.createBufferSource();
      source.buffer = b;
      source.loop = true;
      source.connect(out);
      source.start();
    })
    .catch(() => buffers.delete(url));
  return {
    stop: (at) => {
      stopped = true;
      source?.stop(at);
    },
  };
}

let master: GainNode | null = null;
let current: { region: RegionId; gain: GainNode; voice: Voice } | null = null;

const getMaster = () => {
  if (!master) {
    const ctx = getAudioContext();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
  }
  return master;
};

/** Crossfades to the given region's music; null fades out to silence. */
export function setRegionMusic(region: RegionId | null) {
  if ((current?.region ?? null) === region) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;

  if (current) {
    const { gain, voice } = current;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + FADE_S);
    setTimeout(() => {
      voice.stop(ctx.currentTime);
      gain.disconnect();
    }, FADE_S * 1000 + 50);
    current = null;
  }
  if (!region) return;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + FADE_S);
  gain.connect(getMaster());
  const file = CUSTOM_TRACKS[region];
  const voice = file ? startFile(ctx, gain, file) : startSynth(ctx, gain, THEMES[region]);
  current = { region, gain, voice };
}

/** Briefly lowers the music (e.g. while a cry plays). */
export function duckMusic(seconds = 1.6) {
  if (!master) return;
  const now = getAudioContext().currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(MASTER_VOLUME * 0.3, now + 0.1);
  master.gain.setValueAtTime(MASTER_VOLUME * 0.3, now + seconds);
  master.gain.linearRampToValueAtTime(MASTER_VOLUME, now + seconds + 0.4);
}
