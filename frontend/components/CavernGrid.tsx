"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";

import { BetKind, BONANZA_INDEX, type BetKindValue } from "@/lib/contracts";
import { playPick } from "@/lib/sfx";

/**
 * Four mineral families cycle across the wall and carry the colour of each
 * tile (teal, violet, rose, amber).
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
 * Every deposit has its own mineral name — 36 distinct ones, tinted to match
 * the family colour at that position (teal, violet, rose, amber, repeat).
 * Index 8 on the wall (`BONANZA_INDEX`) lands on "Amber" — the golden deposit.
 * Names are pure UI flavour: they never touch the chain and reveal nothing.
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

/** Unique name for a deposit; falls back to a plain number past the list. */
function depositName(index: number): string {
  return DEPOSIT_NAMES[index] ?? `Deposit ${index + 1}`;
}

/** Spark offsets for the strike burst — a loose ring around the deposit. */
const SPARKS = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2 + (i % 2 === 0 ? 0.16 : -0.12);
  const radius = 42 + (i % 3) * 14;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
});

/** The player's own most recent verdict, surfaced only on their own tile. */
export type DigOutcome = {
  /** The deposit the player picked (Pick bets only — never shown for others). */
  pick: number;
  won: boolean;
  /** The Dig's id — keys the burst animation so repeat strikes replay it. */
  id: bigint;
};

export function CavernGrid({
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
  /** Last resolved Dig of this wallet, for the strike animation. */
  outcome: DigOutcome | null;
  /** Disables picking while a Dig is in flight. */
  disabled: boolean;
  /** True while a Dig is settling — covered deposits churn in response. */
  digging: boolean;
}) {
  const reduceMotion = useReducedMotion();

  const deposits = useMemo(() => Array.from({ length: gridSize }, (_, i) => i), [gridSize]);
  const picking = kind === BetKind.Pick && !disabled;

  // The strike animation belongs to the player's own Dig: their tile cracks open
  // when they win, and is quietly marked as missed when they lose. Nothing about
  // anyone else's Dig — or about draws that are not theirs — is ever shown.
  const strikeIndex = outcome?.pick ?? null;
  const strikeWon = outcome?.won ?? false;

  return (
    <section id="cavern" aria-labelledby="cavern-heading" className="space-y-6">
      <header>
        <p className="engraved">The cavern wall</p>
        <h2 id="cavern-heading" className="font-display text-2xl tracking-wide text-slate-100">
          {kind === BetKind.Pick ? "Choose a deposit" : kind === BetKind.All ? "The whole wall" : "Parity Dig"}
        </h2>
      </header>

      <ul
        role={picking ? "radiogroup" : undefined}
        aria-label="Deposits on the cavern wall"
        className="grid grid-cols-3 gap-3 [perspective:1300px] sm:grid-cols-4 sm:gap-4 md:grid-cols-6"
      >
        {deposits.map((index) => {
          const gem = family(index);
          const tileNumber = index + 1;
          const isSelected = selected === index && kind === BetKind.Pick;
          const isStrike = strikeIndex === index;
          const isGolden = index === BONANZA_INDEX;

          // The wall mirrors the active kind's coverage: even-numbered tiles
          // light up for Even, odd-numbered for Odd, everything for All, and
          // for Pick only the chosen deposit — the wall stays dim until then.
          const isLit =
            kind === BetKind.All
              ? true
              : kind === BetKind.Even
                ? tileNumber % 2 === 0
                : kind === BetKind.Odd
                  ? tileNumber % 2 === 1
                  : isSelected;

          return (
            <li key={index} className="relative">
              <button
                type="button"
                role={picking ? "radio" : undefined}
                aria-checked={picking ? isSelected : undefined}
                aria-label={`Deposit ${index + 1} of ${gridSize}, ${depositName(index)}${isGolden ? " — the golden deposit" : ""}${
                  isStrike ? (strikeWon ? " — your last strike" : " — your last miss") : ""
                }`}
                disabled={!picking}
                onClick={() => {
                  playPick();
                  onSelect(isSelected ? null : index);
                }}
                className="group relative block w-full disabled:cursor-default"
                style={{ ["--glow-color" as string]: gem.glow }}
              >
                {/* The golden deposit breathes a soft ember halo behind its facet. */}
                {isGolden && !reduceMotion && !isStrike && (
                  <span
                    aria-hidden
                    className="absolute inset-[-4%] animate-ember rounded-full blur-lg"
                    style={{ background: "radial-gradient(circle, rgba(251,191,106,0.35) 0%, transparent 66%)" }}
                  />
                )}
                {/* The living wall: every deposit sways in 3D on its own
                    offset, so the cavern reads as breathing rock. */}
                <span className="tile-sway block" style={{ animationDelay: `${-((index * 7) % 12) * 0.6}s` }}>
                  <motion.span
                    animate={reduceMotion ? undefined : { scale: isSelected ? 1.05 : 1, y: isSelected ? -3 : 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 24 }}
                    className="relative block"
                  >
                    {/* Churn while the Motherlode is drawing; then flip to the
                        verdict face once this wallet's own result decrypts. */}
                    <motion.span
                      initial={false}
                      animate={
                        reduceMotion
                          ? { rotateY: isStrike ? 180 : 0 }
                          : isStrike
                            ? { rotateY: 180 }
                            : digging && isLit
                              ? { rotateY: [0, 360] }
                              : { rotateY: 0 }
                      }
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : isStrike
                            ? { duration: 0.9, ease: [0.2, 0.85, 0.25, 1] }
                            : digging && isLit
                              ? {
                                  duration: 1.15,
                                  repeat: Infinity,
                                  ease: "linear",
                                  delay: ((index % 6) + (Math.floor(index / 6) % 2)) * 0.055,
                                }
                              : { duration: 0.45, ease: "easeOut" }
                      }
                      className="relative block"
                      style={{ transformStyle: "preserve-3d" }}
                    >
                      {/* Front face — the gem itself. */}
                      <span
                        className={[
                          "facet-clip relative flex aspect-square items-center justify-center overflow-hidden",
                          "border-0 transition-[filter,opacity] duration-300",
                          isLit || isStrike ? "opacity-100" : "opacity-40",
                          isSelected ? "brightness-125" : isLit ? "brightness-110" : picking ? "group-hover:brightness-110" : "",
                        ].join(" ")}
                        style={{
                          background: `linear-gradient(155deg, ${gem.hex}2e 0%, #12151d 42%, #0b0d12 100%)`,
                          boxShadow: isSelected || (isStrike && strikeWon) ? `0 0 34px -6px ${gem.glow}` : "none",
                          backfaceVisibility: "hidden",
                        }}
                      >
                        {/* Inner facet lines — hand-drawn crown/pavilion edges. */}
                        <span
                          aria-hidden
                          className="absolute inset-0 opacity-40"
                          style={{
                            background: `linear-gradient(to bottom right, transparent 48%, ${gem.hex}44 49%, transparent 51%),
                                         linear-gradient(to bottom left, transparent 48%, ${gem.hex}33 49%, transparent 51%)`,
                          }}
                        />
                        <span
                          aria-hidden
                          className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2"
                          style={{ background: `linear-gradient(180deg, ${gem.hex}55, transparent 70%)` }}
                        />
                        {!reduceMotion && <span aria-hidden className="facet-sheen animate-shimmer" />}

                        <span className="relative flex flex-col items-center gap-0.5">
                          <span
                            className="font-display text-2xl leading-none sm:text-3xl"
                            style={{ color: isSelected || (isStrike && strikeWon) ? gem.hex : isLit ? "#cbd5e1" : "#94a3b8" }}
                          >
                            {tileNumber}
                          </span>
                          <span className="text-[0.5rem] uppercase tracking-[0.1em] text-slate-500">{depositName(index)}</span>
                        </span>
                      </span>

                      {/* Back face — plain rock while churning, the verdict once struck. */}
                      <span
                        aria-hidden
                        className="facet-clip absolute inset-0 flex items-center justify-center"
                        style={{
                          transform: "rotateY(180deg)",
                          backfaceVisibility: "hidden",
                          background:
                            isStrike && strikeWon
                              ? "linear-gradient(155deg, rgba(251,191,106,0.55) 0%, #3a2c0e 46%, #0b0d12 100%)"
                              : "linear-gradient(155deg, #2a303c 0%, #12151d 46%, #0b0d12 100%)",
                          boxShadow: isStrike && strikeWon ? "0 0 44px -6px rgba(251,191,106,0.5)" : "none",
                        }}
                      >
                        {isStrike && (
                          <span className="flex flex-col items-center gap-1">
                            <span
                              className={`font-display text-2xl leading-none sm:text-3xl ${strikeWon ? "text-amber-200" : "text-slate-500"}`}
                            >
                              {strikeWon ? "★" : "◆"}
                            </span>
                            <span
                              className={`text-[0.5rem] uppercase tracking-[0.16em] ${strikeWon ? "text-amber-200/90" : "text-slate-500"}`}
                            >
                              {strikeWon ? "Struck" : "Sealed"}
                            </span>
                          </span>
                        )}
                      </span>
                    </motion.span>
                  </motion.span>
                </span>

                {/* Text badges, so state never depends on colour alone. */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.span
                      initial={reduceMotion ? undefined : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: 4 }}
                      className="absolute -bottom-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em]"
                      style={{ borderColor: `${gem.hex}66`, color: gem.hex, background: "#0b0d12" }}
                    >
                      Picked
                    </motion.span>
                  )}
                </AnimatePresence>

                {isStrike && (
                  <span
                    className={[
                      "absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.16em]",
                      strikeWon
                        ? "border-amber-300/50 bg-rock-void text-amber-200"
                        : "border-white/15 bg-rock-void text-slate-400",
                    ].join(" ")}
                  >
                    {strikeWon ? "★ Your strike" : "Missed — sealed"}
                  </span>
                )}

                {/* A strike scatters gem sparks from the cracked deposit. */}
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

                {isGolden && !isStrike && (
                  <span
                    aria-hidden
                    className="absolute -top-1.5 right-0 text-[0.65rem]"
                    title="The golden deposit — a draw here releases the Bonanza pot"
                  >
                    ✦
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
