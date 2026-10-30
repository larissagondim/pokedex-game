"use client";

import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Reveals `text` one character at a time. Instant under reduced motion.
 * Restarts when the text changes, or when `restartKey` changes (to replay the
 * same message twice in a row).
 */
export function useTypewriter(text: string | null, restartKey: unknown = text, msPerChar = 28) {
  const reducedMotion = useReducedMotion();
  const [count, setCount] = useState(0);
  const length = text?.length ?? 0;

  const [prev, setPrev] = useState({ text, restartKey });
  if (text !== prev.text || restartKey !== prev.restartKey) {
    setPrev({ text, restartKey });
    setCount(0);
  }

  const shown = reducedMotion ? length : Math.min(count, length);
  const done = shown >= length;

  useEffect(() => {
    if (done || reducedMotion) return;
    const id = setInterval(() => setCount((c) => c + 1), msPerChar);
    return () => clearInterval(id);
  }, [done, reducedMotion, msPerChar, text, restartKey]);

  const finish = useCallback(() => setCount(length), [length]);

  return { visible: text?.slice(0, shown) ?? "", done, finish };
}
