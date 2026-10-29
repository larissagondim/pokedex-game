import { useMemo } from "react";
import { ExtrudeGeometry, Shape } from "three";

/**
 * A slab with large rounded corners in the XY plane and a small bevel on the
 * edges, centered on the origin. Its flat caps have exact ±Z normals, which
 * the cover click detection relies on.
 */
export function roundedSlab(
  width: number,
  height: number,
  depth: number,
  cornerRadius: number,
  bevel = Math.min(0.03, depth / 3),
) {
  const w = width - 2 * bevel;
  const h = height - 2 * bevel;
  const r = Math.max(0.001, Math.min(cornerRadius - bevel, w / 2, h / 2));
  const x = -w / 2;
  const y = -h / 2;

  const shape = new Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  const geometry = new ExtrudeGeometry(shape, {
    depth: Math.max(0.0001, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geometry.center();
  return geometry;
}

export function useRoundedSlab(
  width: number,
  height: number,
  depth: number,
  cornerRadius: number,
  bevel?: number,
) {
  return useMemo(
    () => roundedSlab(width, height, depth, cornerRadius, bevel),
    [width, height, depth, cornerRadius, bevel],
  );
}
