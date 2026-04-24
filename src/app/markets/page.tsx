"use client";

import Link from "next/link";
import { useSlabs } from "@/hooks/useSlabs";
import { MarketTable } from "@/components/markets/MarketTable";
import { IS_STUB_PROGRAM } from "@/lib/percolator";

export default function MarketsPage() {
  const state = useSlabs();

  return (
    <main className="min-h-screen px-6 py-16 md:py-24 font-mono">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              markets
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {state.seededCount} seeded &middot; {state.paidCount} paid
            </p>
          </div>
          <Link
            href="/markets/create"
            className="inline-flex items-center justify-center px-4 py-2 text-sm border border-zinc-800 rounded hover:border-zinc-600 hover:text-zinc-100 text-zinc-300 transition-colors"
          >
            + add a market
          </Link>
        </header>

        {IS_STUB_PROGRAM && (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 text-xs text-amber-300">
            Program ID not set. Run task #17 (devnet deploy) and paste
            <code className="mx-1 text-amber-200">NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID</code>
            into <code className="mx-1 text-amber-200">.env.local</code>.
          </div>
        )}

        {state.status === "loading" && (
          <div className="h-32 border border-zinc-800 rounded animate-pulse" />
        )}
        {state.status === "error" && (
          <div className="border border-red-900 bg-red-950/30 text-red-300 text-xs rounded p-3">
            RPC error: {state.message}
          </div>
        )}
        {state.status === "ready" && <MarketTable slabs={state.slabs} />}
      </div>
    </main>
  );
}
