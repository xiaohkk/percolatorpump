import Link from "next/link";
import { TreasuryCounter } from "@/components/treasury-counter";
import { SeedTokenGrid } from "@/components/seed-token-grid";
import seedConfig from "../../config/seed-tokens.json";

const PHASE_2_LIVE = process.env.NEXT_PUBLIC_PHASE_2_LIVE === "true";
const HERO_SEED_TICKERS = seedConfig.tokens.slice(0, 5).map((t) => t.symbol).join(", ");

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
          Leverage trading on the top Solana memes.
          <br />
          <span className="text-zinc-400">The memecoin is your collateral.</span>
        </h1>

        <p className="text-base md:text-lg text-zinc-400 leading-relaxed max-w-2xl mx-auto">
          Inverted perps powered by Toly&apos;s open-source Percolator risk engine.
          Seeded Day 1 with {HERO_SEED_TICKERS}, and more.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          {PHASE_2_LIVE ? (
            <Link
              href="/markets"
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium bg-zinc-100 text-black rounded-md hover:bg-white transition-colors"
            >
              Trade
            </Link>
          ) : (
            <button
              type="button"
              disabled
              aria-disabled
              className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium bg-zinc-800 text-zinc-500 rounded-md cursor-not-allowed"
            >
              Trade <span className="ml-2 text-[11px] uppercase tracking-[0.15em] text-zinc-600">(soon)</span>
            </button>
          )}
          <Link
            href="/launch"
            className="inline-flex items-center justify-center px-6 py-3 text-sm font-medium border border-zinc-800 text-zinc-300 rounded-md hover:border-zinc-700 hover:text-zinc-100 transition-colors"
          >
            Launch a <span className="mx-1 text-zinc-100">...perc</span> token on pump.fun
          </Link>
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
                Launch a <span className="text-zinc-200">...perc</span>-suffix
                token on pump.fun (cosmetic vanity)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-600 select-none">-</span>
              <span>0.03 SOL fee per launch fuels Phase 2</span>
            </li>
          </ul>
        </div>

        {/* Phase 2 */}
        <div
          className={
            "border rounded-lg p-6 space-y-4 " +
            (PHASE_2_LIVE
              ? "border-emerald-500/40 bg-emerald-500/5"
              : "border-dashed border-zinc-800 opacity-75")
          }
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
              {PHASE_2_LIVE ? null : <LockIcon />}
              Phase 2 - Perps
            </h2>
            <span
              className={
                "text-[10px] uppercase tracking-[0.18em] " +
                (PHASE_2_LIVE ? "text-emerald-400" : "text-zinc-500")
              }
            >
              {PHASE_2_LIVE ? "live" : "unlocks at 12 SOL"}
            </span>
          </div>
          <ul className="space-y-3 text-sm text-zinc-400 leading-relaxed">
            <li className="flex gap-3">
              <span className="text-zinc-600 select-none">-</span>
              <span>
                15 top memes live Day 1 (grid below)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-600 select-none">-</span>
              <span>10x leveraged, collateralized in the token itself</span>
            </li>
            <li className="flex gap-3">
              <span className="text-zinc-600 select-none">-</span>
              <span>
                Any mint not seeded can be added via{" "}
                <span className="text-zinc-200">/markets/create</span>{" "}
                — first 10 listings 0.5 SOL, then 1.5 SOL
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* Seed token grid */}
      <section className="w-full mt-16 md:mt-20">
        <SeedTokenGrid />
        {PHASE_2_LIVE ? (
          <div className="w-full max-w-2xl mx-auto mt-4 text-center text-sm text-emerald-400">
            15 markets live. <Link href="/markets" className="underline underline-offset-4">Trade now</Link>.
          </div>
        ) : null}
      </section>

      {/* Links row */}
      <footer className="w-full mt-20 md:mt-28 pt-8 border-t border-zinc-900">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-zinc-500">
          <a
            href="https://github.com/xiaohkk/percolatorpump"
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-300 transition-colors"
          >
            Percolator (Toly)
          </a>
          {PHASE_2_LIVE ? (
            <Link
              href="/markets/create"
              className="hover:text-zinc-300 transition-colors"
            >
              Add a market
            </Link>
          ) : (
            <span className="text-zinc-700 cursor-not-allowed" aria-disabled>
              Add a market (unlocks with Phase 2)
            </span>
          )}
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
