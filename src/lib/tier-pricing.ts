/**
 * Listing-fee tier logic (task #23 v2).
 *
 * The on-chain `CreateMarket` enforces a 0.5 SOL floor but accepts any
 * fee above it, so the wrapper picks the tier based on how many
 * `ORIGIN_OPEN` slabs already exist. Promotional pricing is env-driven
 * — change envs, no program upgrade needed.
 */

import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export interface TierConfig {
  promoCount: number;
  promoFeeSol: number;
  standardFeeSol: number;
}

function readEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function getTierConfig(): TierConfig {
  return {
    promoCount: readEnvNumber("NEXT_PUBLIC_PROMO_MARKET_COUNT", 10),
    promoFeeSol: readEnvNumber("NEXT_PUBLIC_PROMO_LISTING_FEE_SOL", 0.5),
    standardFeeSol: readEnvNumber(
      "NEXT_PUBLIC_STANDARD_LISTING_FEE_SOL",
      1.5
    ),
  };
}

/**
 * Pick the fee in SOL for the next paid listing.
 * @param openListingCount — how many `ORIGIN_OPEN` slabs currently exist on-chain
 */
export function feeForNextListingSol(
  openListingCount: number,
  cfg: TierConfig = getTierConfig()
): number {
  return openListingCount < cfg.promoCount ? cfg.promoFeeSol : cfg.standardFeeSol;
}

export function feeForNextListingLamports(
  openListingCount: number,
  cfg: TierConfig = getTierConfig()
): bigint {
  const sol = feeForNextListingSol(openListingCount, cfg);
  return BigInt(Math.round(sol * LAMPORTS_PER_SOL));
}

/**
 * Human-readable label: "promo" (in the first-N window) or "standard".
 * Used by the UI to show a "promo tier — first N listings" badge.
 */
export type TierKind = "promo" | "standard";

export function tierKind(
  openListingCount: number,
  cfg: TierConfig = getTierConfig()
): TierKind {
  return openListingCount < cfg.promoCount ? "promo" : "standard";
}

/** How many promo slots remain, or 0 once past the cutoff. */
export function remainingPromoSlots(
  openListingCount: number,
  cfg: TierConfig = getTierConfig()
): number {
  return Math.max(0, cfg.promoCount - openListingCount);
}
