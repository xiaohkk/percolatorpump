"use client";

import { useEffect, useRef, useState } from "react";

const PUMP_COIN_ENDPOINT = "https://frontend-api-v3.pump.fun/coins";
const POLL_MS = 10_000;

interface PumpCoinResponse {
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
  market_cap?: number;
  usd_market_cap?: number;
  complete?: boolean;
}

type PriceState =
  | { kind: "loading" }
  | { kind: "pending" } // 404 / not indexed yet
  | { kind: "error" }
  | {
      kind: "ready";
      priceSol: number;
      marketCapUsd: number | null;
      complete: boolean;
    };

interface PriceBadgeProps {
  mint: string;
}

/**
 * Client-only badge that polls pump.fun's public coin endpoint every 10s
 * and displays the derived spot price in SOL and market cap in USD.
 *
 * pump.fun bonding-curve price = virtual_sol_reserves / virtual_token_reserves.
 * Both fields are returned in their smallest units (lamports and token base
 * units with 6 decimals for pump.fun tokens), so the unit ratio cancels and
 * we get SOL-per-token directly. We still round for display.
 */
export default function PriceBadge({ mint }: PriceBadgeProps) {
  const [state, setState] = useState<PriceState>({ kind: "loading" });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const res = await fetch(`${PUMP_COIN_ENDPOINT}/${mint}`, {
          cache: "no-store",
        });
        if (!aliveRef.current) return;

        if (res.status === 404) {
          setState({ kind: "pending" });
        } else if (!res.ok) {
          setState({ kind: "error" });
        } else {
          const data = (await res.json()) as PumpCoinResponse;
          const vSol = Number(data.virtual_sol_reserves ?? 0);
          const vTok = Number(data.virtual_token_reserves ?? 0);
          if (vTok <= 0) {
            setState({ kind: "pending" });
          } else {
            setState({
              kind: "ready",
              priceSol: vSol / vTok,
              marketCapUsd:
                typeof data.usd_market_cap === "number"
                  ? data.usd_market_cap
                  : null,
              complete: !!data.complete,
            });
          }
        }
      } catch {
        if (aliveRef.current) setState({ kind: "error" });
      } finally {
        if (aliveRef.current) {
          timer = setTimeout(tick, POLL_MS);
        }
      }
    }

    tick();

    return () => {
      aliveRef.current = false;
      if (timer) clearTimeout(timer);
    };
  }, [mint]);

  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      <Metric label="price (SOL)">{renderPrice(state)}</Metric>
      <Metric label="market cap (USD)">{renderMcap(state)}</Metric>
    </div>
  );
}

function Metric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-800 rounded px-3 py-2 bg-zinc-950/40">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="text-zinc-100 font-mono text-sm mt-1">{children}</div>
    </div>
  );
}

function renderPrice(state: PriceState): React.ReactNode {
  switch (state.kind) {
    case "loading":
      return <span className="text-zinc-500">loading...</span>;
    case "pending":
      return <span className="text-zinc-500">price pending</span>;
    case "error":
      return <span className="text-zinc-500">-</span>;
    case "ready":
      return formatSol(state.priceSol);
  }
}

function renderMcap(state: PriceState): React.ReactNode {
  switch (state.kind) {
    case "loading":
      return <span className="text-zinc-500">loading...</span>;
    case "pending":
      return <span className="text-zinc-500">-</span>;
    case "error":
      return <span className="text-zinc-500">-</span>;
    case "ready":
      return state.marketCapUsd == null ? (
        <span className="text-zinc-500">-</span>
      ) : (
        formatUsd(state.marketCapUsd)
      );
  }
}

function formatSol(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0 SOL";
  if (n >= 1) return `${n.toFixed(4)} SOL`;
  // Pump curve prices are typically in the 1e-8..1e-5 SOL range; show enough
  // decimals to see the number without going full scientific.
  if (n >= 1e-4) return `${n.toFixed(6)} SOL`;
  return `${n.toExponential(3)} SOL`;
}

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "-";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}
