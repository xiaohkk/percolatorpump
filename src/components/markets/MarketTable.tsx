"use client";

import Link from "next/link";
import { useState } from "react";
import { SlabRow } from "@/hooks/useSlabs";
import { ORIGIN_OPEN, ORIGIN_SEEDED } from "@/lib/percolator";

type SortKey = "ticker" | "vault" | "origin";

interface Props {
  slabs: SlabRow[];
  /**
   * If provided, overrides the mint prefix rendered as the "ticker" column.
   * Real mint → ticker resolution lives in `lib/token-metadata.ts`; the
   * table does a simple `mint.slice(0,4)` when no label is supplied.
   */
  tickers?: Record<string, string>;
}

const SHORT_MINT_LEN = 4;

export function MarketTable({ slabs, tickers = {} }: Props) {
  const [sort, setSort] = useState<SortKey>("vault");
  const [filter, setFilter] = useState<"all" | "seeded" | "paid">("all");

  const filtered = slabs.filter((s) => {
    if (filter === "seeded") return s.header.origin === ORIGIN_SEEDED;
    if (filter === "paid") return s.header.origin === ORIGIN_OPEN;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "ticker") {
      return labelFor(a, tickers).localeCompare(labelFor(b, tickers));
    }
    if (sort === "origin") return a.header.origin - b.header.origin;
    // vault descending
    if (a.vault === b.vault) return 0;
    return a.vault > b.vault ? -1 : 1;
  });

  return (
    <div className="w-full space-y-4" data-testid="market-table">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          all
        </FilterButton>
        <FilterButton
          active={filter === "seeded"}
          onClick={() => setFilter("seeded")}
        >
          seeded
        </FilterButton>
        <FilterButton
          active={filter === "paid"}
          onClick={() => setFilter("paid")}
        >
          paid
        </FilterButton>
        <span className="ml-auto text-zinc-600">
          {sorted.length} market{sorted.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm" data-testid="market-table-grid">
          <thead className="bg-zinc-950 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            <tr>
              <Th onClick={() => setSort("ticker")}>mint</Th>
              <Th onClick={() => setSort("vault")}>vault</Th>
              <Th onClick={() => setSort("origin")}>origin</Th>
              <Th>state</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-zinc-600 text-xs"
                >
                  no markets yet — first paid listing ships the tier-1 promo
                  (0.5 SOL)
                </td>
              </tr>
            ) : (
              sorted.map((s) => (
                <MarketRow key={s.slab.toBase58()} row={s} label={labelFor(s, tickers)} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MarketRow({ row, label }: { row: SlabRow; label: string }) {
  const mint = row.header.mint.toBase58();
  return (
    <tr
      className="border-t border-zinc-900 hover:bg-zinc-950/60 transition-colors"
      data-testid="market-row"
      data-mint={mint}
    >
      <td className="px-4 py-3">
        <Link
          href={`/perp/${mint}`}
          className="inline-flex items-baseline gap-2 font-mono text-zinc-200 hover:text-zinc-100"
        >
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-[10px] text-zinc-600">
            {mint.slice(0, 4)}…{mint.slice(-4)}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3 font-mono text-xs tabular-nums text-zinc-300">
        {formatBigint(row.vault)}
      </td>
      <td className="px-4 py-3">
        <OriginBadge origin={row.header.origin} />
      </td>
      <td className="px-4 py-3">
        <StateBadge initialized={row.header.initialized} />
      </td>
    </tr>
  );
}

function OriginBadge({ origin }: { origin: number }) {
  if (origin === ORIGIN_SEEDED) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-emerald-400 bg-emerald-500/5 border border-emerald-500/30 rounded px-1.5 py-0.5">
        seed
      </span>
    );
  }
  if (origin === ORIGIN_OPEN) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-zinc-300 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">
        open
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
      ?
    </span>
  );
}

function StateBadge({ initialized }: { initialized: boolean }) {
  return initialized ? (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      live
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      pre-init
    </span>
  );
}

function Th({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={
        "text-left px-4 py-3 font-normal " +
        (onClick ? "cursor-pointer hover:text-zinc-300" : "")
      }
    >
      {children}
    </th>
  );
}

function FilterButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-2 py-1 rounded border transition-colors " +
        (active
          ? "border-zinc-600 text-zinc-200 bg-zinc-900"
          : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700")
      }
    >
      {children}
    </button>
  );
}

function labelFor(row: SlabRow, tickers: Record<string, string>): string {
  const mint = row.header.mint.toBase58();
  return tickers[mint] || `${mint.slice(0, SHORT_MINT_LEN)}…`;
}

function formatBigint(n: bigint): string {
  // Naive formatter: show up to 12 chars. Full mint-decimal-aware
  // formatting lands with the typed engine decoder pass.
  const s = n.toString();
  if (s.length <= 12) return s;
  return s.slice(0, 9) + "…";
}
