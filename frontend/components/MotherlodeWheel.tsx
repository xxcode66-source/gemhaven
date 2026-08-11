"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { BetKind, BONANZA_INDEX, type BetKindValue } from "@/lib/contracts";
import { playPick } from "@/lib/sfx";

/**
 * Four mineral families cycle around the rim and carry each slot's colour
 * (teal, violet, rose, amber).
 */
const GEM_FAMILIES = [
  { name: "Beryl", hex: "#3ee6c4", glow: "rgba(62,230,196,0.42)" },
  { name: "Amethyst", hex: "#a78bfa", glow: "rgba(167,139,250,0.42)" },
  { name: "Rhodonite", hex: "#f472b6", glow: "rgba(244,114,182,0.42)" },
  { name: "Citrine", hex: "#fbbf6a", glow: "rgba(251,191,106,0.42)" },
] as const;

function family(index: number) {
  return GEM_FAMILIES[index % GEM_FAMILIES.length] ?? GEM_FAMILIES[0];
}

/**
 * Every deposit keeps its own mineral name for flavour (aria-only on the
 * wheel — the slots are too small for labels). Names never touch the chain.
 */
const DEPOSIT_NAMES = [
  "Aquamarine", "Amethyst", "Rhodonite", "Citrine",
  "Emerald", "Iolite", "Kunzite", "Amber",
  "Heliodor", "Tanzanite", "Rhodolite", "Sunstone",
  "Goshenite", "Sugilite", "Thulite", "Fire Opal",
  "Maxixe", "Charoite", "Morganite", "Hessonite",
  "Amazonite", "Purpurite", "Rubellite", "Spessartine",
  "Turquoise", "Hackmanite", "Pink Opal", "Sphene",
  "Larimar", "Stichtite", "Tugtupite", "Zircon",
  "Paraiba", "Lepidolite", "Pezzottaite", "Golden Topaz",
] as const;

function depositName(index: number): string {
  return DEPOSIT_NAMES[index] ?? `Deposit ${index + 1}`;
}

/** Spark offsets for the strike burst around the winning slot. */
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 + (i % 2 === 0 ? 0.16 : -0.12);
  const radius = 34 + (i % 3) * 12;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
});

/** One full spin of the fast loop, in seconds. */
const SPIN_DURATION_S = 0.9;
/** Where the rim parks when the result must not point at any number. */
const VEILED_OFFSET_DEG = 137;

/** The player's own most recent verdict, surfaced only for their own Dig. */
export type DigOutcome = {
  /** The deposit picked — null for parity/All Digs; never shown for others. */
  pick: number | null;
  won: boolean;
  /** The Dig's id — keys the animations so repeat results replay them. */
  id: bigint;
};

export function MotherlodeWheel({
  gridSize,
  kind,
  selected,
  onSelect,
  outcome,
  disabled,
  digging,
}: {
  gridSize: number;
  kind: BetKindValue;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** Last resolved Dig of this wallet, for the reveal. */
  outcome: DigOutcome | null;
  /** Disables picking while a Dig is in flight. */
  disabled: boolean;
  /** True while a Dig is settling — the wheel spins while the draw stays hidden. */
  digging: boolean;
}) {
  const reduceMotion = useReducedMotion();

  const picking = kind === BetKind.Pick && !disabled;
  const step = 360 / gridSize;

  // The spin is theatre: the verdict already exists, encrypted. While a Dig
  // is in flight the rim loops fast; when it settles, a Pick strike parks the
  // chosen deposit under the pointer (win = draw equals pick, which the
  // player already knows). Anything else veils behind frosted glass instead
  // of pointing at a number the chain never revealed.
  const digStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (digging) digStartRef.current = performance.now();
  }, [digging]);

  const [restAngle, setRestAngle] = useState(0);

  const settle = useMemo(() => {
    if (digging || !outcome) return null;
    const elapsed = digStartRef.current !== null ? performance.now() - digStartRef.current : 0;
    const from = ((elapsed / (SPIN_DURATION_S * 1000)) % 1) * 360;
    const align =
      outcome.pick !== null && outcome.won
        ? (360 - outcome.pick * step) % 360
        : VEILED_OFFSET_DEG;
    return { from, to: from + 1080 + align, veiled: !(outcome.pick !== null && outcome.won) };
  }, [digging, outcome, step]);

  useEffect(() => {
    if (settle) setRestAngle(settle.to % 360);
  }, [settle]);

  const strikeIndex = outcome?.pick !== null && outcome?.pick !== undefined ? outcome.pick : null;
  const strikeWon = outcome?.won ?? false;

  return (
    <section id="cavern" aria-labelledby="cavern-heading" className="space-y-6">
      <header>
        <p className="engraved">The Motherlode wheel</p>
        <h2 id="cavern-heading" className="font-display text-2xl tracking-wide text-slate-100">
          {kind === BetKind.Pick ? "Pick a slot on the rim" : kind === BetKind.All ? "Spin the whole wheel" : "Parity spin"}
        </h2>
      </header>

      <div className="relative mx-auto aspect-square w-full max-w-[560px]">
        {/* The pointer — where a winning Pick comes to rest. */}
        <div aria-hidden className="absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-[38%]">
          <span
            className="block h-0 w-0 border-x-[11px] border-t-[18px] border-x-transparent"
            style={{
              borderTopColor: "#fbbf6a",
              filter: "drop-shadow(0 0 10px rgba(251,191,106,0.55))",
            }}
          />
        </div>

        {/* The rim. Remounts per phase so each animation starts clean. */}
        <div className={["wheel-ring absolute inset-0", !digging && settle?.veiled ? "wheel-veil" : ""].join(" ")}>
          <motion.div
            key={digging ? "spin" : settle ? `settle-${outcome?.id.toString()}` : "idle"}
            initial={reduceMotion ? false : digging ? { rotate: restAngle } : settle ? { rotate: settle.from } : false}
            animate={
              reduceMotion
                ? { rotate: 0 }
                : digging
                  ? { rotate: [restAngle, restAngle + 360] }
                  : settle
                    ? { rotate: settle.to }
                    : { rotate: restAngle }
            }
            transition={
              digging
                ? { duration: SPIN_DURATION_S, repeat: Infinity, ease: "linear" }
                : settle
                  ? { duration: reduceMotion ? 0 : 2.6, ease: [0.12, 0.72, 0.12, 1] }
                  : { duration: 0.4, ease: "easeOut" }
            }
            className="absolute inset-0"
          >
            {Array.from({ length: gridSize }, (_, index) => {
              const gem = family(index);
              const tileNumber = index + 1;
              const isSelected = selected === index && kind === BetKind.Pick;
              const isStrike = strikeIndex === index;
              const isGolden = index === BONANZA_INDEX;

              // The rim mirrors the active kind's coverage, wall-style.
              const isLit =
                kind === BetKind.All
                  ? true
                  : kind === BetKind.Even
                    ? tileNumber % 2 === 0
                    : kind === BetKind.Odd
                      ? tileNumber % 2 === 1
                      : isSelected;

              return (
                <div key={index} className="pointer-events-none absolute inset-0" style={{ transform: `rotate(${index * step}deg)` }}>
                  <div className="absolute left-1/2 top-[2%] -translate-x-1/2">
                    <div className="pointer-events-auto relative">
                      <button
                        type="button"
                        role={picking ? "radio" : undefined}
                        aria-checked={picking ? isSelected : undefined}
                        aria-label={`Deposit ${tileNumber} of ${gridSize}, ${depositName(index)}${isGolden ? " — the golden deposit" : ""}${
                          isStrike ? (strikeWon ? " — your last strike" : " — your last miss") : ""
                        }`}
                        disabled={!picking}
                        onClick={() => {
                          playPick();
                          onSelect(isSelected ? null : index);
                        }}
                        className={[
                          "facet-clip flex h-7 w-7 items-center justify-center border-0 transition-[filter,opacity,transform] duration-300 sm:h-9 sm:w-9 md:h-10 md:w-10",
                          isLit || isStrike ? "opacity-100" : "opacity-40",
                          isSelected ? "scale-110 brightness-125" : isLit ? "brightness-110" : picking ? "hover:brightness-110 hover:scale-105" : "",
                          "disabled:cursor-default",
                        ].join(" ")}
                        style={{
                          background: isGolden
                            ? "linear-gradient(155deg, rgba(251,191,106,0.5) 0%, #2a2008 46%, #0b0d12 100%)"
                            : `linear-gradient(155deg, ${gem.hex}2e 0%, #12151d 42%, #0b0d12 100%)`,
                          boxShadow: isSelected || (isStrike && strikeWon) ? `0 0 26px -4px ${isGolden ? "rgba(251,191,106,0.55)" : gem.glow}` : "none",
                        }}
                      >
                        <span
                          className="font-display text-xs leading-none sm:text-sm md:text-base"
                          style={{ color: isSelected || (isStrike && strikeWon) ? gem.hex : isLit ? "#cbd5e1" : "#94a3b8" }}
                        >
                          {tileNumber}
                        </span>
                      </button>

                      {/* Golden slot marker + strike sparks live outside the button. */}
                      {isGolden && !isStrike && (
                        <span aria-hidden className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[0.6rem] text-amber-200/90">
                          ✦
                        </span>
                      )}
                      {isStrike && strikeWon && !reduceMotion && outcome && (
                        <span key={outcome.id.toString()} aria-hidden className="pointer-events-none absolute inset-0 z-20">
                          {SPARKS.map((spark, i) => (
                            <motion.span
                              key={i}
                              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                              animate={{ x: spark.x, y: spark.y, opacity: 0, scale: 0.3 }}
                              transition={{ duration: 0.85, ease: "easeOut", delay: i * 0.02 }}
                              className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full"
                              style={{ background: gem.hex, boxShadow: `0 0 8px 1px ${gem.glow}` }}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* The hub — the only place that states the verdict out loud. */}
        <div className="absolute inset-0 z-10 m-auto flex h-[36%] w-[36%] flex-col items-center justify-center gap-1 rounded-full border border-white/10 bg-rock-deep/85 text-center shadow-facet backdrop-blur-sm">
          {digging ? (
            <>
              <span aria-hidden className="animate-spin-slow font-display text-xl text-gem-violet">
                ✦
              </span>
              <p className="engraved">Drawing…</p>
              <p className="px-3 text-[0.65rem] leading-snug text-slate-500">the Motherlode stays hidden</p>
            </>
          ) : outcome ? (
            strikeWon ? (
              <>
                <span aria-hidden className="font-display text-2xl text-amber-200 [text-shadow:0_0_18px_rgba(251,191,106,0.6)]">
                  ★
                </span>
                <p className="font-display text-sm tracking-wide text-amber-200">Struck!</p>
                <p className="px-3 text-[0.65rem] leading-snug text-slate-500">claim it in your Recent Digs</p>
              </>
            ) : (
              <>
                <span aria-hidden className="font-display text-2xl text-slate-500">
                  ◆
                </span>
                <p className="font-display text-sm tracking-wide text-slate-400">Sealed</p>
                <p className="px-3 text-[0.65rem] leading-snug text-slate-500">your pick stays hidden</p>
              </>
            )
          ) : (
            <>
              <p className="engraved">Motherlode</p>
              <p className="font-display text-sm tracking-wide text-slate-200">
                {kind === BetKind.Pick ? "Pick a slot" : kind === BetKind.All ? "Whole wheel" : "Parity"}
              </p>
              <p className="px-3 text-[0.65rem] leading-snug text-slate-500">the draw is encrypted — no one sees it but you</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
