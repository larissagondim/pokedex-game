import { create } from "zustand";

interface DeviceState {
  open: boolean;
  /** Camera is fitted to the main screen and rotation is locked. */
  zoomed: boolean;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setZoomed: (zoomed: boolean) => void;
}

export const useDeviceState = create<DeviceState>((set) => ({
  open: false,
  zoomed: false,
  toggleOpen: () => set((s) => ({ open: !s.open, zoomed: s.open ? false : s.zoomed })),
  // Closing the device always leaves zoom mode; zooming always opens it.
  setOpen: (open) => set((s) => ({ open, zoomed: open ? s.zoomed : false })),
  setZoomed: (zoomed) => set((s) => ({ zoomed, open: zoomed ? true : s.open })),
}));
