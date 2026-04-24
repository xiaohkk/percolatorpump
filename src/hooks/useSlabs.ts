"use client";

import { useEffect, useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/solana";
import {
  PROGRAM_ID,
  IS_STUB_PROGRAM,
  decodeSlabHeader,
  decodeEngineSnapshot,
  SlabHeader,
  ORIGIN_OPEN,
  ORIGIN_SEEDED,
} from "@/lib/percolator";

/**
 * One slab as it shows up in the /markets table or as a candidate for
 * resolveDexSource on /markets/create.
 */
export interface SlabRow {
  slab: PublicKey;
  header: SlabHeader;
  vault: bigint;
  insurance: bigint;
}

type State =
  | { status: "loading" }
  | { status: "ready"; slabs: SlabRow[] }
  | { status: "error"; message: string };

const PROGRAM_ACCOUNT_SIZE = 100_352; // slab_account_size() in bytes; a 104B header + engine region ≈ 100 KiB

/**
 * Fetch every slab owned by the Percolator program.
 *
 * Data-size filter (`memcmp` + `dataSize`) keeps the RPC load light and
 * excludes the program-data account and any incidental accounts. Each
 * returned row is decoded to a typed `SlabHeader` + shallow engine
 * snapshot so the UI has everything it needs for the markets table.
 */
export function useSlabs(): State & {
  refresh: () => Promise<void>;
  paidCount: number;
  seededCount: number;
} {
  const [state, setState] = useState<State>({ status: "loading" });

  const refresh = useCallback(async () => {
    // Pre-deploy (stub): don't hit RPC for a pubkey that can't possibly
    // own any slabs. Render an empty list so the page stays usable.
    if (IS_STUB_PROGRAM) {
      setState({ status: "ready", slabs: [] });
      return;
    }
    setState({ status: "loading" });
    try {
      const conn = getConnection();
      const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
        commitment: "confirmed",
        filters: [{ dataSize: PROGRAM_ACCOUNT_SIZE }],
      });
      const slabs: SlabRow[] = [];
      for (const { pubkey, account } of accounts) {
        try {
          const header = decodeSlabHeader(account.data);
          const snap = decodeEngineSnapshot(account.data);
          slabs.push({
            slab: pubkey,
            header,
            vault: snap?.vault ?? 0n,
            insurance: snap?.insurance ?? 0n,
          });
        } catch {
          // Malformed slab — skip rather than blow up the whole list.
        }
      }
      setState({ status: "ready", slabs });
    } catch (e) {
      setState({ status: "error", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const slabs = state.status === "ready" ? state.slabs : [];
  return {
    ...state,
    refresh,
    paidCount: slabs.filter((s) => s.header.origin === ORIGIN_OPEN).length,
    seededCount: slabs.filter((s) => s.header.origin === ORIGIN_SEEDED).length,
  };
}
