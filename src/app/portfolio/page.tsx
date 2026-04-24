"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useSlabs } from "@/hooks/useSlabs";
import { PositionCard } from "@/components/portfolio/PositionCard";
import { IS_STUB_PROGRAM } from "@/lib/percolator";

export default function PortfolioPage() {
  const { publicKey } = useWallet();
  const state = useSlabs();

  return (
    <main className="min-h-screen px-6 py-16 md:py-24 font-mono">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-baseline justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              portfolio
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {publicKey
                ? `${publicKey.toBase58().slice(0, 4)}…${publicKey
                    .toBase58()
                    .slice(-4)}`
                : "connect a wallet to view your positions"}
            </p>
          </div>
        </header>

        {!publicKey && (
          <div className="border border-zinc-800 rounded-lg p-6 space-y-3">
            <p className="text-sm text-zinc-400">
              Connect a wallet to see your open positions.
            </p>
            <WalletMultiButton />
          </div>
        )}

        {IS_STUB_PROGRAM && (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 text-xs text-amber-300">
            Program ID not set (still pointing at stub). Run task #17 first.
          </div>
        )}

        {publicKey && state.status === "loading" && (
          <div className="h-32 border border-zinc-800 rounded animate-pulse" />
        )}

        {publicKey && state.status === "error" && (
          <div className="border border-red-900 bg-red-950/30 text-red-300 text-xs rounded p-3">
            RPC error: {state.message}
          </div>
        )}

        {publicKey && state.status === "ready" && (
          <>
            {state.slabs.length === 0 ? (
              <div className="border border-zinc-800 rounded-lg p-8 text-center text-zinc-500 text-sm">
                No markets exist yet. Once mainnet seeds the top 15 memes, this
                is where your positions will show up.
              </div>
            ) : (
              <div
                data-testid="portfolio-grid"
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                {state.slabs.map((row) => (
                  <PositionCard
                    key={row.slab.toBase58()}
                    row={row}
                    // Real position detection lands with the typed engine decoder —
                    // walking `engine.accounts[]` and checking `owner == publicKey`.
                    // For now we show every market with a "no position" state so
                    // the user can still navigate.
                    hasPosition={false}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
