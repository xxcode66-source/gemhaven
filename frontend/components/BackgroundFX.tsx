"use client";

import { useMemo } from "react";

/**
 * Ambient cavern atmosphere: drifting dust motes and two slow lamp pools.
 *
 * Purely decorative, so it is `aria-hidden` and pointer-transparent. The
 * animations are CSS-only, which means the `prefers-reduced-motion` block in
 * globals.css freezes them without any JS involvement.
 */
export function BackgroundFX() {
  // Deterministic positions: a seeded walk rather than Math.random, otherwise
  // the server and client markup disagree and React logs a hydration mismatch.
  const motes = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => {
        const seed = (i * 2654435761) % 10007;
        return {
          left: (seed % 100),
          top: ((seed >> 3) % 100),
          size: 1 + (seed % 3),
          delay: (seed % 90) / 10,
          duration: 18 + (seed % 14),
          opacity: 0.12 + ((seed >> 5) % 26) / 100,
        };
      }),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Lamp pools — the light sources the cavern is lit by. */}
      <div
        className="absolute -left-40 -top-40 h-[38rem] w-[38rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(62,230,196,0.10), transparent 68%)" }}
      />
      <div
        className="absolute -right-52 top-24 h-[34rem] w-[34rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(167,139,250,0.10), transparent 68%)" }}
      />
      <div
        className="absolute bottom-[-14rem] left-1/3 h-[30rem] w-[30rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(244,114,182,0.07), transparent 70%)" }}
      />

      {/* Rock strata: faint diagonal seams so the backdrop is not flat. */}
      <div
        className="absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(118deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 84px)",
        }}
      />

      {motes.map((mote, i) => (
        <span
          key={i}
          className="absolute animate-drift rounded-full bg-white"
          style={{
            left: `${mote.left}%`,
            top: `${mote.top}%`,
            width: `${mote.size}px`,
            height: `${mote.size}px`,
            opacity: mote.opacity,
            animationDelay: `${mote.delay}s`,
            animationDuration: `${mote.duration}s`,
          }}
        />
      ))}

      {/* Vignette pulls focus to the cavern wall in the centre. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 40%, transparent 42%, rgba(5,6,8,0.85) 100%)" }}
      />
    </div>
  );
}
