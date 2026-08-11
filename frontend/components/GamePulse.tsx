"use client";

import { AnimatedEth } from "@/components/AnimatedEth";
import { useGameStats } from "@/lib/hooks";

/**
 * The house side of the instant game: open escrow that always covers claims,
 * the rolling Bonanza pot, protocol fees, and the house liquidity reserve.
 * There is no round to track — the game runs continuously, one Dig at a time.
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

        <dl className="grid grid-cols-2 gap-4">
          <Metric label="Open escrow">
            <AnimatedEth wei={stats?.escrow} /> ETH
          </Metric>
          <Metric label="Bonanza pot" accent>
            <AnimatedEth wei={stats?.bonanzaPot} /> ETH
          </Metric>
          <Metric label="House liquidity">
            <AnimatedEth wei={stats?.bankroll} /> ETH
          </Metric>
          <Metric label="Protocol fees">
            <AnimatedEth wei={stats?.protocolFees} /> ETH
          </Metric>
        </dl>

        <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] px-4 py-3">
          <p className="text-sm text-amber-100/90">
            <span aria-hidden className="mr-1">
              ✦
            </span>
            Half of every missed Dig feeds the pot. Land the golden deposit — Amber, index 8 — and it&apos;s all yours.
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
