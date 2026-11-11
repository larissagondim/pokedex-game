"use client";

import { ContactShadows, Environment } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { BODY, CAMERA, LIGHTS } from "./device.config";
import { CameraRig } from "./CameraRig";
import { Device } from "./Device";
import { DeviceModelProvider } from "./ModelPart";

/** Transparent canvas (the page provides the light/dark background). */
export default function DeviceScene() {
  return (
    <Canvas camera={{ fov: CAMERA.fov, position: [-3, 0, 40], near: 1, far: 200 }} dpr={[1, 2]} gl={{ alpha: true }}>
      <ambientLight intensity={LIGHTS.ambient} />
      <directionalLight position={LIGHTS.key.position} intensity={LIGHTS.key.intensity} />
      {/* Cool rim light from behind: outlines the edges and the hinge barrel. */}
      <directionalLight position={LIGHTS.rim.position} intensity={LIGHTS.rim.intensity} color={LIGHTS.rim.color} />
      <Suspense fallback={null}>
        <Environment preset="city" environmentIntensity={LIGHTS.environment} />
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
