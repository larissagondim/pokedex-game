import { create } from "zustand";

/**
 * CLOSED → OPENING → OPEN → ZOOMING_IN → ZOOMED → ZOOMING_OUT → OPEN → CLOSING → CLOSED
 * Transitional phases end when their animation calls `finish(phase)`.
 */
export type DevicePhase =
  | "CLOSED"
  | "OPENING"
  | "OPEN"
  | "ZOOMING_IN"
  | "ZOOMED"
  | "ZOOMING_OUT"
  | "CLOSING";

/** Lid is (or is going) open. */
export const isLidOpen = (p: DevicePhase) => p !== "CLOSED" && p !== "CLOSING";
/** Only these phases forward button events to the interface. */
export const acceptsInput = (p: DevicePhase) => p === "OPEN" || p === "ZOOMED";
export const isZoomedIn = (p: DevicePhase) => p === "ZOOMING_IN" || p === "ZOOMED";

interface DeviceState {
  phase: DevicePhase;
  /** Zoom requested while closed: zoom in as soon as the lid finishes opening. */
  pendingZoom: boolean;
  /** The user has dragged or pressed something (stops the idle sway). */
  interacted: boolean;
  /** Bumped to ask the camera to return to the default view. */
  viewResetNonce: number;

  open: () => void;
  close: () => void;
  toggle: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleZoom: () => void;
  /** Called by the animation driving `phase` when it settles. */
  finish: (phase: DevicePhase) => void;
  markInteracted: () => void;
  resetView: () => void;
}

export const useDeviceState = create<DeviceState>((set, get) => ({
  phase: "CLOSED",
  pendingZoom: false,
  interacted: false,
  viewResetNonce: 0,

  open: () => {
    const { phase } = get();
    if (phase === "CLOSED" || phase === "CLOSING") set({ phase: "OPENING" });
  },

  close: () => {
    if (isLidOpen(get().phase)) set({ phase: "CLOSING", pendingZoom: false });
  },

  toggle: () => (isLidOpen(get().phase) ? get().close() : get().open()),

  zoomIn: () => {
    const { phase } = get();
    if (phase === "OPEN" || phase === "ZOOMING_OUT") set({ phase: "ZOOMING_IN" });
    else if (!isLidOpen(phase) || phase === "OPENING") {
      set({ pendingZoom: true });
      get().open();
    }
  },

  zoomOut: () => {
    if (isZoomedIn(get().phase)) set({ phase: "ZOOMING_OUT" });
    set({ pendingZoom: false });
  },

  toggleZoom: () => (isZoomedIn(get().phase) ? get().zoomOut() : get().zoomIn()),

  finish: (from) => {
    const { phase, pendingZoom } = get();
    if (phase !== from) return;
    switch (from) {
      case "OPENING":
        set(pendingZoom ? { phase: "ZOOMING_IN", pendingZoom: false } : { phase: "OPEN" });
        break;
      case "CLOSING":
        set({ phase: "CLOSED" });
        break;
      case "ZOOMING_IN":
        set({ phase: "ZOOMED" });
        break;
      case "ZOOMING_OUT":
        set({ phase: "OPEN" });
        break;
    }
  },

  markInteracted: () => {
    if (!get().interacted) set({ interacted: true });
  },

  resetView: () => set((s) => ({ viewResetNonce: s.viewResetNonce + 1 })),
}));
