import { create } from "zustand";

interface AudioState {
  /** Browsers block audio until a user gesture; flips on the first one. */
  unlocked: boolean;
  muted: boolean;
  /** Region background music (separate from UI sounds and cries). */
  musicOn: boolean;
  unlock: () => void;
  toggleMute: () => void;
  toggleMusic: () => void;
}

export const useAudio = create<AudioState>((set) => ({
  unlocked: false,
  muted: false,
  musicOn: true,
  unlock: () => set({ unlocked: true }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  toggleMusic: () => set((s) => ({ musicOn: !s.musicOn })),
}));

export const audioEnabled = () => {
  const { unlocked, muted } = useAudio.getState();
  return unlocked && !muted;
};
