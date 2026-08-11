"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { decodeEventLog, parseEther } from "viem";
import { useAccount, usePublicClient, useWalletClient, useWriteContract } from "wagmi";

import {
  BetKind,
  BET_KIND_LABELS,
  gemHavenAbi,
  gemHavenContract,
  isConfigured,
  MULT_DENOMINATOR,
  previewPayout,
  requireGemHavenAddress,
  STRAIGHT_MULT_BPS,
  type BetKindValue,
} from "@/lib/contracts";
import { describeError, formatEth, formatShard } from "@/lib/format";
import { coverageOf, shardRewardFor } from "@/lib/contracts";
import { useActiveChainId, useCavernConfig, useGameStats, useIncoFeeBudget } from "@/lib/hooks";
import { decryptOwnResult, encryptDeposit } from "@/lib/inco";
import { isMuted, playDig, playLose, playPick, playWin, setMuted } from "@/lib/sfx";
import { storeVerdict } from "@/lib/verdicts";
import type { DigOutcome } from "./MotherlodeWheel";

/** Amount presets in ETH, zinc-style. Anything above `maxStake` is capped live. */
const PRESETS = ["0.001", "0.005", "0.01", "0.05", "0.1", "1"] as const;

/** Pause between consecutive Digs in auto mode. */
const AUTO_DELAY_MS = 1_500;

const KIND_OPTIONS: { kind: BetKindValue; mult: string; hint: string }[] = [
  { kind: BetKind.Pick, mult: "34.92x", hint: "1 of 36" },
  { kind: BetKind.Even, mult: "1.94x", hint: "18 of 36" },
  { kind: BetKind.Odd, mult: "1.94x", hint: "18 of 36" },
  { kind: BetKind.All, mult: "0.97x", hint: "whole wall" },
];

type DigStage = "idle" | "sealing" | "signing" | "resolving" | "decrypting";

type LastResult = { betId: bigint; won: boolean; payout: bigint };

export function BetControls({
  kind,
  onKindChange,
  selected,
  onOutcome,
  onChanged,
  onBusyChange,
}: {
  kind: BetKindValue;
  onKindChange: (kind: BetKindValue) => void;
  selected: number | null;
  /** Feeds the strike animation back to the cavern wall. */
  onOutcome: (outcome: DigOutcome | null) => void;
  /** Refetches game stats + recent Digs once a Dig settles. */
  onChanged: () => void;
  /** Lets the wall freeze picking while a Dig is in flight. */
  onBusyChange: (busy: boolean) => void;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useActiveChainId();
  const publicClient = usePublicClient({ chainId });
  const { data: walletClient } = useWalletClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const reduceMotion = useReducedMotion();

  const { config } = useCavernConfig();
  const { stats, refetch: refetchStats } = useGameStats();
  const feeBudget = useIncoFeeBudget(kind);

  const [amountInput, setAmountInput] = useState<string>(PRESETS[0] ?? "0.001");
  const [auto, setAuto] = useState(false);
  const [stage, setStage] = useState<DigStage>("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<LastResult | null>(null);
  // Synced from localStorage after mount, so SSR and client first paint agree.
  const [soundOff, setSoundOff] = useState(false);

  useEffect(() => {
    setSoundOff(isMuted());
  }, []);

  const autoRef = useRef(false);

  const busy = stage !== "idle";

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  const gridSize = config?.gridSize ?? 36;
  const minStake = config?.minStake;

  const amountWei = (() => {
    if (!amountInput.trim()) return undefined;
    try {
      return parseEther(amountInput.trim());
    } catch {
      return undefined;
    }
  })();

  // Stakes are per covered deposit: Pick covers 1, parity half the wall, All all of it.
  const coverage = coverageOf(kind, gridSize);
  const totalStake = amountWei !== undefined ? amountWei * BigInt(coverage) : undefined;
  const minTotal = minStake !== undefined ? minStake * BigInt(coverage) : undefined;
  const payout = totalStake !== undefined ? previewPayout(totalStake, kind, gridSize) : undefined;
  const totalCost = totalStake !== undefined && feeBudget !== undefined ? totalStake + feeBudget : undefined;

  const belowMin = totalStake !== undefined && minTotal !== undefined && totalStake < minTotal;
  // Solvency cap: wins pay `maxPayout() = bankroll × payoutCapBps`, which the
  // UI derives from `maxStake` (the largest Pick the bankroll covers). Mirrors
  // the contract check exactly, so it stays correct for any exposure cap.
  const maxPayout = stats !== undefined ? (stats.maxStake * STRAIGHT_MULT_BPS) / MULT_DENOMINATOR : undefined;
  const aboveMax = payout !== undefined && maxPayout !== undefined && payout > maxPayout;

  const pickMissing = kind === BetKind.Pick && selected === null;
  const canDig =
    isConfigured &&
    isConnected &&
    Boolean(publicClient) &&
    amountWei !== undefined &&
    feeBudget !== undefined &&
    !belowMin &&
    !aboveMax &&
    !pickMissing &&
    !busy;

  // Stop auto mode cleanly when it becomes impossible to continue.
  useEffect(() => {
    if (auto && !isConnected) {
      autoRef.current = false;
      setAuto(false);
    }
  }, [auto, isConnected]);

  async function runOne(): Promise<boolean> {
    if (!address || !publicClient || !walletClient || amountWei === undefined || feeBudget === undefined) {
      return false;
    }
    const stake = amountWei * BigInt(coverageOf(kind, gridSize));
    // Capture the pick locally so a concurrent state reset cannot race the encrypt.
    const pick = kind === BetKind.Pick ? selected : 0;
    if (kind === BetKind.Pick && pick === null) return false;

    // Clear the previous verdict so the wall never shows a stale result while
    // the new Dig is still sealed.
    onOutcome(null);

    setStage("sealing");
    const ciphertext = await encryptDeposit({
      deposit: pick ?? 0,
      account: address,
      gemHaven: requireGemHavenAddress(),
      chainId,
    });

    setStage("signing");
    const betHash = await writeContractAsync({
      ...gemHavenContract,
      functionName: "bet",
      args: [ciphertext, kind],
      // The Inco fee budget rides on top of the stake: GemHaven pays its
      // compute fees out of its own balance, so a Dig has to fund them.
      value: stake + feeBudget,
      chainId,
    });

    setStage("resolving");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: betHash });
    if (receipt.status !== "success") {
      throw new Error("The Dig transaction reverted on chain.");
    }

    // The Dug event carries the new bet id — the only log GemHaven emits, and
    // it reveals nothing beyond the stake and the kind.
    const dug = receipt.logs
      .map((log) => {
        try {
          return decodeEventLog({ abi: gemHavenAbi, data: log.data, topics: log.topics });
        } catch {
          return undefined;
        }
      })
      .find((decoded) => decoded?.eventName === "Dug");
    if (!dug || dug.eventName !== "Dug") {
      throw new Error("The Dig landed but its id could not be read from the receipt.");
    }
    const betId = dug.args.betId;

    const view = await publicClient.readContract({
      ...gemHavenContract,
      functionName: "getBet",
      args: [betId],
    });
    if (!view) {
      throw new Error(`Bet ${betId} could not be read back from the chain.`);
    }

    setStage("decrypting");
    // Requires a wallet signature. Only this address is on the handle's ACL,
    // so no third party — and no admin — can run this.
    const attested = await decryptOwnResult({ walletClient, handle: view.resultHandle, chainId });
    const won = attested.value;
    storeVerdict(betId, won);

    // Parity and All Digs carry no pick — the wheel veils instead of pointing.
    onOutcome({ pick: kind === BetKind.Pick ? pick : null, won, id: betId });

    if (won) playWin();
    else playLose();

    const payoutWei = won ? previewPayout(stake, kind, gridSize) : 0n;

    // No claim here on purpose: the verdict is shown immediately, and the
    // payout (plus the bonanza check) is collected from the History page,
    // so a Dig stays one fast transaction even when it strikes.
    setResult({ betId, won, payout: payoutWei });
    await refetchStats();
    onChanged();
    return true;
  }

  async function dig() {
    setError("");
    setResult(null);
    playDig();
    try {
      await runOne();
    } catch (cause) {
      setError(describeError(cause));
      stopAuto();
    } finally {
      setStage("idle");
    }
  }

  function stopAuto() {
    autoRef.current = false;
    setAuto(false);
  }

  async function toggleAuto() {
    if (auto) {
      stopAuto();
      return;
    }
    autoRef.current = true;
    setAuto(true);
    // The loop re-validates everything each iteration and stops on any error.
    while (autoRef.current) {
      setError("");
      playDig();
      try {
        const ok = await runOne();
        if (!ok) break;
      } catch (cause) {
        setError(describeError(cause));
        break;
      } finally {
        setStage("idle");
      }
      await new Promise((resolve) => setTimeout(resolve, AUTO_DELAY_MS));
    }
    stopAuto();
  }

  const kindLabel = BET_KIND_LABELS[kind] ?? "Dig";

  return (
    <section aria-labelledby="bet-heading" className="rock-panel p-5">
      <div className="relative space-y-5">
        <header>
          <p className="engraved">Place a Dig</p>
          <h2 id="bet-heading" className="font-display text-xl tracking-wide text-slate-100">
            One transaction, start to finish
          </h2>
        </header>

        {/* Bet kind ---------------------------------------------------------- */}
        <div role="radiogroup" aria-label="Bet kind" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KIND_OPTIONS.map((option) => {
            const active = kind === option.kind;
            return (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={busy || auto}
                onClick={() => {
                  playPick();
                  onKindChange(option.kind);
                }}
                className={[
                  "rounded-xl border px-3 py-2 text-left transition",
                  active
                    ? "border-gem-teal/60 bg-gem-teal/[0.08]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25",
                  busy || auto ? "opacity-60" : "",
                ].join(" ")}
              >
                <span className={`block text-sm font-medium ${active ? "text-gem-teal" : "text-slate-200"}`}>
                  {BET_KIND_LABELS[option.kind]}
                </span>
                <span className="block font-mono text-xs tabular-nums text-slate-400">
                  {option.mult} · {option.hint}
                </span>
              </button>
            );
          })}
        </div>

        {/* Amount ------------------------------------------------------------ */}
        <div className="space-y-2">
          <label htmlFor="amount" className="engraved block">
            {coverage > 1 ? "Amount per deposit (ETH)" : "Amount (ETH)"}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={busy || auto}
                onClick={() => {
                  playPick();
                  setAmountInput(preset);
                }}
                aria-pressed={amountInput === preset}
                className={[
                  "rounded-lg border px-3 py-1.5 font-mono text-xs tabular-nums transition",
                  amountInput === preset
                    ? "border-gem-teal/60 bg-gem-teal/[0.08] text-gem-teal"
                    : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/25",
                ].join(" ")}
              >
                {preset}
              </button>
            ))}
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              disabled={busy || auto}
              aria-describedby="amount-hint"
              aria-invalid={amountInput.trim() !== "" && (amountWei === undefined || belowMin || aboveMax)}
              className="w-32 rounded-lg border border-white/10 bg-rock-void/80 px-3 py-1.5 font-mono text-sm text-slate-100 outline-none transition focus:border-gem-teal/50"
            />
          </div>
          <p id="amount-hint" className="text-xs leading-relaxed text-slate-500">
            {coverage > 1 && totalStake !== undefined ? `Total ${formatEth(totalStake, 6)} ETH (× ${coverage}) · ` : ""}
            Min {formatEth(minTotal, 6)} ETH · +{formatEth(feeBudget, 7)} ETH Inco fee · 1% Bonanza + 1% protocol fee
            {totalCost !== undefined ? ` · ${formatEth(totalCost, 6)} ETH total` : ""}
          </p>
        </div>

        {/* Preview + actions -------------------------------------------------- */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-slate-300">
              If it lands:{" "}
              <span className="font-mono tabular-nums text-gem-teal [text-shadow:0_0_16px_rgba(62,230,196,0.35)]">
                {formatEth(payout)} ETH
              </span>
              <span className="text-slate-400"> + {formatShard(shardRewardFor(kind))} $SHARD</span>
            </p>
            {aboveMax && (
              <p className="text-xs text-amber-200/90">
                The bankroll currently covers Picks up to {formatEth(stats?.maxStake)} ETH — this amount would revert.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={auto}
                onChange={toggleAuto}
                disabled={!isConnected || busy}
                className="h-4 w-4 accent-teal-400"
              />
              Auto
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={!soundOff}
                onChange={(event) => {
                  setMuted(!event.target.checked);
                  setSoundOff(!event.target.checked);
                  if (event.target.checked) playPick();
                }}
                className="h-4 w-4 accent-teal-400"
              />
              Sound
            </label>
            <button type="button" onClick={dig} disabled={!canDig || auto} className="gem-button">
              {stage === "sealing" && "Sealing your pick…"}
              {stage === "signing" && "Confirm in wallet…"}
              {stage === "resolving" && "Drawing the Motherlode…"}
              {stage === "decrypting" && "Decrypting your result…"}
              {stage === "idle" &&
                (pickMissing ? "Pick a deposit first" : auto ? "Auto running…" : `Dig — ${kindLabel}`)}
            </button>
          </div>
        </div>

        <p aria-live="polite" className="text-xs text-slate-500">
          {!isConnected && "Connect a wallet to Dig."}
          {isConnected && belowMin && "That amount is below the minimum Dig."}
        </p>

        {/* The verdict lands with a flourish — strike in gold, miss in dust. */}
        <AnimatePresence mode="wait">
          {isConnected && !busy && result !== null && (
            <motion.div
              key={result.betId.toString()}
              role="status"
              initial={reduceMotion ? undefined : { opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className={[
                "rounded-xl border px-4 py-3",
                result.won
                  ? "border-amber-300/40 bg-amber-300/[0.07] shadow-[0_0_38px_-12px_rgba(251,191,106,0.55)]"
                  : "border-white/10 bg-white/[0.02]",
              ].join(" ")}
            >
              <p
                className={`font-display text-xl tracking-wide ${result.won ? "text-amber-200" : "text-slate-300"}`}
              >
                {result.won ? "★ Strike!" : "The wall holds — missed."}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Dig #{result.betId.toString()}: {" "}
                {result.won
                  ? `${formatEth(result.payout)} ETH + ${formatShard(shardRewardFor(kind))} $SHARD — claim it in your History.`
                  : "your pick stays sealed — no one can see what it was."}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
