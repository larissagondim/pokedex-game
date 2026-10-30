"use client";

import { ContactShadows, Environment } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { BODY, CAMERA } from "./device.config";
import { CameraRig } from "./CameraRig";
import { Device } from "./Device";
import { DeviceModelProvider } from "./ModelPart";

/** Transparent canvas (the page provides the light/dark background). */
export default function DeviceScene() {
  return (
    <Canvas camera={{ fov: CAMERA.fov, position: [-3, 0, 40], near: 1, far: 200 }} dpr={[1, 2]} gl={{ alpha: true }}>
      <ambientLight intensity={0.25} />
      <directionalLight position={[6, 10, 12]} intensity={1.2} />
      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={0.35} />
      </Suspense>
      <Suspense fallback={null}>
        <DeviceModelProvider>
          <Device />
        </DeviceModelProvider>
      </Suspense>
      <ContactShadows position={[0, -BODY.height / 2 - 0.6, 0]} scale={24} blur={2.4} far={8} opacity={0.35} resolution={256} />
      <CameraRig />
    </Canvas>
  );
}
