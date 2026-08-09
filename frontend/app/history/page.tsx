"use client";

import Link from "next/link";

import { RecentDigs } from "@/components/RecentDigs";
import { useGameStats } from "@/lib/hooks";

export default function HistoryPage() {
  const { refetch: refetchStats } = useGameStats();

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <header className="max-w-2xl space-y-3">
        <p className="engraved">Your Digs</p>
        <h1 className="font-display text-3xl tracking-wide text-slate-50 sm:text-4xl">History</h1>
        <p className="leading-relaxed text-slate-400">
          Every Dig this wallet has made, newest first. Results stay encrypted until you decrypt them with the same
          wallet — which deposit a Pick chose is not recorded anywhere on chain.
        </p>
      </header>

      <div className="mt-8">
        <RecentDigs onChanged={refetchStats} />
      </div>

      <p className="mt-8 text-xs leading-relaxed text-slate-600">
        Looking for the wall?{" "}
        <Link href="/mine" className="text-gem-teal underline decoration-dotted underline-offset-4 hover:no-underline">
          Head back to the Cavern
        </Link>{" "}
        to make another Dig.
      </p>
    </main>
  );
}
