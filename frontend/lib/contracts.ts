import { base, baseSepolia } from "wagmi/chains";
import { getAddress, isAddress, type Address } from "viem";

import { gemHavenAbi } from "./abi/GemHaven";
import { shardTokenAbi } from "./abi/ShardToken";

export { gemHavenAbi, shardTokenAbi };

/**
 * GemHaven runs on Base Sepolia by default. Base mainnet stays supported so
 * mainnet wallets get a clear "deployment is on Sepolia" notice instead of
 * silently reading nothing.
 */
export const supportedChains = [baseSepolia, base] as const;
export type SupportedChainId = (typeof supportedChains)[number]["id"];

export const DEFAULT_CHAIN_ID: SupportedChainId = baseSepolia.id;

export function isSupportedChainId(id: number | undefined): id is SupportedChainId {
  return id === baseSepolia.id || id === base.id;
}

/** Human labels used in the network banner. */
export const CHAIN_LABELS: Record<SupportedChainId, string> = {
  [baseSepolia.id]: "Base Sepolia",
  [base.id]: "Base",
};

function readAddress(raw: string | undefined): Address | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (isAddress(trimmed)) return getAddress(trimmed);
  // Tolerate a miscased EIP-55 string: forge's console log does not emit
  // checksummed addresses, and viem rejects invalid mixed case outright.
  const lowered = trimmed.toLowerCase();
  if (isAddress(lowered)) return getAddress(lowered);
  return undefined;
}

/**
 * Deployed addresses. These come from `forge script script/Deploy.s.sol`, which
 * prints the two lines below verbatim. A single set is configured at a time —
 * `NEXT_PUBLIC_CHAIN_ID` states which chain they belong to so the UI can warn
 * when the wallet is pointed somewhere else.
 */
export const contractAddresses = {
  gemHaven: readAddress(process.env.NEXT_PUBLIC_GEMHAVEN_ADDRESS),
  shard: readAddress(process.env.NEXT_PUBLIC_SHARD_ADDRESS),
} as const;

/** The chain the configured addresses were deployed to. */
export const deploymentChainId: SupportedChainId = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
  return isSupportedChainId(raw) ? raw : DEFAULT_CHAIN_ID;
})();

export const isConfigured = Boolean(contractAddresses.gemHaven);
export const shardIsConfigured = Boolean(contractAddresses.shard);

/**
 * Stand-in used when an address is not configured yet. Reads are always gated on
 * the matching `*IsConfigured` flag, so this is never actually dialled — it
 * exists so the contract configs below can be non-optional, which is what keeps
 * wagmi's return types inferred instead of `unknown`.
 */
const UNCONFIGURED = "0x0000000000000000000000000000000000000000" as const;

/** Throwing accessor for call sites that have already checked `isConfigured`. */
export function requireGemHavenAddress(): Address {
  const address = contractAddresses.gemHaven;
  if (!address) {
    throw new Error(
      "NEXT_PUBLIC_GEMHAVEN_ADDRESS is not set — copy the value printed by the deploy script into frontend/.env.local",
    );
  }
  return address;
}

export const gemHavenContract = {
  address: contractAddresses.gemHaven ?? UNCONFIGURED,
  abi: gemHavenAbi,
} as const;

export const shardContract = {
  address: contractAddresses.shard ?? UNCONFIGURED,
  abi: shardTokenAbi,
} as const;

/** Mirrors `GemHaven.BetKind`. */
export const BetKind = {
  Pick: 0,
  Even: 1,
  Odd: 2,
  All: 3,
} as const;

export type BetKindValue = (typeof BetKind)[keyof typeof BetKind];

export const BET_KIND_LABELS: Record<number, string> = {
  [BetKind.Pick]: "Pick",
  [BetKind.Even]: "Even",
  [BetKind.Odd]: "Odd",
  [BetKind.All]: "All",
};

/** Multipliers x 100, mirroring the `GemHaven` constants (3492 = 34.92x). */
export const STRAIGHT_MULT_BPS = 3_492n;
export const EVEN_ODD_MULT_BPS = 194n;
export const MULT_DENOMINATOR = 100n;

/** `GemHaven.BONANZA_INDEX` — the golden deposit that releases the Bonanza pot. */
export const BONANZA_INDEX = 7;

/** `GemHaven.REWARD_PER_WIN` — fixed 10 SHARD per winning Pick claim. */
export const REWARD_PER_WIN = 10n * 10n ** 18n;

/** Mirrors of `GemHaven.REWARD_PER_PARITY_WIN` / `REWARD_PER_ALL_WIN`. */
export const REWARD_PER_PARITY_WIN = 2n * 10n ** 18n;
export const REWARD_PER_ALL_WIN = 1n * 10n ** 18n;

/** `$SHARD` minted for a winning claim of `kind` — mirrors `shardReward(kind)`. */
export function shardRewardFor(kind: number): bigint {
  if (kind === BetKind.Pick) return REWARD_PER_WIN;
  if (kind === BetKind.All) return REWARD_PER_ALL_WIN;
  return REWARD_PER_PARITY_WIN;
}

/** Deposits covered per kind: Pick 1, parity half the wall, All the whole wall. */
export function coverageOf(kind: number, gridSize: number): number {
  if (kind === BetKind.All) return gridSize;
  if (kind === BetKind.Pick) return 1;
  return gridSize / 2;
}

export const BPS_DENOMINATOR = 10_000n;

/**
 * Mirrors the contract's per-Dig Bonanza cut. Used only for copy — the split
 * itself happens on chain and is never trusted to these constants.
 */
export const BONANZA_BPS = 100n;

/** Local mirror of `GemHaven.payoutOf` for payout previews before sending. */
export function previewPayout(stake: bigint, kind: number, gridSize: number): bigint {
  if (kind === BetKind.All) {
    return (stake * STRAIGHT_MULT_BPS) / (MULT_DENOMINATOR * BigInt(gridSize));
  }
  const mult = kind === BetKind.Pick ? STRAIGHT_MULT_BPS : EVEN_ODD_MULT_BPS;
  return (stake * mult) / MULT_DENOMINATOR;
}
