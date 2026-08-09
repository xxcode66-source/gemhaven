import { formatUnits } from "viem";

/** Trims trailing zeros so `0.010000` reads as `0.01`. */
function trim(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "");
}

/** ETH with enough precision for testnet-sized stakes. */
export function formatEth(wei: bigint | undefined, decimals = 5): string {
  if (wei === undefined) return "—";
  if (wei === 0n) return "0";
  const formatted = Number(formatUnits(wei, 18)).toFixed(decimals);
  const trimmed = trim(formatted);
  // Anything smaller than the display precision would otherwise render as "0".
  return trimmed === "0" ? `<0.${"0".repeat(decimals - 1)}1` : trimmed;
}

/** $SHARD balances — whole tokens are the common case, so 2dp is plenty. */
export function formatShard(amount: bigint | undefined): string {
  if (amount === undefined) return "—";
  return trim(Number(formatUnits(amount, 18)).toFixed(2));
}

export function formatUsdc(amount: bigint | undefined): string {
  if (amount === undefined) return "—";
  return trim(Number(formatUnits(amount, 6)).toFixed(2));
}

/** `mm:ss` countdown; clamps at zero rather than going negative. */
export function formatCountdown(secondsRemaining: number): string {
  const clamped = Math.max(0, Math.floor(secondsRemaining));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function shortenAddress(address: string | undefined): string {
  if (!address) return "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Turns a contract revert into something a player can act on. Custom errors are
 * named after the condition they guard, so the name alone is usually the whole
 * explanation.
 */
const REVERT_MESSAGES: Record<string, string> = {
  StakeBelowMinimum: "That amount is below the minimum Dig.",
  StakeAboveMaximum: "That Dig is larger than the bankroll can safely cover — pick a smaller amount.",
  UnknownBet: "That Dig does not exist on this deployment.",
  NotYourBet: "That Dig belongs to another wallet.",
  AlreadyClaimed: "This Dig has already been claimed.",
  BonanzaAlreadyPaid: "The Bonanza for this Dig was already paid out.",
  BadAttestation: "The attestation was rejected. Try again.",
  NothingToWithdraw: "There is no surplus to withdraw.",
  TransferFailed: "The ETH transfer failed.",
};

export function describeError(error: unknown): string {
  if (!error) return "";
  const raw = error instanceof Error ? `${error.message}\n${"cause" in error ? String(error.cause) : ""}` : String(error);

  for (const [name, message] of Object.entries(REVERT_MESSAGES)) {
    if (raw.includes(name)) return message;
  }
  if (/user rejected|denied transaction|rejected the request/i.test(raw)) {
    return "You rejected the request in your wallet.";
  }
  if (/insufficient funds/i.test(raw)) {
    return "Not enough ETH to cover the stake plus gas.";
  }

  const firstLine = raw.split("\n").find((line) => line.trim().length > 0);
  return firstLine?.trim() ?? "Something went wrong.";
}
