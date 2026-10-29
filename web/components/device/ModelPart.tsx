"use client";

import { useGLTF } from "@react-three/drei";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Object3D } from "three";

/**
 * Set this to a .glb path (e.g. "/models/device.glb") to replace the
 * procedural geometry. Every <ModelPart name="..."> whose name matches a node
 * in the file renders that node instead of its fallback children.
 */
export const DEVICE_GLB_URL: string | null = null;

const NodesContext = createContext<Record<string, Object3D> | null>(null);

function GlbNodes({ url, children }: { url: string; children: ReactNode }) {
  const { nodes } = useGLTF(url);
  return <NodesContext.Provider value={nodes}>{children}</NodesContext.Provider>;
}

export function DeviceModelProvider({ children }: { children: ReactNode }) {
  if (!DEVICE_GLB_URL) return <>{children}</>;
  return <GlbNodes url={DEVICE_GLB_URL}>{children}</GlbNodes>;
}

/**
 * Visual slot for one piece of the device. Logic (events, animation, screen
 * anchors) lives in the parent groups, so swapping the visual is safe.
 * The node must be modelled with its origin where the fallback's origin is.
 */
export function ModelPart({ name, children }: { name: string; children: ReactNode }) {
  const node = useContext(NodesContext)?.[name];
  const clone = useMemo(() => node?.clone(), [node]);
  if (!clone) return <>{children}</>;
  return <primitive object={clone} />;
}
