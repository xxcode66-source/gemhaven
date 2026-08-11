"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ConnectMenu } from "@/components/ConnectMenu";

const LINKS = [
  { href: "/mine", label: "Cavern" },
  { href: "/history", label: "History" },
];

/**
 * Persistent top bar: brand, page links, and the wallet dropdown. Kept thin so
 * the cavern wall stays the visual anchor of every page.
 */
export function Navbar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="sticky top-0 z-40 border-b border-white/[0.06] bg-rock-deep/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-1.5 px-3 sm:gap-4 sm:px-8">
        <Link href="/" className="flex items-baseline gap-2 sm:gap-3">
          <span aria-hidden className="text-gem-teal [text-shadow:0_0_14px_rgba(62,230,196,0.7)]">
            ◆
          </span>
          <span className="font-display text-base tracking-[0.18em] text-slate-100 sm:text-lg sm:tracking-[0.25em]">GEMHAVEN</span>
          <span className="hidden text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:inline">
            confidential dig-to-earn
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <ul className="flex items-center gap-1 sm:gap-2">
            {LINKS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-2 py-2 text-sm transition sm:px-3 ${
                      active
                        ? "bg-white/[0.06] text-gem-teal"
                        : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <ConnectMenu />
        </div>
      </div>
    </nav>
  );
}
