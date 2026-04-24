/**
 * Detect which DEX hosts a given SPL mint (pump.fun bonding curve →
 * PumpSwap → Raydium → Meteora, first hit wins).
 *
 * The task #15 oracle crate reads prices from each of these sources via
 * well-known byte offsets; here we just discover *which* source account
 * to point a new oracle feed at when the user clicks "Add a market".
 *
 * Implementation note (v0): the real probes for PumpSwap / Raydium /
 * Meteora pools require program-specific PDA derivations that the
 * frontend doesn't own yet. For v0 we only detect the pump.fun bonding
 * curve (which has a simple deterministic PDA) and fall back to "not
 * found" for anything else. Post-#21 seed script we'll extend this to
 * the three AMM paths.
 */

import { Connection, PublicKey } from "@solana/web3.js";

/** Canonical pump.fun program ID on mainnet. */
const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);

export type DexSourceKind = "pump_bonding" | "pumpswap" | "raydium" | "meteora";

export interface DexSource {
  kind: DexSourceKind;
  /** The on-chain account the oracle adapter reads from. */
  source: PublicKey;
}

export interface DexResolution {
  mint: PublicKey;
  source: DexSource | null;
  /** Human-readable diagnostic for the UI if source is null. */
  reason: string;
}

/**
 * pump.fun bonding curve PDA derivation. The bonding curve account is a
 * PDA derived from `[b"bonding-curve", mint]` under the pump.fun program.
 */
function findPumpBondingPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_FUN_PROGRAM_ID
  );
  return pda;
}

export async function resolveDexSource(
  conn: Connection,
  mint: PublicKey
): Promise<DexResolution> {
  // 1. pump.fun bonding curve (deterministic PDA).
  const pumpBonding = findPumpBondingPda(mint);
  const info = await conn.getAccountInfo(pumpBonding, "confirmed");
  if (info && info.data.length > 0) {
    return {
      mint,
      source: { kind: "pump_bonding", source: pumpBonding },
      reason: "found pump.fun bonding curve account",
    };
  }

  // 2-4. PumpSwap / Raydium / Meteora: not yet probed (v0). Extend when
  // the seed script (task #21) lands with the per-DEX pool-address maps.
  return {
    mint,
    source: null,
    reason:
      "no pump.fun bonding curve for this mint; PumpSwap / Raydium / Meteora probing lands post task #21",
  };
}

/** UI label for a detected source. */
export function dexSourceLabel(kind: DexSourceKind): string {
  switch (kind) {
    case "pump_bonding":
      return "pump.fun bonding";
    case "pumpswap":
      return "PumpSwap";
    case "raydium":
      return "Raydium";
    case "meteora":
      return "Meteora";
  }
}
