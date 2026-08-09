"use client";

import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWalletClient, useWriteContract } from "wagmi";

import { BET_KIND_LABELS, REWARD_PER_WIN, gemHavenContract, isConfigured, previewPayout } from "@/lib/contracts";
import { describeError, formatEth, formatShard } from "@/lib/format";
import { useActiveChainId, useBet, useCavernConfig, usePlayerBets, type PlayerBet } from "@/lib/hooks";
import { decryptOwnResult, isLiveHandle, revealPublicBit } from "@/lib/inco";

/** The player's own decrypted verdict, plus the attestation `claim` will verify. */
type Verdict = { won: boolean; signatures: Hex[] };

/** Newest-first window shown before expanding. */
const INITIAL_VISIBLE = 12;

export function RecentDigs({ onChanged }: { onChanged: () => void }) {
  const { isConnected } = useAccount();
  const { bets, isLoading, refetch } = usePlayerBets();

  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const [extraIds, setExtraIds] = useState<bigint[]>([]);
  const [jumpInput, setJumpInput] = useState("");

  // Claims never expire on chain, so any historical Dig can be reopened by id.
  const openOlder = () => {
    const trimmed = jumpInput.trim();
    if (!/^\d+$/.test(trimmed)) return;
    const id = BigInt(trimmed);
    if (id < 1n) return;
    if (bets.some((b) => b.betId === id) || extraIds.some((x) => x === id)) return;
    setExtraIds((prev) => [...prev, id]);
    setJumpInput("");
  };

  const refresh = async () => {
    await refetch();
    onChanged();
  };

  const shown = bets.slice(0, visible);

  return (
    <section aria-labelledby="digs-heading" className="rock-panel p-6">
      <div className="relative space-y-5">
        <header>
          <p className="engraved">Your Digs</p>
          <h2 id="digs-heading" className="font-display text-2xl tracking-wide text-slate-100">
            Recent Digs
          </h2>
        </header>

        <p className="text-sm leading-relaxed text-slate-400">
          Every Dig settles in its own transaction, but its encrypted result stays claimable forever. Decrypt the win
          bit with your wallet, then claim — however long ago the Dig happened.
        </p>

        {!isConnected ? (
          <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-6 text-center text-sm text-slate-500">
            Connect a wallet to see your Digs.
          </p>
        ) : (
          <div className="space-y-4">
            {isLoading && bets.length === 0 && <p className="text-xs text-slate-500">Reading your Digs…</p>}
            {!isLoading && bets.length === 0 && extraIds.length === 0 && (
              <p className="text-xs text-slate-500">No Digs yet from this wallet.</p>
            )}

            <ul className="space-y-3">
              {shown.map((bet) => (
                <li key={bet.betId.toString()}>
                  <BetRow bet={bet} onChanged={refresh} />
                </li>
              ))}
            </ul>

            {bets.length > visible && (
              <button
                type="button"
                onClick={() => setVisible(bets.length)}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/25"
              >
                Show all {bets.length} Digs
              </button>
            )}

            {extraIds.map((betId) => (
              <OlderBet key={betId.toString()} betId={betId} onChanged={refresh} />
            ))}

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
              <label htmlFor="older-bet" className="engraved">
                Open an older Dig by id
              </label>
              <input
                id="older-bet"
                inputMode="numeric"
                pattern="[0-9]*"
                value={jumpInput}
                onChange={(event) => setJumpInput(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && openOlder()}
                placeholder="3"
                className="w-24 rounded-lg border border-white/10 bg-rock-void/80 px-3 py-1.5 font-mono text-sm text-slate-100 outline-none transition focus:border-gem-teal/50"
              />
              <button type="button" onClick={openOlder} className="gem-button !px-4 !py-1.5 !text-xs">
                Open
              </button>
              <p className="text-xs text-slate-500">
                Claims never expire — any Dig you ever made can be reopened here by its id.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Loads any historical Dig on demand; claims have no expiry on chain. */
function OlderBet({ betId, onChanged }: { betId: bigint; onChanged: () => void }) {
  const { bet, isLoading, isError } = useBet(betId);

  if (isLoading) {
    return <p className="text-xs text-slate-500">Reading Dig #{betId.toString()}…</p>;
  }
  // `getBet` reverts for ids that were never placed.
  if (isError || !bet) {
    return <p className="text-xs text-slate-500">Dig #{betId.toString()} does not exist on this deployment.</p>;
  }
  return <BetRow bet={bet} onChanged={onChanged} />;
}

function BetRow({ bet, onChanged }: { bet: PlayerBet; onChanged: () => void }) {
  const chainId = useActiveChainId();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const { config } = useCavernConfig();

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [bonanza, setBonanza] = useState<"unknown" | "checking" | "miss" | "claiming">("unknown");
  const [busy, setBusy] = useState<"decrypt" | "claim" | null>(null);
  const [error, setError] = useState("");
  const [hash, setHash] = useState<`0x${string}` | undefined>();

  const receipt = useWaitForTransactionReceipt({ hash, chainId });

  useEffect(() => {
    if (!receipt.isSuccess) return;
    setBusy(null);
    if (bonanza === "claiming") setBonanza("unknown");
    setHash(undefined);
    onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.isSuccess, onChanged]);

  const own = address !== undefined && bet.player.toLowerCase() === address.toLowerCase();
  const gridSize = config?.gridSize ?? 36;
  const payout = previewPayout(bet.stake, bet.kind, gridSize);
  const kindLabel = BET_KIND_LABELS[bet.kind] ?? "Dig";

  async function decrypt() {
    if (!walletClient || !isLiveHandle(bet.resultHandle)) return;
    setError("");
    setBusy("decrypt");
    try {
      // Requires a wallet signature. Only this address is on the handle's ACL,
      // so no third party — and no admin — can run this.
      const attested = await decryptOwnResult({ walletClient, handle: bet.resultHandle, chainId });
      setVerdict({ won: attested.value, signatures: attested.signatures });
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(null);
    }
  }

  async function claim(won: boolean, signatures: Hex[]) {
    setError("");
    setBusy("claim");
    try {
      setHash(
        await writeContractAsync({
          ...gemHavenContract,
          functionName: "claim",
          args: [bet.betId, won, signatures],
          chainId,
        }),
      );
    } catch (cause) {
      setError(describeError(cause));
      setBusy(null);
    }
  }

  async function checkBonanza() {
    setError("");
    setBonanza("checking");
    try {
      // The bonanza bit was reveal()-ed at Dig time, so no wallet is needed.
      const attested = await revealPublicBit(bet.bonanzaHandle, chainId);
      if (!attested.value) {
        setBonanza("miss");
        return;
      }
      setBonanza("claiming");
      setHash(
        await writeContractAsync({
          ...gemHavenContract,
          functionName: "claimBonanza",
          args: [bet.betId, true, attested.signatures],
          chainId,
        }),
      );
    } catch (cause) {
      setError(describeError(cause));
      setBonanza("unknown");
    }
  }

  const status = (() => {
    if (bet.claimed) return { text: verdict?.won ? `Claimed ${formatEth(payout)} ETH` : "Settled", tone: "text-gem-teal", mark: "✓" };
    if (verdict?.won) return { text: "Won — ready to claim", tone: "text-amber-200", mark: "★" };
    if (verdict && !verdict.won) return { text: "Missed", tone: "text-slate-400", mark: "·" };
    return { text: "Sealed — decrypt to find out", tone: "text-gem-violet", mark: "◆" };
  })();

  return (
    <div className="rounded-xl border border-white/[0.07] bg-rock-void/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm text-slate-300">
            Dig #{bet.betId.toString()} · {kindLabel} · {formatEth(bet.stake)} ETH
          </p>
          {/* Deliberately no deposit index here — the contract does not expose it. */}
          <p className={`mt-0.5 text-xs ${status.tone}`}>
            <span aria-hidden className="mr-1">
              {status.mark}
            </span>
            {status.text}
            {!bet.bonanzaPaid && bonanza === "miss" && <span className="ml-2 text-slate-500">no bonanza</span>}
            {bet.bonanzaPaid && <span className="ml-2 text-amber-200/80">bonanza resolved</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!bet.claimed && own && !verdict && (
            <button
              type="button"
              onClick={decrypt}
              disabled={!walletClient || busy !== null}
              className="gem-button !px-4 !py-2 !text-xs"
            >
              {busy === "decrypt" ? "Decrypting…" : "Decrypt privately"}
            </button>
          )}

          {!bet.claimed && own && verdict?.won && (
            <button
              type="button"
              onClick={() => claim(true, verdict.signatures)}
              disabled={busy !== null}
              className="gem-button !border-amber-300/40 !bg-amber-300/10 !px-4 !py-2 !text-xs !text-amber-200 hover:!border-amber-300/70 hover:!bg-amber-300/20"
            >
              {busy === "claim"
                ? "Claiming…"
                : `Claim ${formatEth(payout)} ETH${bet.kind === 0 ? ` + ${formatShard(REWARD_PER_WIN)} SHARD` : ""}`}
            </button>
          )}

          {!bet.claimed && own && verdict && !verdict.won && (
            <button
              type="button"
              onClick={() => claim(false, verdict.signatures)}
              disabled={busy !== null}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-slate-400 transition hover:border-white/25"
            >
              {busy === "claim" ? "Sealing…" : "Mark settled"}
            </button>
          )}

          {!bet.bonanzaPaid && bonanza !== "miss" && (
            <button
              type="button"
              onClick={checkBonanza}
              disabled={bonanza === "checking" || bonanza === "claiming" || busy !== null}
              className="rounded-lg border border-amber-300/25 bg-amber-300/[0.05] px-3 py-1.5 text-xs text-amber-100/90 transition hover:border-amber-300/50"
            >
              {bonanza === "checking" ? "Checking…" : bonanza === "claiming" ? "Claiming pot…" : "Check bonanza"}
            </button>
          )}
        </div>
      </div>

      {verdict && !verdict.won && !bet.claimed && (
        <p className="mt-3 text-xs text-slate-500">
          This Dig missed. Your pick stays encrypted on chain — nothing about it was published. Marking it settled is
          optional; it only tidies this list.
        </p>
      )}

      {!own && (
        <p className="mt-3 text-xs text-slate-500">
          This Dig belongs to another wallet — only its owner can decrypt and claim it.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}
    </div>
  );
}
