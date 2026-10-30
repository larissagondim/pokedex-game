"use client";

import { useEffect } from "react";
import { useDeviceInput } from "@/stores/deviceInput";
import { isZoomedIn, useDeviceState } from "@/stores/deviceState";

/**
 * Device-level fallback for button events the screen didn't consume
 * (priority 0, below the screen): zoom, opening with A, leaving zoom with B.
 */
export function useDeviceController() {
  useEffect(
    () =>
      useDeviceInput.getState().subscribe((button) => {
        const device = useDeviceState.getState();
        if (button === "ZOOM") {
          device.toggleZoom();
          return true;
        }
        if (button === "A" && device.phase === "CLOSED") {
          device.open();
          return true;
        }
        // B reaches here only when the interface is at its root.
        if (button === "B" && isZoomedIn(device.phase)) {
          device.zoomOut();
          return true;
        }
      }, 0),
    [],
  );
}
