"use client";

import Link from "next/link";
import { SlabRow } from "@/hooks/useSlabs";

/**
 * Per-market card on `/portfolio`. Shows the user's position in that
 * slab, if any. For v0 we render the slab's aggregate vault + origin
 * badge and a "open market" link — full position decoding (capital,
 * pnl, basis, haircut preview) lands with the typed engine decoder
 * pass.
 */
interface Props {
  row: SlabRow;
  /** True if the connected wallet has a claimed slot in this slab. */
  hasPosition: boolean;
}

export function PositionCard({ row, hasPosition }: Props) {
  const mint = row.header.mint.toBase58();
  return (
    <div
      data-testid="position-card"
      data-mint={mint}
      className="border border-zinc-800 rounded-lg p-5 space-y-4 bg-zinc-950/40"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-zinc-100">
            {mint.slice(0, 4)}…{mint.slice(-4)}
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            {row.header.is_seeded ? "seed" : "open"}
          </span>
        </div>
        {!hasPosition && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
            no position
          </span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <Metric label="vault (slab-wide)" value={row.vault.toString()} />
        <Metric label="insurance" value={row.insurance.toString()} />
      </dl>

      <div className="flex gap-2">
        <Link
          href={`/perp/${mint}`}
          className="flex-1 text-center py-2 text-xs border border-zinc-700 rounded hover:bg-zinc-900 transition-colors"
        >
          open market
        </Link>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </dt>
      <dd className="font-mono tabular-nums text-zinc-200 truncate">
        {value}
      </dd>
    </div>
  );
}
