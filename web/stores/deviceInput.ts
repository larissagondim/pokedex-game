import { create } from "zustand";

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
  /** Emit a button event (3D buttons and keyboard both call this). */
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
  const releaseTimers: Partial<Record<DeviceButton, ReturnType<typeof setTimeout>>> = {};

  const dispatch = (button: DeviceButton) => {
    for (const { handler } of subscriptions) {
      if (handler(button) === true) return;
    }
  };

  return {
    pressed: idle,

    press: (button) => {
      clearTimeout(releaseTimers[button]);
      pressedAt[button] = performance.now();
      set((s) => ({ pressed: { ...s.pressed, [button]: true } }));
      dispatch(button);
    },

    release: (button) => {
      const elapsed = performance.now() - (pressedAt[button] ?? 0);
      const done = () =>
        set((s) => ({ pressed: { ...s.pressed, [button]: false } }));
      if (elapsed >= MIN_PRESS_MS) return done();
      clearTimeout(releaseTimers[button]);
      releaseTimers[button] = setTimeout(done, MIN_PRESS_MS - elapsed);
    },

    subscribe: (handler, priority = 0) => {
      const sub = { handler, priority };
      subscriptions = [...subscriptions, sub].sort(
        (a, b) => b.priority - a.priority,
      );
      return () => {
        subscriptions = subscriptions.filter((s) => s !== sub);
      };
    },
  };
});

