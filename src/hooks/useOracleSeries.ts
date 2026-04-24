"use client";

import { useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useMarket } from "./useMarket";
import type { ChartPoint } from "@/components/perp/ChartCanvas";

/**
 * Feed a sliding 60-point ring buffer from the oracle account's mark
 * price. Backs the `MarkChart` component on `/perp/[mint]`.
 *
 * Data source (v0): whatever `useMarket(mint)` already polls — one RPC
 * per 10s. Each time the poll returns a fresh `oraclePrice`, we push a
 * point onto the ring. Real 1m candles from the oracle's 30-slot
 * `ring_buffer` come in when task #15 exposes an indexer endpoint.
 *
 * Cost caveat: this hook wraps its own `useMarket` call. Pages that also
 * use `useUserPosition(mint)` (which already wraps `useMarket`) end up
 * with two independent poll loops. That's acceptable at v0 — both tap
 * the same devnet RPC at 10s intervals. Consolidate into a context when
 * we need a third consumer.
 */
const RING_CAPACITY = 60;

export interface OracleSeries {
  points: ChartPoint[];
  liveMark: bigint | null;
}

export function useOracleSeries(mint: PublicKey | null): OracleSeries {
  const market = useMarket(mint);
  const ringRef = useRef<ChartPoint[]>([]);
  const lastTimeRef = useRef<number>(0);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const liveMark = market.status === "ready" ? market.data.oraclePrice : null;

  useEffect(() => {
    if (market.status !== "ready") return;
    const price = liveMark;
    if (price === null || price === 0n) return;

    // UTCTimestamp in seconds. Lightweight-charts rejects duplicate
    // timestamps; bump by 1 if the poll ran faster than the chart's
    // resolution.
    let now = Math.floor(Date.now() / 1000);
    if (now <= lastTimeRef.current) now = lastTimeRef.current + 1;
    lastTimeRef.current = now;

    // Numberify. Oracle price is u64 lamports-per-token; even max u64
    // (1.8e19) loses precision as a JS number, but the chart's Y axis
    // is visual, not normative. Acceptable for v0.
    const value = Number(price);
    ringRef.current.push({ time: now, value });
    if (ringRef.current.length > RING_CAPACITY) {
      ringRef.current.splice(0, ringRef.current.length - RING_CAPACITY);
    }
    // Publish a new array reference so React sees the update.
    setPoints(ringRef.current.slice());
  }, [market.status, liveMark]);

  return { points, liveMark };
}
