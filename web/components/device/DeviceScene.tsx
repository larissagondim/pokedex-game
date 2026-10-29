"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { CameraRig } from "./CameraRig";
import { Device } from "./Device";
import { DeviceModelProvider } from "./ModelPart";

export default function DeviceScene() {
  return (
    <Canvas camera={{ fov: 35, position: [0.75, 0, 8] }} dpr={[1, 2]}>
      <color attach="background" args={["#14141a"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 6]} intensity={1.7} />
      <directionalLight position={[-4, -2, 3]} intensity={0.45} />
      <Suspense fallback={null}>
        <DeviceModelProvider>
          <Device />
        </DeviceModelProvider>
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}
