import { create } from "zustand";
import { INPUT } from "@/components/device/device.config";
import { useDeviceState } from "./deviceState";

export const DEVICE_BUTTONS = [
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "A",
  "B",
  "MENU",
  "ZOOM",
] as const;

export type DeviceButton = (typeof DEVICE_BUTTONS)[number];

const DIRECTIONS: readonly DeviceButton[] = ["UP", "DOWN", "LEFT", "RIGHT"];
export const isDirection = (b: DeviceButton) => DIRECTIONS.includes(b);

/** Return true to consume the event so lower-priority handlers don't see it. */
export type InputHandler = (button: DeviceButton) => boolean | void;

/** How long a button stays visibly pressed, so quick taps still show feedback. */
const MIN_PRESS_MS = 90;

interface Subscription {
  handler: InputHandler;
  priority: number;
}

interface DeviceInputState {
  pressed: Record<DeviceButton, boolean>;
  /**
   * Start pressing a button (3D buttons, keyboard and gamepad all call this).
   * Emits the event; directions repeat while held.
   */
  press: (button: DeviceButton) => void;
  release: (button: DeviceButton) => void;
  /** Register a handler. Higher priority runs first. Returns an unsubscribe fn. */
  subscribe: (handler: InputHandler, priority?: number) => () => void;
}

const idle = Object.fromEntries(
  DEVICE_BUTTONS.map((b) => [b, false]),
) as Record<DeviceButton, boolean>;

export const useDeviceInput = create<DeviceInputState>((set) => {
  let subscriptions: Subscription[] = [];
  const pressedAt: Partial<Record<DeviceButton, number>> = {};
  /** Logical hold state; `pressed` (visual) may lag behind it by MIN_PRESS_MS. */
  const held = new Set<DeviceButton>();
  const releaseTimers: Partial<Record<DeviceButton, ReturnType<typeof setTimeout>>> = {};
  const timers: Partial<Record<DeviceButton, ReturnType<typeof setTimeout>>> = {};

  const dispatch = (button: DeviceButton) => {
    for (const { handler } of subscriptions) {
      if (handler(button) === true) return;
    }
  };

  const stopTimer = (button: DeviceButton) => {
    clearTimeout(timers[button]);
    clearInterval(timers[button]);
    delete timers[button];
  };

  return {
    pressed: idle,

    press: (button) => {
      if (held.has(button)) return; // already held (e.g. key + pointer)
      held.add(button);
      clearTimeout(releaseTimers[button]);
      pressedAt[button] = performance.now();
      set((s) => ({ pressed: { ...s.pressed, [button]: true } }));
      useDeviceState.getState().markInteracted();
      dispatch(button);

      if (isDirection(button)) {
        timers[button] = setTimeout(() => {
          timers[button] = setInterval(() => dispatch(button), INPUT.repeatIntervalMs);
        }, INPUT.repeatDelayMs);
      }
    },

    release: (button) => {
      if (!held.delete(button)) return;
      stopTimer(button);
      const elapsed = performance.now() - (pressedAt[button] ?? 0);
      const done = () => set((s) => ({ pressed: { ...s.pressed, [button]: false } }));
      if (elapsed >= MIN_PRESS_MS) return done();
      releaseTimers[button] = setTimeout(done, MIN_PRESS_MS - elapsed);
    },

    subscribe: (handler, priority = 0) => {
      const sub = { handler, priority };
      subscriptions = [...subscriptions, sub].sort((a, b) => b.priority - a.priority);
      return () => {
        subscriptions = subscriptions.filter((s) => s !== sub);
      };
    },
  };
});
