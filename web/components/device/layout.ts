/**
 * Single source of truth for the device's measurements (world units, 1 = 100px
 * of the reference design). Procedural parts and the camera rig both read from
 * here, so a .glb modelled to these numbers drops in without touching logic.
 *
 * Coordinates:
 * - The hinge axis is vertical, at x = 0. The left half (screen) swings around
 *   it; the right half (controls) is fixed and spans x ∈ [0, WIDTH].
 * - z = 0 is the inner face of both halves when the device is open flat.
 * - Each half's own frame has its inner face at local z = 0, body going to -z.
 */
export const SHELL = {
  width: 1.5,
  height: 2.4,
  depth: 0.22,
  radius: 0.22,
  bevel: 0.04,
  /** Space between the halves when closed, so buttons don't clip the screen. */
  gap: 0.1,
} as const;

export const HINGE = {
  /** Rotation of the left half, in degrees: 0 closed, 170 open. */
  openDeg: 170,
  /** Zoom mode lays the device flat so the screen faces the camera head-on. */
  zoomDeg: 180,
  /** Damping speed for the hinge animation (higher = snappier). */
  lambda: 6,
} as const;

// Left half, in its inner-face frame (x ∈ [-WIDTH, 0]).
export const MAIN_SCREEN = {
  x: -SHELL.width / 2,
  y: 0.36,
  width: 1.16,
  height: 0.87, // 4:3
  bezel: 0.07,
  bezelDepth: 0.035,
  /** CSS pixel size of the DOM screen. Keep the same 4:3 ratio. */
  cssWidth: 640,
  cssHeight: 480,
} as const;

// Right half, in its inner-face frame (x ∈ [0, WIDTH]).
export const SECONDARY_SCREEN = {
  x: 0.75,
  y: 0.86,
  width: 1.2,
  height: 0.28,
  depth: 0.03,
  cssWidth: 480,
  cssHeight: 112,
} as const;

export const CONTROLS = {
  dpad: { x: 0.44, y: 0.1, radius: 0.32 },
  a: { x: 1.17, y: 0.26, radius: 0.115 },
  b: { x: 0.93, y: -0.02, radius: 0.115 },
  menu: { x: 0.5, y: -0.58 },
  zoom: { x: 1.0, y: -0.58 },
  pill: { radius: 0.05, length: 0.24 },
  /** How far a button sinks when pressed. */
  travel: 0.018,
} as const;

/**
 * drei <Html transform> renders 400 / distanceFactor CSS px per world unit.
 * This picks the factor that maps `cssWidth` px exactly onto `worldWidth`.
 */
export const htmlDistanceFactor = (worldWidth: number, cssWidth: number) =>
  (400 * worldWidth) / cssWidth;

export const FONT_URL = "/fonts/PixelifySans.ttf";
