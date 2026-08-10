import Image from "next/image";
import Link from "next/link";

import { LandingSections } from "@/components/LandingSections";

export default function LandingPage() {
  return (
    <main>
      {/* -------------------------------------------------------------- hero -- */}
      <section className="relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden">
        <Image
          src="/hero-cavern.png"
          alt="The GemHaven cavern wall, threaded with glowing crystal veins"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Keep the hero text legible over the art and blend its lower edge into the page. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-rock-deep/95 via-rock-deep/60 to-transparent" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-rock-deep to-transparent" />

        <div className="relative mx-auto w-full max-w-6xl px-5 py-24 sm:px-8">
          <div className="max-w-xl space-y-6">
            <p className="engraved">Confidential dig-to-earn on Base</p>
            <h1 className="text-balance font-display text-5xl leading-tight tracking-wide text-slate-50 sm:text-6xl">
              Dig the wall.
              <br />
              Keep your pick secret.
            </h1>
            <p className="text-balance text-lg leading-relaxed text-slate-300">
              36 encrypted deposits, one hidden Motherlode per Dig. Your pick never touches the chain in plaintext —
              wins settle in the same transaction they are made. Straight picks pay 34.92x.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/mine" className="gem-button !px-7 !py-3.5 !text-base">
                Start Mining
              </Link>
              <Link
                href="/about"
                className="rounded-xl border border-white/15 bg-white/[0.04] px-7 py-3.5 text-base text-slate-200 backdrop-blur-sm transition hover:border-white/30 hover:bg-white/[0.08]"
              >
                Read About
              </Link>
            </div>
            <p className="text-xs text-slate-500">
              Live on Base Sepolia · hidden mechanics by Inco Lightning · no account, no rounds, no waiting
            </p>
          </div>
        </div>
      </section>

      {/* Live proof, mechanics, and trust — one client island below the hero. */}
      <LandingSections />
    </main>
  );
}
