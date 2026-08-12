"use client";

import { useCallback, useEffect, useState } from "react";

import { BetControls } from "@/components/BetControls";
import { GamePulse } from "@/components/GamePulse";
import { MotherlodeWheel, type DigOutcome } from "@/components/MotherlodeWheel";
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
  // The reveal animation fades after a few seconds, but the hub keeps stating
  // the wallet's newest verdict until the next Dig starts.
  const [lastOutcome, setLastOutcome] = useState<DigOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const handleOutcome = useCallback((next: DigOutcome | null) => {
    setOutcome(next);
    if (next) setLastOutcome(next);
  }, []);

  // The verdict lingers long enough to land — settle spin included, roughly
  // four seconds on Struck/Sealed — then the wheel returns to its idle face.
  // The claim itself lives over in History, not here.
  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), 6_500);
    return () => clearTimeout(timer);
  }, [outcome]);

  const refreshAll = useCallback(async () => {
    await refetchStats();
  }, [refetchStats]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 overflow-x-clip px-5 py-8 sm:px-8 sm:py-10">
      <GamePulse />
      <MotherlodeWheel
        gridSize={config?.gridSize ?? 36}
        kind={kind}
        selected={selected}
        onSelect={setSelected}
        outcome={outcome}
        lastOutcome={lastOutcome}
        disabled={busy}
        digging={busy}
      />
      <BetControls
        kind={kind}
        onKindChange={(next) => {
          setKind(next);
          if (next !== BetKind.Pick) setSelected(null);
        }}
        selected={selected}
        onOutcome={handleOutcome}
        onChanged={refreshAll}
        onBusyChange={setBusy}
      />
      <ShardBalance />
    </main>
  );
}
