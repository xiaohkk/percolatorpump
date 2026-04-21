import Link from "next/link";
import { TreasuryCounter } from "@/components/treasury-counter";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-16 md:py-24 font-mono">
      {/* Hero */}
      <section className="w-full max-w-3xl text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 text-[11px] uppercase tracking-[0.2em] border border-zinc-800 rounded-full text-zinc-400">
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          phase 1 &middot; live
        </div>

        <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.1]">
          Launch a{" "}
          <span className="text-zinc-100">...perc</span>{" "}
          token on pump.fun.
        </h1>

        <p className="text-lg md:text-xl text-zinc-400 leading-relaxed">
          Get a leveraged perp market when the protocol deploys.
        </p>

        <p className="text-sm text-zinc-500 leading-relaxed max-w-xl mx-auto">
          Percolator is Toly&apos;s open-source perp risk engine. We&apos;re
          wrapping it for mainnet, funded entirely by community launches.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/launch"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium bg-zinc-100 text-black rounded-md hover:bg-white transition-colors"
          >
            Launch a token
          </Link>
          <a
            href="#how"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium border border-zinc-800 text-zinc-300 rounded-md hover:border-zinc-700 hover:text-zinc-100 transition-colors"
          >
            How it works
          </a>
        </div>
      </section>

      {/* Treasury counter */}
      <section className="w-full mt-20 md:mt-28">
        <TreasuryCounter />
      </section>

      {/* Phase explainer */}
      <section
        id="how"
        className="w-full max-w-4xl mt-20 md:mt-28 grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        {/* Phase 1 */}
        <div className="border border-zinc-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-100">
              Phase 1 - Launcher
            </h2>
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              live now
            </span>
          </div>
          <ul className="space-y-3 text-sm text-zinc-400 leading-relaxed">
            <li className="flex gap-3">
              <span className="text-zinc-600 select-none">-</span>
              <span>
                Launch any memecoin on pump.fun with a{" "}
                <span className="text-zinc-200">...perc</span>-suffix mint address
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-600 select-none">-</span>
              <span>Uses pump.fun&apos;s bonding curve, graduation, and liquidity</span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-600 select-none">-</span>
              <span>0.03 SOL service fee per launch goes toward Phase 2</span>
            </li>
          </ul>
        </div>

        {/* Phase 2 */}
        <div className="border border-dashed border-zinc-800 rounded-lg p-6 space-y-4 opacity-60">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              <LockIcon />
              Phase 2 - Perps
            </h2>
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              locked
            </span>
          </div>
          <ul className="space-y-3 text-sm text-zinc-500 leading-relaxed">
            <li className="flex gap-3">
              <span className="text-zinc-700 select-none">-</span>
              <span>
                Every <span className="text-zinc-400">...perc</span> token becomes
                a 10x leveraged perp market
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-700 select-none">-</span>
              <span>Collateralized in the token itself (SOV-style inverted perps)</span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-700 select-none">-</span>
              <span>Trading fees soft-burn into a permanent insurance fund</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Links row */}
      <footer className="w-full mt-20 md:mt-28 pt-8 border-t border-zinc-900">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          <a
            href="https://github.com/xiaohkk/percolator"
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            Percolator (Toly)
          </a>
          <a href="#" className="hover:text-zinc-300 transition-colors">
            Program wrapper <span className="text-zinc-700">(soon)</span>
          </a>
          <a href="#" className="hover:text-zinc-300 transition-colors">
            x
          </a>
          <a href="#" className="hover:text-zinc-300 transition-colors">
            tg
          </a>
        </div>
      </footer>
    </main>
  );
}

function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 text-zinc-500"
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
