"use client";

import { useEffect, useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/solana";
import {
  PROGRAM_ID,
  IS_STUB_PROGRAM,
  decodeSlabHeader,
  decodeEngineSnapshot,
  decodeEngineAggregates,
  decodeOraclePrice,
  EngineAggregates,
  SlabHeader,
} from "@/lib/percolator";

/**
 * Market-level state for `/perp/[mint]`. Surfaces both the narrow
 * `vault`/`insurance` snapshot and the O(1) engine aggregates needed
 * for the h-card, ABK badges, and ADL math.
 */
export interface MarketData {
  slab: PublicKey;
  /** Raw on-chain account bytes. Kept so per-account hooks can reuse them. */
  slabData: Uint8Array;
  header: SlabHeader;
  /** `engine.vault` (aggregated token balance, mint-native units). */
  vault: bigint;
  /** `engine.insurance_fund.balance`. */
  insurance: bigint;
  /**
   * O(1) engine aggregates. `null` only if the slab is truncated beyond
   * the aggregate offsets (shouldn't happen for an initialized slab).
   */
  aggregates: EngineAggregates | null;
  /**
   * Mark price from the oracle account. `null` while the typed feed
   * (task #15) hasn't been initialized for this slab's oracle pubkey.
   */
  oraclePrice: bigint | null;
}

type State =
  | { status: "loading" }
  | { status: "ready"; data: MarketData }
  | { status: "not_found" }
  | { status: "error"; message: string };

const POLL_MS = 10_000;

/**
 * Find a slab by mint: scans all slabs and returns the first whose
 * `SlabHeader.mint` matches. `getProgramAccounts` doesn't support
 * filtering on a field that's not at a known memcmp offset but the
 * mint does live at offset 0, so we could `memcmp` it. For v0 we
 * fall back to the full scan — <30 RPC-bytes per slab and a small
 * list pre-launch.
 */
export function useMarket(mint: PublicKey | null): State & {
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
    if (!mint) {
      setState({ status: "not_found" });
      return;
    }
    if (IS_STUB_PROGRAM) {
      setState({ status: "not_found" });
      return;
    }

    setState({ status: "loading" });
    const conn = getConnection();
    try {
      // Find the slab whose header's mint field matches our target.
      const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
        commitment: "confirmed",
        filters: [
          { dataSize: 100_352 },
          { memcmp: { offset: 0, bytes: mint.toBase58() } },
        ],
      });
      if (accounts.length === 0) {
        setState({ status: "not_found" });
        return;
      }
      const first = accounts[0];
      const rawData = first.account.data as Buffer;
      const header = decodeSlabHeader(rawData);
      const snap = decodeEngineSnapshot(rawData);
      const aggregates = decodeEngineAggregates(rawData);

      let oraclePrice: bigint | null = null;
      try {
        const oracle = await conn.getAccountInfo(header.oracle, "confirmed");
        if (oracle) {
          oraclePrice = decodeOraclePrice(oracle.data);
        }
      } catch {
        // Oracle unavailable — leave null.
      }

      setState({
        status: "ready",
        data: {
          slab: first.pubkey,
          slabData: new Uint8Array(rawData),
          header,
          vault: snap?.vault ?? 0n,
          insurance: snap?.insurance ?? 0n,
          aggregates,
          oraclePrice,
        },
      });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, [mint]);

  useEffect(() => {
    refresh();
    if (!mint) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [mint, refresh]);

  return { ...state, refresh };
}
