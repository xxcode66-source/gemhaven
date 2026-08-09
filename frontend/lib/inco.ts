/**
 * The one and only place the app talks to `@inco/lightning-js`.
 *
 * Components must import from here, never from the SDK directly. Two reasons:
 * the SDK surface stays pinned in one file, and the privacy rules below stay
 * enforceable by reading a single module.
 *
 * Two distinct disclosure paths exist, and they are not interchangeable:
 *
 *  - `revealPublicBit` uses `attestedReveal`, which needs no wallet. It only
 *    works on handles the contract has called `e.reveal()` on: in v2 that is
 *    exactly one handle per Dig — the bonanza-hit bit, public by design.
 *
 *  - `decryptOwnResult` uses `attestedDecrypt`, which requires the player to
 *    sign. It works because `bet()` called `won.allow(msg.sender)`, so the
 *    covalidators will only serve that bit to that address.
 *
 * A player's chosen deposit handle is never `reveal()`-ed and never `allow()`-ed
 * to anyone but the player, and this module intentionally exposes no function
 * that would decrypt one. `GemHaven.getBet` does not even return the handle.
 */
import { handleTypes } from "@inco/lightning-js";
import { Lightning } from "@inco/lightning-js/lite";
import { bytesToHex, type Account, type Address, type Chain, type Hex, type Transport, type WalletClient } from "viem";
import { base, baseSepolia } from "wagmi/chains";

import { DEFAULT_CHAIN_ID, type SupportedChainId } from "./contracts";

type LightningClient = Awaited<ReturnType<typeof Lightning.baseSepoliaTestnet>>;

/** An attestation ready to be forwarded to a `bytes[] signatures` argument. */
export type Attested<T> = {
  handle: Hex;
  value: T;
  /**
   * The SDK hands back `Uint8Array[]`; viem needs `0x…` strings for a
   * `bytes[]` parameter. Converted here so no call site has to remember.
   */
  signatures: Hex[];
};

/** `bytes32(0)` — what GemHaven returns for a handle that does not exist yet. */
export const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function isLiveHandle(handle: Hex | undefined): handle is Hex {
  return typeof handle === "string" && handle !== ZERO_HANDLE;
}

// One Lightning instance per chain, shared across the app. The constructor does
// network work (it resolves the deployment and covalidator set), so the promise
// is cached rather than the resolved value.
const clients = new Map<number, Promise<LightningClient>>();

function connect(chainId: SupportedChainId): Promise<LightningClient> {
  switch (chainId) {
    case base.id:
      return Lightning.baseMainnet({
        hostChainRpcUrls: rpcUrls(process.env.NEXT_PUBLIC_BASE_RPC_URL),
      });
    case baseSepolia.id:
      return Lightning.baseSepoliaTestnet({
        hostChainRpcUrls: rpcUrls(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL),
      });
  }
}

function rpcUrls(configured: string | undefined): readonly string[] | undefined {
  if (!configured) return undefined;
  const urls = configured
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  return urls.length > 0 ? urls : undefined;
}

export function getLightning(chainId: SupportedChainId = DEFAULT_CHAIN_ID): Promise<LightningClient> {
  let client = clients.get(chainId);
  if (!client) {
    client = connect(chainId).catch((error) => {
      // Do not cache a failed handshake — a transient RPC outage would
      // otherwise poison the client for the rest of the session.
      clients.delete(chainId);
      throw error;
    });
    clients.set(chainId, client);
  }
  return client;
}

function toHexSignatures(signatures: Uint8Array[]): Hex[] {
  return signatures.map((signature) => bytesToHex(signature));
}

function expectBoolean(value: bigint | boolean, handle: Hex): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`expected a boolean plaintext for handle ${handle}, got ${typeof value}`);
  }
  return value;
}

/**
 * Encrypts the deposit a player picked, bound to their address and to GemHaven.
 *
 * The ciphertext is only accepted by `newEuint256` when both addresses match the
 * ones baked in here, which is why the pick cannot be replayed by anyone else.
 * The plaintext index never leaves the browser.
 */
export async function encryptDeposit(params: {
  deposit: number;
  account: Address;
  gemHaven: Address;
  chainId?: SupportedChainId;
}): Promise<Hex> {
  const { deposit, account, gemHaven, chainId = DEFAULT_CHAIN_ID } = params;
  if (!Number.isInteger(deposit) || deposit < 0) {
    throw new Error(`deposit index must be a non-negative integer, got ${deposit}`);
  }

  const lightning = await getLightning(chainId);
  return lightning.encrypt(BigInt(deposit), {
    accountAddress: account,
    dappAddress: gemHaven,
    handleType: handleTypes.euint256,
  });
}

/**
 * Fetches an attestation for an `ebool` handle the contract has already
 * `reveal()`-ed — in v2 that is only the bonanza-hit bit of a Dig.
 *
 * No wallet signature is involved: that one bit is public by design, so the
 * covalidators will attest it for anyone who asks, and `claimBonanza` is
 * permissionless on top.
 */
export async function revealPublicBit(handle: Hex, chainId: SupportedChainId = DEFAULT_CHAIN_ID): Promise<Attested<boolean>> {
  const lightning = await getLightning(chainId);
  const [attestation] = await lightning.attestedReveal([handle]);
  if (!attestation) {
    throw new Error(`no attestation returned for handle ${handle}`);
  }
  return {
    handle: attestation.handle,
    value: expectBoolean(attestation.plaintext.value, handle),
    signatures: toHexSignatures(attestation.covalidatorSignatures),
  };
}

/**
 * Fetches the player's own win/loss bit for one Dig.
 *
 * Requires a wallet signature and only succeeds for the address that `bet()`
 * granted access to — nobody else, including the contract owner, can obtain
 * this value. What is served is a single bit: whether this Dig won. The
 * deposit the Dig picked is never part of it.
 */
export async function decryptOwnResult(params: {
  walletClient: WalletClient<Transport, Chain, Account>;
  handle: Hex;
  chainId?: SupportedChainId;
}): Promise<Attested<boolean>> {
  const { walletClient, handle, chainId = DEFAULT_CHAIN_ID } = params;
  const lightning = await getLightning(chainId);
  const [attestation] = await lightning.attestedDecrypt(walletClient, [handle]);
  if (!attestation) {
    throw new Error(`no attestation returned for handle ${handle}`);
  }
  return {
    handle: attestation.handle,
    value: expectBoolean(attestation.plaintext.value, handle),
    signatures: toHexSignatures(attestation.covalidatorSignatures),
  };
}
