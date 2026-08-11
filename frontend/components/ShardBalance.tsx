"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { shardIsConfigured } from "@/lib/contracts";
import { formatShard } from "@/lib/format";
import { useShardBalance } from "@/lib/hooks";
import { countCachedWins } from "@/lib/verdicts";

/**
 * Rolls the big $SHARD number up to its new value whenever a claim mints —
 * earnings should feel like they land. Honours prefers-reduced-motion.
 */
function useCountUpShard(target: bigint | undefined): string {
  const [display, setDisplay] = useState(target);
  const previous = useRef(target);

  useEffect(() => {
    if (target === undefined) return;
    const from = previous.current ?? 0n;
    previous.current = target;
    if (from === target) {
      setDisplay(target);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(target);
      return;
    }
    const start = performance.now();
    const duration = 900;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const scaled = BigInt(Math.round(eased * 1000));
      setDisplay(from + ((target - from) * scaled) / 1000n);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return formatShard(display);
}

export function ShardBalance() {
  const { isConnected } = useAccount();
  const { balance, totalSupply, symbol, totalMined } = useShardBalance();

  // Wins can no longer be derived from totalMined (rates differ per kind), so
  // the tally comes from this browser's own decrypted verdicts.
  const [wins] = useState(() => countCachedWins());
  const balanceDisplay = useCountUpShard(balance);

  return (
    <section aria-labelledby="shard-heading" className="rock-panel p-5">
      <div className="relative space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="engraved">Your sack</p>
            <h2 id="shard-heading" className="font-display text-xl tracking-wide text-slate-100">
              ${symbol}
            </h2>
          </div>
          {/* A small crystal cluster, echoing the deposits on the wall. */}
          <span aria-hidden className="relative flex h-10 w-10 items-center justify-center">
            <span
              className="facet-clip absolute inset-0 animate-pulseGlow"
              style={{
                background: "linear-gradient(155deg, #3ee6c43a, #12151d 55%)",
                ["--glow-color" as string]: "rgba(62,230,196,0.35)",
              }}
            />
            <span className="relative font-display text-sm text-gem-teal">◈</span>
          </span>
        </header>

        {!shardIsConfigured ? (
          <p className="text-sm text-slate-500">
            Set <code className="font-mono text-xs text-slate-400">NEXT_PUBLIC_SHARD_ADDRESS</code> to track balances.
          </p>
        ) : !isConnected ? (
          <p className="text-sm text-slate-500">Connect a wallet to see your ${symbol}.</p>
        ) : (
          <>
            <div>
              <p className="font-mono text-4xl tabular-nums text-slate-100">{balanceDisplay}</p>
              <p className="mt-1 text-xs text-slate-500">total ${symbol} earned — mined only, never bought</p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="engraved">Mining score</dt>
                <dd className="mt-1 font-mono text-sm text-gem-teal">{formatShard(totalMined)}</dd>
              </div>
              <div>
                <dt className="engraved">Winning Digs</dt>
                <dd className="mt-1 font-mono text-sm text-slate-300">{wins.toString()}</dd>
              </div>
              <div>
                <dt className="engraved">Per win</dt>
                <dd className="mt-1 font-mono text-sm text-slate-300">Pick 10 · parity 2 · All 1</dd>
              </div>
              <div>
                <dt className="engraved">Total minted</dt>
                <dd className="mt-1 font-mono text-sm text-slate-300">{formatShard(totalSupply)}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </section>
  );
}
