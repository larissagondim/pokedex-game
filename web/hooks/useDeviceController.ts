"use client";

import { useEffect } from "react";
import { useDeviceInput } from "@/stores/deviceInput";
import { useDeviceState } from "@/stores/deviceState";

/**
 * Device-level fallback for button events the screen didn't consume
 * (priority 0, below the screen). Opening, zooming and leaving zoom live here.
 */
export function useDeviceController() {
  useEffect(
    () =>
      useDeviceInput.getState().subscribe((button) => {
        const device = useDeviceState.getState();

        if (button === "ZOOM") {
          device.setZoomed(!device.zoomed);
          return true;
        }
        if (!device.open) {
          // Closed: A wakes the device up.
          if (button === "A") {
            device.setOpen(true);
            return true;
          }
          return;
        }
        // B reaches here only when the screen had nothing to go back to.
        if (button === "B" && device.zoomed) {
          device.setZoomed(false);
          return true;
        }
      }, 0),
    [],
  );
}
