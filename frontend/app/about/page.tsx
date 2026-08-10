import Link from "next/link";

export const metadata = {
  title: "About — GemHaven",
  description:
    "How GemHaven works: 36 encrypted deposits, one hidden Motherlode per Dig, fixed multipliers, and a rolling Bonanza pot — all settled by Inco Lightning.",
};

export default function AboutPage() {
  return (
    <main>
      {/* ------------------------------------------------------------- about -- */}
      <section className="mx-auto max-w-6xl px-5 pt-20 pb-16 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-4">
            <p className="engraved">About GemHaven</p>
            <h1 className="text-balance font-display text-3xl tracking-wide text-slate-100 sm:text-4xl">
              A cavern where nobody can see what you&apos;re mining
            </h1>
            <p className="leading-relaxed text-slate-400">
              GemHaven is an instant dig-to-earn game. You pick a deposit on the wall, stake ETH to Dig, and the
              cavern draws its own encrypted Motherlode in that same transaction. Win or lose, you know immediately —
              there are no rounds, no timers, no waiting for other players.
            </p>
            <p className="leading-relaxed text-slate-400">
              What makes it different is what the chain never learns: your pick is encrypted in your browser with Inco
              Lightning and compared to the draw while still encrypted. Not the contract owner, not other players, not
              even your own transaction history can tell which deposit you chose.
            </p>
          </div>

          <dl className="grid content-start gap-4 sm:grid-cols-2">
            <Stat label="Deposits on the wall" value="36" />
            <Stat label="Straight Pick payout" value="34.92x" />
            <Stat label="Even / Odd payout" value="1.94x" />
            <Stat label="Minimum Dig" value="0.001 ETH" />
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------------- how it works -- */}
      <section className="border-y border-white/[0.05] bg-white/[0.015]">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="engraved">How it works</p>
          <h2 className="mt-2 font-display text-3xl tracking-wide text-slate-100">Three moves. That&apos;s the whole game.</h2>

          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rock-panel relative p-6">
                <p className="font-display text-sm tracking-[0.3em] text-gem-teal">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 font-display text-xl tracking-wide text-slate-100">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-10">
            <Link href="/mine" className="gem-button !px-6 !py-3">
              Start Mining
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ privacy -- */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <p className="engraved">Hidden mechanics</p>
            <h2 className="font-display text-3xl tracking-wide text-slate-100">Powered by Inco Lightning</h2>
            <p className="text-sm leading-relaxed text-slate-400">
              Fully homomorphic encryption lets the contract compare your encrypted pick against an encrypted draw
              without decrypting either. The only things the chain ever sees are three items per Dig:
            </p>
          </div>
          <ul className="space-y-4 lg:col-span-2">
            {DISCLOSURES.map((item, index) => (
              <li key={item.title} className="rock-panel flex gap-4 p-5">
                <span aria-hidden className="font-display text-lg text-gem-teal">
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm text-slate-100">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------ bonanza -- */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-8 sm:p-10">
          <div className="max-w-2xl space-y-4">
            <p className="engraved text-amber-200/80">The golden deposit</p>
            <h2 className="font-display text-3xl tracking-wide text-amber-100">Bonanza</h2>
            <p className="leading-relaxed text-amber-100/80">
              Every Dig sets aside 1% of its stake into a rolling pot. If the cavern&apos;s draw lands on the golden
              deposit — index 8 — the whole pot is released to that player on the spot, on top of the Dig&apos;s own
              result. One public bit per Dig says whether it hit; who got it, and what they picked, stays sealed.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ footer -- */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-6xl space-y-2 px-5 py-8 text-xs leading-relaxed text-slate-600 sm:px-8">
          <p>
            GemHaven is a hackathon build for Inco&apos;s Summer Game Jam. The contracts are unaudited, wins are capped
            by the bankroll&apos;s solvency limit, and a ~3% house edge is baked into the fixed multipliers.
          </p>
          <p>Play responsibly — even on testnet ETH.</p>
        </div>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rock-panel p-5">
      <dt className="engraved">{label}</dt>
      <dd className="mt-2 font-mono text-2xl tabular-nums text-slate-100">{value}</dd>
    </div>
  );
}

const STEPS = [
  {
    title: "Pick a deposit",
    body: "Choose one of the 36 deposits on the wall — or play Even, Odd, or All across the whole wall. Your pick is encrypted in your browser before it ever leaves it.",
  },
  {
    title: "Dig with ETH",
    body: "Send your stake from 0.001 ETH. The contract draws an encrypted Motherlode and compares it to your sealed pick inside the same transaction.",
  },
  {
    title: "Claim instantly",
    body: "Decrypt your win bit with your wallet and claim. Straight picks pay 34.92x, parity pays 1.94x, and wins mint $SHARD — 10 for a Pick, 2 for parity, 1 for an All grind.",
  },
];

const DISCLOSURES = [
  {
    title: "Your stake and Dig kind",
    body: "The chain sees how much you staked and whether it was a Pick, Even, Odd or All Dig — nothing about which deposit you chose.",
  },
  {
    title: "One public bonanza bit",
    body: "Whether the draw hit the golden deposit. This one bit releases the Bonanza pot; everything else about the draw stays encrypted.",
  },
  {
    title: "A sealed win/loss bit",
    body: "Your result is a single encrypted bit that only your wallet can decrypt. Nobody else can learn it — not even the contract owner.",
  },
];
