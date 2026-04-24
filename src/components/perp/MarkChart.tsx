"use client";

import dynamic from "next/dynamic";
import type { ChartPoint } from "./ChartCanvas";

/**
 * Thin SSR-safe wrapper around ChartCanvas. lightweight-charts v4 touches
 * the DOM at module scope (see docs/STATE.md percolator-meta note), so the
 * real chart module is imported only on the client.
 */
const ChartCanvas = dynamic(() => import("./ChartCanvas"), {
  ssr: false,
  loading: () => (
    <div
      data-testid="mark-chart"
      className="w-full h-[320px] md:h-[420px] rounded-lg border border-zinc-800 bg-zinc-950/40 animate-pulse"
    />
  ),
});

interface Props {
  /** Sliding window of (time-seconds, price) points. Up to ~60 entries. */
  points: ChartPoint[];
  /** Latest mark in lamports-per-token. Rendered as the header badge. */
  liveMark: bigint | null;
  /** Preserved for compatibility with the old placeholder call site. Unused. */
  mint?: string;
}

export function MarkChart({ points, liveMark }: Props) {
  return <ChartCanvas points={points} liveMark={liveMark} />;
}
