"use client";

import { useMemo } from "react";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";
import type { Address, Hex } from "viem";

import {
  deploymentChainId,
  gemHavenContract,
  isConfigured,
  isSupportedChainId,
  shardContract,
  shardIsConfigured,
  type BetKindValue,
  type SupportedChainId,
} from "./contracts";

/** The chain reads should target: the wallet's chain when supported, else the deployment's. */
export function useActiveChainId(): SupportedChainId {
  const walletChainId = useChainId();
  return isSupportedChainId(walletChainId) ? walletChainId : deploymentChainId;
}

/** True when the wallet is on a chain other than the one the contracts live on. */
export function useNetworkMismatch(): boolean {
  const { isConnected } = useAccount();
  const walletChainId = useChainId();
  return isConnected && walletChainId !== deploymentChainId;
}

/** Deploy-time cavern parameters. Long stale window — these barely move. */
export type CavernConfig = {
  gridSize: number;
  minStake: bigint;
  shard: Address;
};

export function useCavernConfig(): { config: CavernConfig | undefined; isLoading: boolean } {
  const chainId = useActiveChainId();

  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...gemHavenContract, functionName: "gridSize", chainId },
      { ...gemHavenContract, functionName: "minStake", chainId },
      { ...gemHavenContract, functionName: "shard", chainId },
    ],
    allowFailure: false,
    query: { enabled: isConfigured, staleTime: 5 * 60_000 },
  });

  const config = useMemo<CavernConfig | undefined>(() => {
    if (!data) return undefined;
    const [gridSize, minStake, shard] = data;
    // wagmi types the batch result as an array rather than a tuple, so under
    // `noUncheckedIndexedAccess` each slot is nullable until checked.
    if (gridSize === undefined || minStake === undefined || shard === undefined) {
      return undefined;
    }
    return {
      gridSize: Number(gridSize),
      minStake,
      shard,
    };
  }, [data]);

  return { config, isLoading };
}

/**
 * ETH a Dig of `kind` must carry on top of its stake to cover Inco compute
 * fees. Tracks Inco's per-op fee, which can change on Lightning upgrades.
 */
export function useIncoFeeBudget(kind: BetKindValue): bigint | undefined {
  const chainId = useActiveChainId();

  const { data } = useReadContract({
    ...gemHavenContract,
    functionName: "incoFeeBudget",
    args: [kind],
    chainId,
    query: { enabled: isConfigured, refetchInterval: 60_000 },
  });

  return data;
}

/** House-level numbers that move with play. Short poll — the game is instant. */
export type GameStats = {
  bankroll: bigint;
  bonanzaPot: bigint;
  protocolFees: bigint;
  escrow: bigint;
  nextBetId: bigint;
};

export function useGameStats(): { stats: GameStats | undefined; isLoading: boolean; refetch: () => Promise<unknown> } {
  const chainId = useActiveChainId();

  const query = useReadContracts({
    contracts: [
      { ...gemHavenContract, functionName: "bankroll", chainId },
      { ...gemHavenContract, functionName: "bonanzaPot", chainId },
      { ...gemHavenContract, functionName: "protocolFees", chainId },
      { ...gemHavenContract, functionName: "escrow", chainId },
      { ...gemHavenContract, functionName: "nextBetId", chainId },
    ],
    allowFailure: false,
    query: { enabled: isConfigured, refetchInterval: 8_000 },
  });

  const stats = useMemo<GameStats | undefined>(() => {
    if (!query.data) return undefined;
    const [bankroll, bonanzaPot, protocolFees, escrow, nextBetId] = query.data;
    if (
      bankroll === undefined ||
      bonanzaPot === undefined ||
      protocolFees === undefined ||
      escrow === undefined ||
      nextBetId === undefined
    ) {
      return undefined;
    }
    return { bankroll, bonanzaPot, protocolFees, escrow, nextBetId };
  }, [query.data]);

  return { stats, isLoading: query.isLoading, refetch: query.refetch };
}

export type PlayerBet = {
  betId: bigint;
  player: Address;
  stake: bigint;
  /** `BetKind` as a number — index into `BET_KIND_LABELS`. */
  kind: number;
  claimed: boolean;
  bonanzaPaid: boolean;
  /** Encrypted win/loss bit, decryptable only by `player`. */
  resultHandle: Hex;
  /** Encrypted bonanza-hit bit, publicly revealed at Dig time. */
  bonanzaHandle: Hex;
};

/**
 * The connected wallet's Digs.
 *
 * Note what is absent: nothing here says which deposit a Pick chose.
 * `GemHaven.getBet` does not return that handle at all, so the UI physically
 * cannot render it — the privacy guarantee is enforced by the ABI, not by
 * discipline in this file.
 */
export function usePlayerBets(): { bets: PlayerBet[]; isLoading: boolean; refetch: () => Promise<unknown> } {
  const chainId = useActiveChainId();
  const { address } = useAccount();

  const idsQuery = useReadContract({
    ...gemHavenContract,
    functionName: "getPlayerBets",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId,
    query: {
      enabled: isConfigured && Boolean(address),
      refetchInterval: 8_000,
    },
  });

  const ids = idsQuery.data;
  const idKey = ids?.join(",") ?? "";

  const detailQuery = useReadContracts({
    contracts: (ids ?? []).map((betId) => ({
      ...gemHavenContract,
      functionName: "getBet" as const,
      args: [betId] as const,
      chainId,
    })),
    allowFailure: false,
    query: { enabled: (ids?.length ?? 0) > 0, refetchInterval: 8_000 },
  });

  const bets = useMemo<PlayerBet[]>(() => {
    if (!detailQuery.data || !ids) return [];
    // Newest first — the list is chronological on chain.
    return detailQuery.data
      .map((view, i): PlayerBet => ({
        betId: ids[i] ?? 0n,
        player: view.player,
        stake: view.stake,
        kind: view.kind,
        claimed: view.claimed,
        bonanzaPaid: view.bonanzaPaid,
        resultHandle: view.resultHandle,
        bonanzaHandle: view.bonanzaHandle,
      }))
      .reverse();
    // `ids` is a new array each render, so compare its contents via idKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQuery.data, idKey]);

  return {
    bets,
    isLoading: idsQuery.isLoading || detailQuery.isLoading,
    refetch: async () => {
      await idsQuery.refetch();
      await detailQuery.refetch();
    },
  };
}

/** $SHARD balance, supply, and the lifetime mining score for the connected wallet. */
export function useShardBalance() {
  const chainId = useActiveChainId();
  const { address } = useAccount();

  const query = useReadContracts({
    contracts: [
      { ...shardContract, functionName: "balanceOf", args: [address ?? "0x0000000000000000000000000000000000000000"], chainId },
      { ...shardContract, functionName: "totalSupply", chainId },
      { ...shardContract, functionName: "symbol", chainId },
      {
        // Mining score lives on the game contract: lifetime $SHARD minted to
        // this wallet. Unlike the balance it cannot move between wallets.
        ...gemHavenContract,
        functionName: "totalMined",
        args: [address ?? "0x0000000000000000000000000000000000000000"],
        chainId,
      },
    ],
    allowFailure: false,
    query: { enabled: shardIsConfigured && isConfigured && Boolean(address), refetchInterval: 15_000 },
  });

  const [balance, totalSupply, symbol, totalMined] = query.data ?? [];

  return {
    balance,
    totalSupply,
    symbol: symbol ?? "SHARD",
    totalMined,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
