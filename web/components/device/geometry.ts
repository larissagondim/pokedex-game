import { useMemo } from "react";
import { ExtrudeGeometry, Path, Shape } from "three";

interface Corners {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/** Traces a rectangle centered at (cx, cy) with per-corner radii. */
function traceRoundedRect<T extends Path>(path: T, cx: number, cy: number, w: number, h: number, r: Corners) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  path.moveTo(x + r.bl, y);
  path.lineTo(x + w - r.br, y);
  if (r.br) path.quadraticCurveTo(x + w, y, x + w, y + r.br);
  path.lineTo(x + w, y + h - r.tr);
  if (r.tr) path.quadraticCurveTo(x + w, y + h, x + w - r.tr, y + h);
  path.lineTo(x + r.tl, y + h);
  if (r.tl) path.quadraticCurveTo(x, y + h, x, y + h - r.tl);
  path.lineTo(x, y + r.bl);
  if (r.bl) path.quadraticCurveTo(x, y, x + r.bl, y);
  return path;
}

const all = (r: number): Corners => ({ tl: r, tr: r, br: r, bl: r });

/** Extrudes `shape` to `depth` (bevel included) and centers it on the origin. */
function extrude(shape: Shape, depth: number, bevel: number) {
  const geometry = new ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 16,
  });
  geometry.center();
  return geometry;
}

/**
 * A slab with large rounded corners in the XY plane and a small bevel on the
 * front/back edges, centered on the origin. Its flat caps have exact ±Z
 * normals, which the cover click detection relies on.
 */
export function roundedSlab(width: number, height: number, depth: number, cornerRadius: number, bevel = Math.min(0.03, depth / 3)) {
  const w = width - 2 * bevel;
  const h = height - 2 * bevel;
  const r = Math.max(0.001, Math.min(cornerRadius - bevel, w / 2, h / 2));
  return extrude(traceRoundedRect(new Shape(), 0, 0, w, h, all(r)), depth, bevel);
}

/** Rounded rectangle frame with a rectangular window (no bevel). */
export function roundedFrame(width: number, height: number, depth: number, radius: number, innerWidth: number, innerHeight: number, innerRadius = 0.04) {
  const shape = traceRoundedRect(new Shape(), 0, 0, width, height, all(radius));
  shape.holes.push(traceRoundedRect(new Path(), 0, 0, innerWidth, innerHeight, all(innerRadius)));
  return extrude(shape, depth, 0);
}

/** Memoizes a geometry builder on the values of its (primitive) arguments. */
function useGeometry<A extends (number | undefined)[]>(build: (...args: A) => ExtrudeGeometry, args: A) {
  const key = args.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => build(...args), [build, key]);
}

export const useRoundedSlab = (...args: Parameters<typeof roundedSlab>) => useGeometry(roundedSlab, args);

export const useRoundedFrame = (...args: Parameters<typeof roundedFrame>) => useGeometry(roundedFrame, args);
