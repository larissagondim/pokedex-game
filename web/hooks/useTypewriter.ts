"use client";

import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

/** Reveals `text` one character at a time. Instant under reduced motion. */
export function useTypewriter(text: string | null, msPerChar = 28) {
  const reducedMotion = useReducedMotion();
  const [count, setCount] = useState(0);
  const length = text?.length ?? 0;

  // Restart whenever the text changes.
  const [prevText, setPrevText] = useState(text);
  if (text !== prevText) {
    setPrevText(text);
    setCount(0);
  }

  const shown = reducedMotion ? length : Math.min(count, length);
  const done = shown >= length;

  useEffect(() => {
    if (done || reducedMotion) return;
    const id = setInterval(() => setCount((c) => c + 1), msPerChar);
    return () => clearInterval(id);
  }, [done, reducedMotion, msPerChar, text]);

  const finish = useCallback(() => setCount(length), [length]);

  return { visible: text?.slice(0, shown) ?? "", done, finish };
}
