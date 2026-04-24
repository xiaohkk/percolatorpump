"use client";

import { useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  EngineAccount,
  decodeEngineAccount,
  findAccountIdxByOwner,
} from "@/lib/percolator";
import { useMarket } from "./useMarket";

/**
 * User-scoped per-slab position state. Wraps `useMarket` so callers only
 * subscribe to one polling loop, then derives the user's slot from the
 * cached slab buffer.
 *
 * `account` is `null` when there's no wallet, no slab yet, or the user
 * has no slot in this slab (interpreted as "no position").
 */
export function useUserPosition(
  mint: PublicKey | null,
  owner: PublicKey | null
) {
  const market = useMarket(mint);
  const position = useMemo(() => {
    if (!owner || market.status !== "ready") {
      return { account: null as EngineAccount | null, slotIdx: null as number | null };
    }
    const { slabData, aggregates } = market.data;
    // Scan only slots the engine says are allocated. When aggregates are
    // somehow missing, cap at 256 (MAX_ACCOUNTS under the compact feature)
    // so we don't silently skip live positions.
    const cap = aggregates?.numUsedAccounts ?? 256;
    const idx = findAccountIdxByOwner(slabData, owner, cap);
    if (idx === null) return { account: null, slotIdx: null };
    return { account: decodeEngineAccount(slabData, idx), slotIdx: idx };
  }, [market, owner]);
  return { market, ...position };
}
