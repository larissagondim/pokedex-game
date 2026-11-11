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
  /** The barrel runs the full height, split into knuckles that alternate base / lid / base... */
  knuckles: 5,
  /** Gap between neighbouring knuckles. */
  knuckleGap: 0.04,
  /** Gap between the barrel ends and the body's top/bottom edge. */
  endInset: 0.08,
  /** Metal pin caps at both barrel ends. */
  pinCap: { diameter: 0.22, height: 0.03 },
  /** Plate screwed to each half's inner face under its knuckles. */
  leaf: {
    /** How far the plate reaches onto the half from the hinge edge (clear of the screen bezel at 0.4). */
    reach: 0.35,
    /** Where it starts, measured from the hinge edge (clears the edge bevel). */
    start: 0.02,
    thickness: 0.05,
    /** Inset from the knuckle's ends. */
    endInset: 0.12,
    radius: 0.06,
    bevel: 0.01,
  },
  /** Screw heads on the leaves: two per leaf, slotted. */
  screw: { diameter: 0.12, height: 0.02, slotWidth: 0.02, fromEdge: 0.27, fromEnd: 0.32 },
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
} as const;

/** Shell finish shared by both halves. */
export const SHELL = {
  /** Parting-line grooves on the outer side wall, as z offsets from the inner face. */
  seams: { z: [-0.24, -0.46], width: 0.02, inset: 0.7 },
  /** Bump noise on the plastic: texture size (px), bump depth and roughness spread. */
  texture: { size: 128, repeat: 3, bumpScale: 0.004, roughnessSpread: 0.08 },
  /** Corner screws on the outer faces (back of the base, cover of the lid). */
  screws: { diameter: 0.16, height: 0.025, slotWidth: 0.025, inset: 0.45 },
  /** Engraved lettering: offset of the darker copy that reads as its wall, at `engraveReference` font size (scales with it). */
  engraveOffset: 0.015,
  engraveReference: 0.42,
  /** Brand engraved at the bottom of the controls half. */
  brand: { text: "POKÉDEX GAME", size: 0.3, fromBottom: 0.8, letterSpacing: 0.1 },
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
  led: {
    diameter: 0.2,
    gapAbove: 0.3,
    /** Ring of dark plastic the LED sits in: width and height. */
    bezel: 0.06,
    bezelHeight: 0.02,
    /** Steady glow when open; a quick blink on A. */
    intensity: 2.2,
    blinkS: 0.36,
    blinkHz: 16,
    /** Slow pulse while a tab needs attention (also while closed), and in battle. */
    pulseHz: 0.8,
    battleHz: 1.6,
    /** Lowest intensity of a pulse, as a share of `intensity`. */
    pulseFloor: 0.15,
  },
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
    /** Recessed well around each pill: margin and depth. */
    well: 0.07,
    wellDepth: 0.02,
    /** Center height above the bottom edge. */
    fromBottom: 2.0,
    gap: 0.4,
  },
  cover: {
    feet: { diameter: 0.3, height: 0.05, inset: 0.8 },
    name: "POKÉDEX GAME",
    nameSize: 0.42,
    nameSpacing: 0.06,
  },
} as const;

export const BUTTON = {
  travel: 0.09,
  pressS: 0.06,
  hoverEmissive: 0.18,
  /** A pressed cap darkens to this share of its color. */
  pressedShade: 0.78,
} as const;

/** Scene lights (key from the top right, a cool rim from behind on the left). */
export const LIGHTS = {
  ambient: 0.25,
  key: { position: [6, 10, 12] as const, intensity: 1.2 },
  rim: { position: [-10, 4, -8] as const, intensity: 0.7, color: "#CFE0FF" },
  environment: 0.35,
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
  padding: { closed: 1.8, open: 1.8, zoomed: 0.08, compactOpen: 0.3 },
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
  /** Wall of lettering engraved into the red shell. */
  engraveWall: "#6E0919",
  metal: "#9A9AA6",
  ledWhite: "#FFFFFF",
  ledBattle: "#FF3B3B",
  ledAlert: "#FFB020",
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

// Control layouts ----------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

/** Where the D-pad, A/B and MENU/ZOOM sit, in some half's inner frame. */
export interface ControlLayout {
  /** Size of every control relative to the config above. */
  scale: number;
  dpad: Point;
  a: Point;
  b: Point;
  menu: Point;
  zoom: Point;
}

const pillOffset = (CONTROL_HALF.pill.width + CONTROL_HALF.pill.gap) / 2;

/** Desktop: controls on the right half (x ∈ [0, WIDTH]). */
export const SPLIT_CONTROLS: ControlLayout = {
  scale: 1,
  dpad: { x: CONTROL_HALF.dpad.x, y: CONTROL_HALF.dpad.y },
  a: CONTROL_HALF.action.a,
  b: CONTROL_HALF.action.b,
  menu: { x: BODY.width / 2 - pillOffset, y: PILL_Y },
  zoom: { x: BODY.width / 2 + pillOffset, y: PILL_Y },
};

/**
 * Phones (portrait, touch): every control on the screen half, under the
 * screen (x ∈ [-WIDTH, 0]), so one half fills the display.
 */
export const COMPACT_CONTROLS: ControlLayout = {
  scale: 0.8,
  dpad: { x: -4.5, y: -1.8 },
  a: { x: -1.2, y: -1.3 },
  b: { x: -2.3, y: -2.2 },
  menu: { x: -4.0, y: -3.6 },
  zoom: { x: -2.0, y: -3.6 },
};

/** Smaller speaker grill for the compact layout (under the pills). */
export const COMPACT_SPEAKER = { x: -BODY.width / 2, y: -4.35, slits: 3, width: 0.9 } as const;

/**
 * drei <Html transform> renders 400 / distanceFactor CSS px per world unit.
 * This picks the factor that maps `cssWidth` px exactly onto `worldWidth`.
 */
export const htmlDistanceFactor = (worldWidth: number, cssWidth: number) =>
  (400 * worldWidth) / cssWidth;
