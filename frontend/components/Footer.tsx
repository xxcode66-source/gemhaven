/**
 * Site footer: brand and the jam credit only. Static — no wallet or chain
 * data, so it stays a server component.
 */
export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/[0.06] bg-rock-deep/50 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="font-display text-lg tracking-[0.25em] text-slate-100">
          GEM<span className="text-gem-teal">HAVEN</span>
        </p>
        <p className="text-xs text-slate-600">
          Built for the Inco Summer Game Jam — Hidden Mechanics track · testnet play on Base Sepolia.
        </p>
      </div>
    </footer>
  );
}
