"use client";

import { type ComponentProps, useState } from "react";
import { spriteSources } from "@/lib/sprites";

interface Props extends Omit<ComponentProps<"img">, "src"> {
  dexId: number;
  shiny?: boolean;
  /** Animated image of the regular look; pass it to show the Pokémon animated. */
  animated?: string | null;
}

/** A Pokémon's sprite, shiny or not; moves on to the next source when one fails to load. */
export function PetSprite({ dexId, shiny = false, animated = null, alt = "", ...img }: Props) {
  const sources = spriteSources(dexId, { shiny, animated });
  const key = sources.join("|");
  const [failed, setFailed] = useState({ key, count: 0 });
  const count = failed.key === key ? failed.count : 0;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...img}
      key={`${key}#${count}`}
      src={sources[Math.min(count, sources.length - 1)]}
      alt={alt}
      draggable={false}
      onError={() => count < sources.length - 1 && setFailed({ key, count: count + 1 })}
    />
  );
}
