import Link from "next/link";

const GITHUB_URL = "https://github.com/xxcode66-source/gemhaven";
const BASESCAN_URL =
  "https://sepolia.basescan.org/address/0x444b9027c7e76e9c62a8efe1e6364c77b7d5f215#code";

/**
 * Site footer: play links, transparency links, and the jam credit. Static —
 * no wallet or chain data, so it stays a server component.
 */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/[0.06] bg-rock-deep/50 backdrop-blur-sm">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-3 sm:px-8">
        <div>
          <p className="flex items-baseline gap-2.5">
            <span aria-hidden className="text-sm text-gem-teal [text-shadow:0_0_14px_rgba(62,230,196,0.7)]">◆</span>
            <span className="font-display text-lg tracking-[0.25em] text-slate-100">GEMHAVEN</span>
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
            <FooterLink href={BASESCAN_URL} external>
              Contract on BaseScan
            </FooterLink>
            <FooterLink href={GITHUB_URL} external>
              Source on GitHub
            </FooterLink>
            <FooterLink href={`${GITHUB_URL}/blob/main/REPORT.md`} external>
              Audit report
            </FooterLink>
            <FooterLink href="https://www.inco.org" external>
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

function FooterLink({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  const className = "text-slate-400 transition hover:text-gem-teal";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
        <span aria-hidden className="ml-1.5 text-[0.65rem] text-slate-600">
          ↗
        </span>
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
