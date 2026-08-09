"use client";

import { formatEth } from "@/lib/format";
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
          <Metric label="Bankroll" value={`${formatEth(stats?.bankroll)} ETH`} />
          <Metric label="Max Pick stake" value={`${formatEth(stats?.maxStake, 6)} ETH`} />
          <Metric label="Bonanza pot" value={`${formatEth(stats?.bonanzaPot)} ETH`} accent />
          <Metric label="Protocol fees" value={`${formatEth(stats?.protocolFees)} ETH`} />
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

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="engraved">{label}</dt>
      <dd className={`mt-1 font-mono text-lg tabular-nums ${accent ? "text-amber-200" : "text-slate-100"}`}>{value}</dd>
    </div>
  );
}
