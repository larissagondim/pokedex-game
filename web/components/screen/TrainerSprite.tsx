import { useMemo } from "react";
import { type Appearance, SPRITE_H, SPRITE_W, spritePalette, spriteRows } from "@/lib/trainer";

interface Props {
  appearance: Appearance;
  /** Screen pixels per sprite pixel. */
  scale: number;
  className?: string;
}

/** The trainer's pixel sprite as an SVG (one rect per horizontal run of a color). */
export function TrainerSprite({ appearance, scale, className }: Props) {
  const runs = useMemo(() => {
    const palette = spritePalette(appearance);
    const out: { x: number; y: number; w: number; fill: string }[] = [];
    spriteRows(appearance).forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        let end = x + 1;
        while (end < row.length && row[end] === ch) end++;
        if (ch !== ".") out.push({ x, y, w: end - x, fill: palette[ch] });
        x = end;
      }
    });
    return out;
  }, [appearance]);

  return (
    <svg
      className={className}
      width={SPRITE_W * scale}
      height={SPRITE_H * scale}
      viewBox={`0 0 ${SPRITE_W} ${SPRITE_H}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Trainer sprite"
    >
      {runs.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </svg>
  );
}
