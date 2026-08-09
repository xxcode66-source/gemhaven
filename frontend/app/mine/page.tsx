"use client";

import { useCallback, useState } from "react";

import { BetControls } from "@/components/BetControls";
import { CavernGrid, type DigOutcome } from "@/components/CavernGrid";
import { GamePulse } from "@/components/GamePulse";
import { ShardBalance } from "@/components/ShardBalance";
import { BetKind, type BetKindValue } from "@/lib/contracts";
import { useCavernConfig, useGameStats } from "@/lib/hooks";

export default function MinePage() {
  const { config } = useCavernConfig();
  const { refetch: refetchStats } = useGameStats();

  // Shared between the wall and the controls: the pick only exists in the
  // browser until it is encrypted, and the outcome only ever reflects this
  // wallet's own last Dig.
  const [kind, setKind] = useState<BetKindValue>(BetKind.Pick);
  const [selected, setSelected] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<DigOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshAll = useCallback(async () => {
    await refetchStats();
  }, [refetchStats]);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="max-w-2xl space-y-3">
        <p className="engraved">The cavern wall</p>
        <h1 className="text-balance font-display text-3xl leading-tight tracking-wide text-slate-50 sm:text-4xl">
          Pick a deposit. Keep it secret. Win the moment you Dig.
        </h1>
        <p className="text-balance leading-relaxed text-slate-400">
          One wall of {config ? config.gridSize : 36} deposits, one hidden Motherlode per Dig. Your pick is encrypted
          in your browser by Inco Lightning and compared to the draw without ever being decrypted — the result settles
          in the same transaction. Straight picks pay 34.92x; parity pays 1.94x; the golden deposit can release the
          Bonanza pot at any time.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <CavernGrid
            gridSize={config?.gridSize ?? 36}
            kind={kind}
            selected={selected}
            onSelect={setSelected}
            outcome={outcome}
            disabled={busy}
          />
          <BetControls
            kind={kind}
            onKindChange={(next) => {
              setKind(next);
              if (next !== BetKind.Pick) setSelected(null);
            }}
            selected={selected}
            onOutcome={setOutcome}
            onChanged={refreshAll}
            onBusyChange={setBusy}
          />
        </div>

        <aside className="space-y-6">
          <GamePulse />
          <ShardBalance />
          <PrivacyNote />
        </aside>
      </div>
    </main>
  );
}

function PrivacyNote() {
  return (
    <section aria-labelledby="privacy-heading" className="rock-panel p-5">
      <div className="relative space-y-3">
        <p className="engraved">What the chain can see</p>
        <h2 id="privacy-heading" className="font-display text-xl tracking-wide text-slate-100">
          Three things. No more.
        </h2>
        <ol className="space-y-2 text-xs leading-relaxed text-slate-400">
          <li>
            <span className="text-gem-teal">1.</span> Your stake and the kind of Dig — Pick, Even, Odd or All.
          </li>
          <li>
            <span className="text-gem-teal">2.</span> One public bit per Dig: whether the draw hit the golden
            deposit, which releases the Bonanza pot.
          </li>
          <li>
            <span className="text-gem-teal">3.</span> A single win/loss bit, decryptable only by the wallet that made
            the Dig.
          </li>
        </ol>
        <p className="text-xs leading-relaxed text-slate-500">
          Which deposit a Pick chose is never revealed — not to other players, not to the contract owner, not to the
          player&apos;s own transaction history. Even and Odd Digs carry a sealed placeholder pick, so every Dig looks
          identical on chain.
        </p>
      </div>
    </section>
  );
}
