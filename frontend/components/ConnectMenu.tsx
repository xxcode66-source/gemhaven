"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { CHAIN_LABELS, deploymentChainId, isConfigured, isSupportedChainId } from "@/lib/contracts";
import { shortenAddress } from "@/lib/format";

/**
 * Compact wallet control for the navbar: a single button that opens a dropdown
 * with the list of detected wallets, or the connected account's details.
 * Replaces the old full-width ConnectBar.
 */
export function ConnectMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const onDeploymentChain = chainId === deploymentChainId;
  const deploymentLabel = CHAIN_LABELS[deploymentChainId];

  // Click outside or Escape closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          isConnected
            ? "flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs text-slate-200 transition hover:border-white/25"
            : "gem-button !px-4 !py-2 !text-xs"
        }
      >
        {isConnected ? (
          <>
            <span aria-hidden className={`inline-block size-1.5 rounded-full ${onDeploymentChain ? "bg-gem-teal" : "bg-amber-300"}`} />
            {shortenAddress(address)}
          </>
        ) : (
          "Connect wallet"
        )}
        <span aria-hidden className="text-[9px] text-slate-400">
          ▼
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 space-y-3 rounded-xl border border-white/10 bg-rock-deep/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-md"
        >
          {!isConfigured && (
            <p role="status" className="rounded-lg border border-rose-400/30 bg-rose-400/[0.07] px-3 py-2 text-xs leading-relaxed text-rose-200">
              No GemHaven address configured. Deploy the contracts and copy the printed{" "}
              <code className="font-mono">NEXT_PUBLIC_*</code> lines into <code className="font-mono">frontend/.env.local</code>.
            </p>
          )}

          {isConnected ? (
            <>
              <div className="space-y-1">
                <p className="engraved">Connected</p>
                <p className="break-all font-mono text-xs text-slate-200">{address}</p>
              </div>

              {onDeploymentChain ? (
                <p className="text-xs text-slate-400">
                  On <span className="text-gem-teal">{deploymentLabel}</span> — same network as the deployment.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-amber-100/90">
                    Your wallet is on {isSupportedChainId(chainId) ? CHAIN_LABELS[chainId] : `chain ${chainId}`}, but
                    GemHaven is deployed on {deploymentLabel}.
                  </p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => switchChain({ chainId: deploymentChainId })}
                    className="gem-button w-full !py-2 !text-xs"
                  >
                    Switch to {deploymentLabel}
                  </button>
                </div>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
                className="w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 transition hover:border-white/25 hover:text-slate-200"
              >
                Disconnect
              </button>
            </>
          ) : connectors.length > 0 ? (
            <>
              <p className="engraved">Choose a wallet</p>
              <ul className="space-y-1.5">
                {connectors.map((connector) => (
                  <li key={connector.uid}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        connect({ connector });
                        setOpen(false);
                      }}
                      disabled={isPending}
                      className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-left text-sm text-slate-200 transition hover:border-gem-teal/40 hover:bg-gem-teal/[0.08] disabled:opacity-50"
                    >
                      {connector.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            // Wallets are discovered via EIP-6963 rather than declared up
            // front, so this list is empty until one announces itself.
            <p className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs leading-relaxed text-slate-500">
              No browser wallet detected. Install or unlock a wallet extension, then reopen this menu.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
