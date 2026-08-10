"use client";

import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { formatEth } from "@/lib/format";

/** Trims trailing zeros so `0.010000` reads as `0.01` — mirrors lib/format. */
function trim(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "");
}

/**
 * An ETH amount that eases toward its new value instead of snapping — the
 * house numbers visibly move as Digs land. Respects prefers-reduced-motion
 * by rendering the final value directly.
 */
export function AnimatedEth({ wei, decimals = 5 }: { wei: bigint | undefined; decimals?: number }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState<string>("—");
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (wei === undefined) return;
    const target = Number(wei) / 1e18;

    // First sample or reduced motion: render the value as-is, no tween.
    if (reduceMotion || previous.current === null) {
      previous.current = target;
      setDisplay(formatEth(wei, decimals));
      return;
    }

    const controls = animate(previous.current, target, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (value) => setDisplay(trim(value.toFixed(decimals))),
    });
    previous.current = target;
    return () => controls.stop();
  }, [wei, decimals, reduceMotion]);

  return <span className="tabular-nums">{display}</span>;
}

/** A whole-number counter with the same easing behaviour. */
export function AnimatedInt({ value }: { value: bigint | undefined }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState<string>("—");
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (value === undefined) return;
    const target = Number(value);

    if (reduceMotion || previous.current === null) {
      previous.current = target;
      setDisplay(target.toLocaleString("en-US"));
      return;
    }

    const controls = animate(previous.current, target, {
      duration: 0.9,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v).toLocaleString("en-US")),
    });
    previous.current = target;
    return () => controls.stop();
  }, [value, reduceMotion]);

  return <span className="tabular-nums">{display}</span>;
}
