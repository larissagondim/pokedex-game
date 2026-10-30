import { create } from "zustand";

interface AudioState {
  /** Browsers block audio until a user gesture; flips on the first one. */
  unlocked: boolean;
  muted: boolean;
  unlock: () => void;
  toggleMute: () => void;
}

export const useAudio = create<AudioState>((set) => ({
  unlocked: false,
  muted: false,
  unlock: () => set({ unlocked: true }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
}));

export const audioEnabled = () => {
  const { unlocked, muted } = useAudio.getState();
  return unlocked && !muted;
};
