"use client";

import { CameraControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import CameraControlsImpl from "camera-controls";
import { useEffect, useRef } from "react";
import { Box3, MathUtils, Vector3 } from "three";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useDeviceState } from "@/stores/deviceState";
import { HINGE, MAIN_SCREEN, SHELL } from "./layout";

const { ACTION } = CameraControlsImpl;

const { width: W, height: H, depth: D, gap: G } = SHELL;
// How far the open screen half leans toward the viewer.
const openTilt = Math.sin(MathUtils.degToRad(180 - HINGE.openDeg)) * W;

// World-space boxes the camera frames in each state.
const BOXES = {
  closed: new Box3(new Vector3(0, -H / 2, -D), new Vector3(W, H / 2, G + D)),
  open: new Box3(new Vector3(-W, -H / 2, -D), new Vector3(W, H / 2, openTilt)),
  // Zoom lays the device flat, so the screen's world box is its layout box.
  zoomed: new Box3(
    new Vector3(MAIN_SCREEN.x - MAIN_SCREEN.width / 2, MAIN_SCREEN.y - MAIN_SCREEN.height / 2, MAIN_SCREEN.bezelDepth),
    new Vector3(MAIN_SCREEN.x + MAIN_SCREEN.width / 2, MAIN_SCREEN.y + MAIN_SCREEN.height / 2, MAIN_SCREEN.bezelDepth + 0.002),
  ),
};

const PADDING = { closed: 0.35, open: 0.25, zoomed: 0.01 };

const FREE_LIMITS = {
  minPolarAngle: Math.PI / 2 - 0.7,
  maxPolarAngle: Math.PI / 2 + 0.6,
  minAzimuthAngle: -1.0,
  maxAzimuthAngle: 1.0,
};

/**
 * Drag to rotate within limits; no wheel/pinch zoom except in zoom mode, where
 * rotation is locked and the camera is fitted to the main screen.
 */
export function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const open = useDeviceState((s) => s.open);
  const zoomed = useDeviceState((s) => s.zoomed);
  const reducedMotion = useReducedMotion();
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);

  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;

    controls.mouseButtons.left = zoomed ? ACTION.NONE : ACTION.ROTATE;
    controls.mouseButtons.middle = ACTION.NONE;
    controls.mouseButtons.right = ACTION.NONE;
    controls.mouseButtons.wheel = zoomed ? ACTION.DOLLY : ACTION.NONE;
    controls.touches.one = zoomed ? ACTION.NONE : ACTION.TOUCH_ROTATE;
    controls.touches.two = zoomed ? ACTION.TOUCH_DOLLY : ACTION.NONE;
    controls.touches.three = ACTION.NONE;
    controls.minDistance = zoomed ? 0.5 : 0.1;
    controls.maxDistance = zoomed ? 8 : Infinity;

    const state = zoomed ? "zoomed" : open ? "open" : "closed";
    const padding = PADDING[state];
    const animate = !reducedMotion;
    // fitToBox snaps to the nearest 90° view, so face the front first.
    controls.rotateTo(0, Math.PI / 2, animate);
    controls.fitToBox(BOXES[state], animate, {
      paddingTop: padding,
      paddingBottom: padding,
      paddingLeft: padding,
      paddingRight: padding,
    });
  }, [open, zoomed, reducedMotion, width, height]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      smoothTime={0.4}
      draggingSmoothTime={0.12}
      {...FREE_LIMITS}
    />
  );
}
