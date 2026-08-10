import Link from "next/link";
import type { ReactNode } from "react";

import { BaseScanIcon, GitHubIcon } from "@/components/icons";

const GITHUB_URL = "https://github.com/xxcode66-source/gemhaven";
const BASESCAN_URL =
  "https://sepolia.basescan.org/address/0xea9fe3914f659902e285968253e17dc67138e0f7#code";

/**
 * Site footer: play links, transparency links, and the jam credit. Static —
 * no wallet or chain data, so it stays a server component.
 */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/[0.06] bg-rock-deep/50 backdrop-blur-sm">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-3 sm:px-8">
        <div>
          <p className="font-display text-lg tracking-[0.25em] text-slate-100">
            GEM<span className="text-gem-teal">HAVEN</span>
          </p>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            A confidential dig-to-earn cavern. Picks are sealed with Inco Lightning; draws settle in the same
            transaction they are made.
          </p>
        </div>

        <nav aria-label="Play">
          <p className="engraved mb-3">Play</p>
          <ul className="space-y-2 text-sm">
            <FooterLink href="/mine">The Cavern</FooterLink>
            <FooterLink href="/history">Dig History</FooterLink>
            <FooterLink href="/about">About the Mechanics</FooterLink>
          </ul>
        </nav>

        <nav aria-label="Transparency">
          <p className="engraved mb-3">Transparency</p>
          <ul className="space-y-2 text-sm">
            <FooterLink href={BASESCAN_URL} external icon={<BaseScanIcon className="h-4 w-4 shrink-0" />}>
              Contract on BaseScan
            </FooterLink>
            <FooterLink href={GITHUB_URL} external icon={<GitHubIcon className="h-4 w-4 shrink-0" />}>
              Source on GitHub
            </FooterLink>
            <FooterLink
              href={`${GITHUB_URL}/blob/main/REPORT.md`}
              external
              icon={<GitHubIcon className="h-4 w-4 shrink-0" />}
            >
              Audit report
            </FooterLink>
            <FooterLink href="https://www.inco.org" external icon={<span aria-hidden className="w-4 shrink-0 text-center text-gem-teal">◆</span>}>
              Inco Lightning
            </FooterLink>
          </ul>
        </nav>
      </div>

      <div className="border-t border-white/[0.05]">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-slate-600 sm:px-8">
          Built for the Inco Summer Game Jam — Hidden Mechanics track · MIT licensed · testnet play on Base Sepolia;
          nothing here is a financial product.
        </p>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  external,
  icon,
  children,
}: {
  href: string;
  external?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const className = "inline-flex items-center gap-2.5 text-slate-400 transition hover:text-gem-teal";
  if (external) {
    return (
      <li>
        <a href={href} target="_blank" rel="noreferrer" className={className}>
          {icon}
          {children}
        </a>
      </li>
    );
  }
  return (
    <li>
      <Link href={href} className={className}>
        {icon}
        {children}
      </Link>
    </li>
  );
}
