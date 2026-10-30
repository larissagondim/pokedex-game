/**
 * Every measurement, color and timing of the device lives here.
 * Units: 1 scene unit ≈ 1 cm.
 *
 * Coordinate frames
 * - World: the hinge axis is vertical at x = 0. The controls half (right) is
 *   fixed and spans x ∈ [0, WIDTH]. The screen half (left) is the lid: it
 *   swings around the hinge and opens to the left like a book cover. When
 *   open flat, both inner faces sit on z = 0 and face +z (the camera).
 * - Each half's "inner frame" has its inner face at z = 0 with the body going
 *   to -z. Screen half frame x ∈ [-WIDTH, 0]; controls half x ∈ [0, WIDTH].
 * - The lid pivots on an axis half a gap in front of the inner faces, so the
 *   closed halves end up exactly `GAP` apart (room for buttons and bezel).
 */

export const BODY = {
  width: 6,
  height: 10,
  depth: 0.7,
  /** Corner radius seen from the front. */
  cornerRadius: 0.6,
  /** Rounding of the front/back edges (must be < depth / 2). */
  edgeBevel: 0.12,
} as const;

/** Graphite strip along each half's hinge edge (hides the seam groove). */
export const SEAM = {
  width: 0.11,
  /** How far it pokes past the hinge edge, into the groove. */
  overlap: 0.01,
  depth: 0.59,
  /** Distance below the inner face. */
  inset: 0.01,
} as const;

export const HINGE = {
  diameter: 0.5,
  /** Two short knuckles at the top and bottom ends; the middle stays hidden. */
  knuckleLength: 0.55,
  /** Gap between each knuckle and the body's top/bottom edge. */
  endInset: 0.08,
  openDeg: 172,
  /** Zoom lays the lid flat so the screen faces the camera head-on. */
  zoomDeg: 180,
  /** Spring for the lid: stiffness (1/s²) and damping ratio (<1 overshoots). */
  stiffness: 60,
  dampingRatio: 0.75,
  /** The screen powers off this long before the lid starts closing. */
  closeDelayS: 0.25,
} as const;

/** Space between the halves when closed; equals the hinge diameter. */
export const GAP = HINGE.diameter;

export const SCREEN_HALF = {
  screen: {
    width: 4.8,
    height: 3.6, // 4:3
    /** Distance from the body's top edge to the screen's top edge. */
    topOffset: 0.9,
    /** The screen plane sits this far below the bezel surface. */
    recess: 0.02,
    glassOpacity: 0.08,
    /** CSS pixel size of the DOM interface (same 4:3 ratio). */
    cssWidth: 640,
    cssHeight: 480,
  },
  bezel: { width: 5.2, height: 4.0, radius: 0.3, raise: 0.05 },
  indicator: { width: 1.6, height: 0.12, raise: 0.02, gapBelowBezel: 0.45 },
  speaker: {
    slits: 6,
    slitWidth: 1.2,
    slitHeight: 0.08,
    spacing: 0.18,
    /** Grill center, measured from the inner face's right and bottom edges. */
    fromRight: 1.4,
    fromBottom: 1.4,
  },
  /** Seam grooves on the outer left side, as z offsets from the inner face. */
  seams: { z: [-0.24, -0.46], width: 0.02, inset: 0.7 },
} as const;

export const CONTROL_HALF = {
  secondary: {
    width: 4.6,
    height: 1.0,
    radius: 0.2,
    depth: 0.05,
    topOffset: 0.8,
    fontSize: 0.42,
    padding: 0.25,
    /** Marquee speed for names that don't fit, in units per second. */
    scrollSpeed: 0.8,
    emissiveOn: 0.18,
  },
  led: { diameter: 0.2, gapAbove: 0.3 },
  dpad: {
    diameter: 2.4,
    raise: 0.15,
    x: 1.75,
    y: -0.5,
    centerDiameter: 0.8,
    tiltDeg: 6,
  },
  action: {
    diameter: 1.0,
    height: 0.2,
    a: { x: 5.0, y: 0.15 },
    b: { x: 3.8, y: -1.05 },
  },
  pill: {
    width: 1.6,
    height: 0.5,
    depth: 0.12,
    /** Center height above the bottom edge. */
    fromBottom: 2.0,
    gap: 0.4,
  },
  cover: {
    feet: { diameter: 0.3, height: 0.05, inset: 0.8 },
    name: "POKÉDEX GAME",
    nameSize: 0.42,
  },
} as const;

export const BUTTON = {
  travel: 0.06,
  pressS: 0.08,
  hoverEmissive: 0.18,
} as const;

export const INPUT = {
  repeatDelayMs: 300,
  repeatIntervalMs: 90,
  /** Pointer travel (px) above which a click counts as the end of a drag. */
  dragTolerancePx: 5,
} as const;

export const IDLE = {
  floatAmplitude: 0.15,
  floatSpeed: 1.1,
  swayRad: 0.35,
  swaySpeed: 0.35,
} as const;

export const CAMERA = {
  fov: 35,
  /** camera-controls smoothTime; ~0.25 s gives transitions of about 0.8 s. */
  smoothTime: 0.25,
  /** Generous margins so the device stays in frame when rotated. */
  padding: { closed: 1.8, open: 1.8, zoomed: 0.08 },
  minPolarAngle: Math.PI / 2 - 0.7,
  maxPolarAngle: Math.PI / 2 + 0.35,
  minAzimuthAngle: -1.0,
  maxAzimuthAngle: 1.0,
} as const;

export const COLORS = {
  red: "#C8102E",
  redDark: "#A50D26",
  white: "#FFFFFF",
  graphite: "#1E1E24",
  grayLight: "#F6F6F8",
  gray: "#B9B9C2",
  engrave: "#D2D2DA",
  screenOff: "#050507",
  secondaryText: "#9EF0A5",
} as const;

export const FONT_URL = "/fonts/PixelifySans.ttf";

/** z-index budget for drei's <Html>: canvas at HTML_Z_RANGE / 2, DOM below. */
export const HTML_Z_RANGE = 100;
/** Page overlays (HUD) sit above the canvas. Keep in sync with experience.module.css. */
export const HUD_Z_INDEX = HTML_Z_RANGE + 1;

// Derived positions -------------------------------------------------------

const top = BODY.height / 2;
const bottom = -BODY.height / 2;

/** Main screen center in the screen half's inner frame. */
export const SCREEN_CENTER = {
  x: -BODY.width / 2,
  y: top - SCREEN_HALF.screen.topOffset - SCREEN_HALF.screen.height / 2,
} as const;

/** Secondary screen center in the controls half's inner frame. */
export const SECONDARY_CENTER = {
  x: BODY.width / 2,
  y: top - CONTROL_HALF.secondary.topOffset - CONTROL_HALF.secondary.height / 2,
} as const;

export const PILL_Y = bottom + CONTROL_HALF.pill.fromBottom;

/**
 * drei <Html transform> renders 400 / distanceFactor CSS px per world unit.
 * This picks the factor that maps `cssWidth` px exactly onto `worldWidth`.
 */
export const htmlDistanceFactor = (worldWidth: number, cssWidth: number) =>
  (400 * worldWidth) / cssWidth;
