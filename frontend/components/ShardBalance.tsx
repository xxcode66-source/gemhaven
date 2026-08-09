"use client";

import { useAccount } from "wagmi";

import { REWARD_PER_WIN, shardIsConfigured } from "@/lib/contracts";
import { formatShard } from "@/lib/format";
import { useShardBalance } from "@/lib/hooks";

export function ShardBalance() {
  const { isConnected } = useAccount();
  const { balance, totalSupply, symbol, totalMined } = useShardBalance();

  const wins = balance !== undefined ? balance / REWARD_PER_WIN : undefined;
  const minedWins = totalMined !== undefined ? totalMined / REWARD_PER_WIN : undefined;

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
            <p className="font-mono text-4xl tabular-nums text-slate-100">{formatShard(balance)}</p>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="engraved">Mining score</dt>
                <dd className="mt-1 font-mono text-sm text-gem-teal">{formatShard(totalMined)}</dd>
              </div>
              <div>
                <dt className="engraved">Winning Digs</dt>
                <dd className="mt-1 font-mono text-sm text-slate-300">{wins !== undefined ? wins.toString() : "—"}</dd>
              </div>
              <div>
                <dt className="engraved">Score from</dt>
                <dd className="mt-1 font-mono text-sm text-slate-300">{minedWins !== undefined ? `${minedWins} wins` : "—"}</dd>
              </div>
              <div>
                <dt className="engraved">Total minted</dt>
                <dd className="mt-1 font-mono text-sm text-slate-300">{formatShard(totalSupply)}</dd>
              </div>
            </dl>
            <p className="text-xs leading-relaxed text-slate-500">
              Each winning Dig mints a flat {formatShard(REWARD_PER_WIN)} ${symbol}. Your mining score is the lifetime
              total minted to this wallet — it cannot be bought or transferred, only earned. If a GemHaven token ever
              launches, allocations are planned to weight this score. (Roadmap, not a promise.)
            </p>
          </>
        )}
      </div>
    </section>
  );
}
