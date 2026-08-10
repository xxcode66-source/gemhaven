"use client";

import { AnimatedEth } from "@/components/AnimatedEth";
import { useGameStats } from "@/lib/hooks";

/**
 * The house side of the instant game: the bankroll that pays wins, the rolling
 * Bonanza pot, and the solvency cap. There is no round to track — the game
 * runs continuously, one Dig at a time.
 */
export function GamePulse() {
  const { stats } = useGameStats();

  return (
    <section aria-labelledby="pulse-heading" className="rock-panel p-6">
      <div className="relative space-y-5">
        <header>
          <p className="engraved">The game, live</p>
          <h2 id="pulse-heading" className="font-display text-2xl tracking-wide text-slate-100">
            No rounds. No waiting.
          </h2>
        </header>

        <p className="text-sm leading-relaxed text-slate-400">
          Every Dig draws its own encrypted Motherlode and settles against it in the same transaction. The cavern never
          closes — play continues for as long as someone is Digging.
        </p>

        <dl className="grid grid-cols-2 gap-4">
          <Metric label="Bankroll">
            <AnimatedEth wei={stats?.bankroll} /> ETH
          </Metric>
          <Metric label="Max Pick stake">
            <AnimatedEth wei={stats?.maxStake} decimals={6} /> ETH
          </Metric>
          <Metric label="Bonanza pot" accent>
            <AnimatedEth wei={stats?.bonanzaPot} /> ETH
          </Metric>
          <Metric label="Protocol fees">
            <AnimatedEth wei={stats?.protocolFees} /> ETH
          </Metric>
        </dl>

        <div className="space-y-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3">
          <p className="text-sm text-amber-100/90">
            <span aria-hidden className="mr-1">
              ✦
            </span>
            The Bonanza pot is funded by 1% of every Dig. Land a draw on the golden deposit — Amber, index 8 — and
            the whole pot is released to you, instantly, on top of your Dig&apos;s own result.
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, accent, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <dt className="engraved">{label}</dt>
      <dd className={`mt-1 font-mono text-lg tabular-nums ${accent ? "text-amber-200" : "text-slate-100"}`}>
        {children}
      </dd>
    </div>
  );
}
