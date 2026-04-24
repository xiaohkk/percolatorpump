"use client";

import { useEffect, useState } from "react";

interface TreasuryData {
  lamports: number;
  sol: number;
  threshold: number;
  thresholdLamports: number;
}

type FetchState =
  | { status: "loading" }
  | { status: "ready"; data: TreasuryData }
  | { status: "error"; message: string };

const POLL_MS = 15_000;

export function TreasuryCounter() {
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/treasury/balance", { cache: "no-store" });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const data = (await res.json()) as TreasuryData;
        if (!cancelled) setState({ status: "ready", data });
      } catch (e) {
        if (!cancelled) {
          setState({ status: "error", message: (e as Error).message });
        }
      }
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="w-full max-w-2xl mx-auto border border-zinc-800 rounded-lg p-8 space-y-5">
        <div className="h-6 w-56 bg-zinc-900 rounded animate-pulse" />
        <div className="h-2 w-full bg-zinc-900 rounded animate-pulse" />
        <div className="h-3 w-72 bg-zinc-900 rounded animate-pulse" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="w-full max-w-2xl mx-auto border border-zinc-800 rounded-lg p-8">
        <div className="text-sm text-zinc-600">
          treasury unavailable ({state.message}). retrying in 15s.
        </div>
      </div>
    );
  }

  const { sol, threshold } = state.data;
  const pct = Math.min(sol / threshold, 1) * 100;
  const unlocked = sol >= threshold;

  return (
    <div
      className={
        "w-full max-w-2xl mx-auto border rounded-lg p-8 space-y-5 transition-colors " +
        (unlocked
          ? "border-emerald-500/40 bg-emerald-500/5 animate-pulse"
          : "border-zinc-800")
      }
    >
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          treasury
        </div>
        <div
          className={
            "text-2xl md:text-3xl font-bold tabular-nums " +
            (unlocked ? "text-emerald-400" : "text-zinc-100")
          }
        >
          {sol.toFixed(2)}{" "}
          <span className="text-zinc-600 font-normal">/ {threshold.toFixed(2)} SOL</span>
        </div>
      </div>

      <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden">
        <div
          className={
            "h-full transition-[width] duration-700 ease-out " +
            (unlocked ? "bg-emerald-400" : "bg-zinc-300")
          }
          style={{ width: `${pct}%` }}
        />
      </div>

      {unlocked ? (
        <div className="space-y-1">
          <div className="text-sm text-emerald-400 font-medium">
            DEPLOYING - seeding WIF, BONK, POPCAT, ...
          </div>
          <div className="text-xs text-emerald-500/70">
            Mainnet Percolator deploy + Day 1 seed of the top 15 Solana memes
            is shipping now.
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-sm text-zinc-400">
            Mainnet Percolator deploy + Day 1 seed of the top 15 Solana memes
            unlocks at {threshold.toFixed(2)} SOL.
          </div>
          <div className="text-xs text-zinc-600">
            Fueled by creator rewards on our own{" "}
            <span className="text-zinc-400">...perc</span> token. Post-deploy,
            the first 10 paid listings are 0.5 SOL; after that, 1.5 SOL each.
          </div>
        </div>
      )}
    </div>
  );
}
