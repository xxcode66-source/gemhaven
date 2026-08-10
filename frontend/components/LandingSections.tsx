"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { AnimatedEth, AnimatedInt } from "@/components/AnimatedEth";
import { useGameStats } from "@/lib/hooks";

const GITHUB_URL = "https://github.com/xxcode66-source/gemhaven";
const BASESCAN_URL = `https://sepolia.basescan.org/address/${
  process.env.NEXT_PUBLIC_GEMHAVEN_ADDRESS ?? "0x444b9027c7e76e9c62a8efe1e6364c77b7d5f215"
}#code`;

/** The three moves of the Hidden Mechanics thesis, in play order. */
const STEPS = [
  {
    title: "Seal your pick",
    copy: "Choose a deposit — or a parity. Your choice is encrypted in this browser with Inco Lightning before it ever leaves your machine.",
  },
  {
    title: "Dig once",
    copy: "One transaction draws the encrypted Motherlode and settles the Dig against it. No rounds, no queue, no reveal window to race.",
  },
  {
    title: "Claim what is yours",
    copy: "Only your wallet can decrypt the outcome. Winning ETH — and $SHARD on straight strikes — are paid out the moment you claim.",
  },
];

/**
 * Below-the-fold landing content: live chain proof, the mechanics in three
 * moves, and the trust strip. Kept as one client island so the page shell
 * stays a server component.
 */
export function LandingSections() {
  const reduceMotion = useReducedMotion();
  const { stats } = useGameStats();

  const fadeUp = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-60px" },
      };

  // nextBetId counts the next Dig's slot, so settled Digs = id − 1.
  const digsSettled = stats ? stats.nextBetId - 1n : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-20 px-5 pb-28 sm:px-8">
      {/* -------------------------------------------- live proof from chain -- */}
      <motion.section aria-labelledby="live-heading" className="pt-10" {...fadeUp}>
        <header className="mb-6 flex items-center gap-3">
          <p className="engraved" id="live-heading">
            Live on Base Sepolia
          </p>
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-gem-teal" />
        </header>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="House bankroll">
            <AnimatedEth wei={stats?.bankroll} /> <Unit>ETH</Unit>
          </Stat>
          <Stat label="Bonanza pot" accent>
            <AnimatedEth wei={stats?.bonanzaPot} /> <Unit>ETH</Unit>
          </Stat>
          <Stat label="Digs settled">
            <AnimatedInt value={digsSettled} />
          </Stat>
          <Stat label="Protocol fees">
            <AnimatedEth wei={stats?.protocolFees} /> <Unit>ETH</Unit>
          </Stat>
        </dl>
      </motion.section>

      {/* -------------------------------------------------- how it works ---- */}
      <section aria-labelledby="steps-heading">
        <motion.header className="mb-8 max-w-2xl" {...fadeUp}>
          <p className="engraved">Hidden mechanics</p>
          <h2 id="steps-heading" className="mt-1 font-display text-3xl tracking-wide text-slate-100">
            The draw stays sealed. Your pick stays sealed. Only your payout opens.
          </h2>
        </motion.header>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.title}
              className="rock-panel group p-6 transition-colors hover:border-gem-teal/25"
              {...(reduceMotion ? {} : { ...fadeUp, transition: { delay: i * 0.08 } })}
            >
              <p aria-hidden className="mb-3 font-display text-3xl leading-none text-gem-teal/60 transition-colors group-hover:text-gem-teal">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mb-2 font-display text-xl tracking-wide text-slate-100">{step.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{step.copy}</p>
            </motion.li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------- trust strip --- */}
      <motion.section aria-label="Transparency" {...fadeUp}>
        <ul className="flex flex-wrap items-center gap-3">
          <TrustBadge href={BASESCAN_URL}>Contracts verified on BaseScan</TrustBadge>
          <TrustBadge href={GITHUB_URL}>Open source on GitHub</TrustBadge>
          <TrustBadge href="https://www.inco.org">Hidden mechanics by Inco Lightning</TrustBadge>
          <TrustBadge>Live on Base Sepolia</TrustBadge>
        </ul>
      </motion.section>

      {/* -------------------------------------------------------- final CTA -- */}
      <motion.section className="rock-panel flex flex-col gap-5 p-8 sm:flex-row sm:items-center sm:justify-between" {...fadeUp}>
        <div>
          <h2 className="font-display text-2xl tracking-wide text-slate-100">The wall is open.</h2>
          <p className="mt-1 text-sm text-slate-400">No account, no deposit flow — connect a wallet and Dig.</p>
        </div>
        <Link href="/mine" className="gem-button shrink-0 !px-8 !py-3.5 !text-base">
          Enter the Cavern
        </Link>
      </motion.section>
    </div>
  );
}

function Stat({ label, accent, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur-sm transition-colors ${
        accent
          ? "border-amber-300/25 bg-amber-300/[0.05]"
          : "border-white/[0.07] bg-rock-deep/60 hover:border-gem-teal/20"
      }`}
    >
      <dt className="engraved">{label}</dt>
      <dd className={`mt-1.5 font-mono text-xl ${accent ? "text-amber-200" : "text-slate-100"}`}>{children}</dd>
    </div>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-slate-500">{children}</span>;
}

function TrustBadge({ href, children }: { href?: string; children: React.ReactNode }) {
  const badge =
    "inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] px-4 py-2 text-xs text-slate-300 backdrop-blur-sm transition";
  return (
    <li className="list-none">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`${badge} hover:border-gem-teal/35 hover:text-gem-teal`}
        >
          {children}
        </a>
      ) : (
        <span className={badge}>{children}</span>
      )}
    </li>
  );
}
