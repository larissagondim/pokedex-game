"use client";

import { CameraControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import { useEffect, useRef } from "react";
import { Box3, MathUtils, Vector3 } from "three";
import { useCompactLayout } from "@/hooks/useDeviceLayout";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { type DevicePhase, isLidOpen, isZoomedIn, useDeviceState } from "@/stores/deviceState";
import { SCREEN_HALF, BODY, CAMERA, GAP, HINGE, SCREEN_CENTER } from "./device.config";

const { ACTION } = CameraControlsImpl;
const { width: W, height: H, depth: D } = BODY;

// How far the open lid (screen half) leans toward the viewer.
const openLean = Math.sin(MathUtils.degToRad(180 - HINGE.openDeg)) * W;
const screenZ = SCREEN_HALF.bezel.raise - SCREEN_HALF.screen.recess;

type View = "closed" | "open" | "compactOpen" | "zoomed";

// World-space boxes the camera frames for each view.
const BOXES: Record<View, Box3> = {
  closed: new Box3(new Vector3(0, -H / 2, -D), new Vector3(W, H / 2, GAP + D)),
  open: new Box3(new Vector3(-W, -H / 2, -D), new Vector3(W, H / 2, openLean)),
  // Phones: just the flat screen half, which carries all the controls.
  compactOpen: new Box3(new Vector3(-W, -H / 2, -D), new Vector3(0, H / 2, 0.3)),
  // Zoom lays the lid flat, so the screen box is its layout box.
  zoomed: new Box3(
    new Vector3(SCREEN_CENTER.x - SCREEN_HALF.screen.width / 2, SCREEN_CENTER.y - SCREEN_HALF.screen.height / 2, screenZ),
    new Vector3(SCREEN_CENTER.x + SCREEN_HALF.screen.width / 2, SCREEN_CENTER.y + SCREEN_HALF.screen.height / 2, screenZ),
  ),
};

const viewFor = (p: DevicePhase, compact: boolean): View =>
  isZoomedIn(p) ? "zoomed" : isLidOpen(p) ? (compact ? "compactOpen" : "open") : "closed";

/**
 * Drag to rotate within polar/azimuth limits. No wheel/pinch zoom except in
 * zoom mode, where rotation is locked and the camera fits the main screen.
 */
export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const compact = useCompactLayout();
  const view = useDeviceState((s) => viewFor(s.phase, compact));
  const viewResetNonce = useDeviceState((s) => s.viewResetNonce);
  const reducedMotion = useReducedMotion();
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  // Any drag stops the idle sway.
  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    const onStart = () => useDeviceState.getState().markInteracted();
    controls.addEventListener("controlstart", onStart);
    return () => controls.removeEventListener("controlstart", onStart);
  }, []);

  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    const zoomed = view === "zoomed";
    // On phones a finger on a button must not turn the device: no rotation.
    const locked = zoomed || compact;

    controls.mouseButtons.left = locked ? ACTION.NONE : ACTION.ROTATE;
    controls.mouseButtons.middle = ACTION.NONE;
    controls.mouseButtons.right = ACTION.NONE;
    controls.mouseButtons.wheel = zoomed ? ACTION.DOLLY : ACTION.NONE;
    controls.touches.one = locked ? ACTION.NONE : ACTION.TOUCH_ROTATE;
    controls.touches.two = zoomed ? ACTION.TOUCH_DOLLY : ACTION.NONE;
    controls.touches.three = ACTION.NONE;
    controls.minDistance = zoomed ? 3 : 1;
    controls.maxDistance = zoomed ? 40 : Infinity;
    controls.smoothTime = reducedMotion ? 0 : CAMERA.smoothTime;

    const pad = CAMERA.padding[view];
    const animate = !reducedMotion;
    const phaseAtStart = useDeviceState.getState().phase;
    // fitToBox snaps to the nearest 90° view, so face the front first.
    Promise.all([
      controls.rotateTo(0, Math.PI / 2, animate),
      controls.fitToBox(BOXES[view], animate, { paddingTop: pad, paddingBottom: pad, paddingLeft: pad, paddingRight: pad }),
    ]).then(() => {
      if (phaseAtStart === "ZOOMING_IN" || phaseAtStart === "ZOOMING_OUT") {
        useDeviceState.getState().finish(phaseAtStart);
      }
    });
  }, [view, compact, viewResetNonce, reducedMotion, width, height]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minPolarAngle={CAMERA.minPolarAngle}
      maxPolarAngle={CAMERA.maxPolarAngle}
      minAzimuthAngle={CAMERA.minAzimuthAngle}
      maxAzimuthAngle={CAMERA.maxAzimuthAngle}
    />
  );
}
