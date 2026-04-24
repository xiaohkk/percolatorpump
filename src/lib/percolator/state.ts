/**
 * Percolator on-chain account decoders.
 *
 * Two account types matter for the frontend:
 *   1. `SlabHeader` — 104 bytes at the start of every slab account. Has the
 *      mint, oracle pubkey, creator, origin (seeded/open), and bump info.
 *   2. `RiskEngine` — the tail of the slab, ~100 KiB. We decode only the
 *      handful of fields the UI needs (vault + insurance aggregates via
 *      `decodeEngineSnapshot`, O(1) summary via `decodeEngineAggregates`,
 *      per-slot positions via `decodeEngineAccount`).
 *
 * Exact byte offsets are locked down by
 *   `percolator/program/tests/engine_layout.rs` → copy into
 *   `./engine-layout.ts` whenever the Rust `RiskEngine` / `Account` structs
 *   change.
 */

import { PublicKey } from "@solana/web3.js";
import { Reader } from "./borsh";
import {
  ACCOUNT_OFF,
  ACCOUNT_STRIDE,
  ENGINE_OFF,
  ENGINE_OFFSET,
  SLAB_HEADER_LEN,
  sideModeLabel,
} from "./engine-layout";

// Re-export for backward compatibility with existing imports.
export { ENGINE_OFFSET, SLAB_HEADER_LEN } from "./engine-layout";

// ---------------------------------------------------------------------------
// SlabHeader
// ---------------------------------------------------------------------------

/** Origin codes (matches `percolator_program::state::ORIGIN_*`). */
export const ORIGIN_SEEDED = 0;
export const ORIGIN_OPEN = 1;

export interface SlabHeader {
  mint: PublicKey;
  oracle: PublicKey;
  creator: PublicKey;
  bump: number;
  initialized: boolean;
  vault_bump: number;
  origin: number;
  /** `true` iff `origin === ORIGIN_OPEN`. Paid listing via `CreateMarket`. */
  is_paid_listing: boolean;
  /** `true` iff `origin === ORIGIN_SEEDED`. Admin-seeded via `CreateSlab`. */
  is_seeded: boolean;
}

export function decodeSlabHeader(data: Buffer | Uint8Array): SlabHeader {
  if (data.length < SLAB_HEADER_LEN) {
    throw new Error(
      `slab account too small: ${data.length} bytes (need ≥ ${SLAB_HEADER_LEN})`
    );
  }
  const r = new Reader(data);
  const mint = new PublicKey(r.bytes(32));
  const oracle = new PublicKey(r.bytes(32));
  const creator = new PublicKey(r.bytes(32));
  const bump = r.u8();
  const initialized = r.u8() !== 0;
  const vault_bump = r.u8();
  const origin = r.u8();
  // 4 bytes of trailing pad follow; ignore.
  return {
    mint,
    oracle,
    creator,
    bump,
    initialized,
    vault_bump,
    origin,
    is_paid_listing: origin === ORIGIN_OPEN,
    is_seeded: origin === ORIGIN_SEEDED,
  };
}

// ---------------------------------------------------------------------------
// RiskEngine — small legacy snapshot (vault + insurance only)
// ---------------------------------------------------------------------------

/** The few engine fields the landing + market-page surface actually need. */
export interface EngineSnapshot {
  /** `vault` in mint-native units (matches token decimals). */
  vault: bigint;
  /** `insurance_fund.balance`. */
  insurance: bigint;
}

export function decodeEngineSnapshot(
  slabData: Buffer | Uint8Array
): EngineSnapshot | null {
  if (slabData.length < ENGINE_OFFSET + ENGINE_OFF.insurance_balance + 16) {
    return null;
  }
  const u8 = toU8(slabData);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return {
    vault: readU128(view, ENGINE_OFFSET + ENGINE_OFF.vault),
    insurance: readU128(view, ENGINE_OFFSET + ENGINE_OFF.insurance_balance),
  };
}

// ---------------------------------------------------------------------------
// RiskEngine — full aggregate + per-account decoders (task #19)
// ---------------------------------------------------------------------------

export type SideModeLabel =
  | "normal"
  | "drain_only"
  | "reset_pending"
  | "unknown";

/** O(1) engine aggregates needed to render the market-level cards. */
export interface EngineAggregates {
  /** Sum of account capital, i.e. `Σ account.capital`. */
  c_tot: bigint;
  /** Sum of `max(pnl - reserved_pnl, 0)` across accounts. */
  pnlPosTot: bigint;
  /**
   * Subset of `pnlPosTot` that is already matured (fully eligible for
   * withdrawal). Denominator of the h-card ratio.
   */
  pnlMaturedPosTot: bigint;
  oiEffLong: bigint;
  oiEffShort: bigint;
  sideModeLong: SideModeLabel;
  sideModeShort: SideModeLabel;
  /** ADL multipliers (A-state) — snapshots of `adl_mult_{long,short}`. */
  adlMultLong: bigint;
  adlMultShort: bigint;
  /** ADL coefficients (K-state) — signed. */
  adlCoeffLong: bigint;
  adlCoeffShort: bigint;
  lastOraclePrice: bigint;
  /** Count of allocated account slots in the slab (LP slot included). */
  numUsedAccounts: number;
}

export function decodeEngineAggregates(
  slabData: Buffer | Uint8Array
): EngineAggregates | null {
  if (slabData.length < ENGINE_OFFSET + ENGINE_OFF.accounts) return null;
  const u8 = toU8(slabData);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const base = ENGINE_OFFSET;
  return {
    c_tot: readU128(view, base + ENGINE_OFF.c_tot),
    pnlPosTot: readU128(view, base + ENGINE_OFF.pnl_pos_tot),
    pnlMaturedPosTot: readU128(view, base + ENGINE_OFF.pnl_matured_pos_tot),
    oiEffLong: readU128(view, base + ENGINE_OFF.oi_eff_long_q),
    oiEffShort: readU128(view, base + ENGINE_OFF.oi_eff_short_q),
    sideModeLong: sideModeLabel(view.getUint8(base + ENGINE_OFF.side_mode_long)),
    sideModeShort: sideModeLabel(
      view.getUint8(base + ENGINE_OFF.side_mode_short)
    ),
    adlMultLong: readU128(view, base + ENGINE_OFF.adl_mult_long),
    adlMultShort: readU128(view, base + ENGINE_OFF.adl_mult_short),
    adlCoeffLong: readI128(view, base + ENGINE_OFF.adl_coeff_long),
    adlCoeffShort: readI128(view, base + ENGINE_OFF.adl_coeff_short),
    lastOraclePrice: view.getBigUint64(
      base + ENGINE_OFF.last_oracle_price,
      true
    ),
    numUsedAccounts: view.getUint16(
      base + ENGINE_OFF.num_used_accounts,
      true
    ),
  };
}

/** Per-account slot decode result. `null` means the buffer was too short. */
export interface EngineAccount {
  /** Raw 32-byte owner pubkey. Zero iff the slot is unclaimed. */
  owner: PublicKey;
  capital: bigint;
  pnl: bigint;
  reservedPnl: bigint;
  positionBasisQ: bigint;
}

/**
 * Decode the `accounts[slotIdx]` slot inside the slab. Returns `null` if
 * the slab data is shorter than the slot would require, or if the slot
 * index is out of bounds for whatever the slab declared.
 */
export function decodeEngineAccount(
  slabData: Buffer | Uint8Array,
  slotIdx: number
): EngineAccount | null {
  if (slotIdx < 0 || !Number.isFinite(slotIdx)) return null;
  const slotBase =
    ENGINE_OFFSET + ENGINE_OFF.accounts + slotIdx * ACCOUNT_STRIDE;
  if (slabData.length < slotBase + ACCOUNT_STRIDE) return null;
  const u8 = toU8(slabData);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const ownerBytes = new Uint8Array(
    u8.buffer,
    u8.byteOffset + slotBase + ACCOUNT_OFF.owner,
    32
  );
  return {
    owner: new PublicKey(new Uint8Array(ownerBytes)),
    capital: readU128(view, slotBase + ACCOUNT_OFF.capital),
    pnl: readI128(view, slotBase + ACCOUNT_OFF.pnl),
    reservedPnl: readU128(view, slotBase + ACCOUNT_OFF.reserved_pnl),
    positionBasisQ: readI128(view, slotBase + ACCOUNT_OFF.position_basis_q),
  };
}

/**
 * Linear scan the slab's account table for the first slot whose owner
 * matches `ownerPubkey`. Returns `null` if none found or the slab is
 * truncated. `maxAccounts` caps the scan — callers should pass the
 * engine's `num_used_accounts` when available to avoid scanning beyond
 * allocated slots.
 *
 * O(n) in `maxAccounts`. For MAX_ACCOUNTS = 256 slabs that's ~2 ms worst
 * case in a browser. Acceptable for the current UI; swap to a memcmp
 * server-side if this hotspots later.
 */
export function findAccountIdxByOwner(
  slabData: Buffer | Uint8Array,
  ownerPubkey: PublicKey,
  maxAccounts: number
): number | null {
  const needle = ownerPubkey.toBuffer();
  const u8 = toU8(slabData);
  const base = ENGINE_OFFSET + ENGINE_OFF.accounts;
  for (let i = 0; i < maxAccounts; i++) {
    const ownerOff = base + i * ACCOUNT_STRIDE + ACCOUNT_OFF.owner;
    if (u8.length < ownerOff + 32) return null;
    let eq = true;
    for (let j = 0; j < 32; j++) {
      if (u8[ownerOff + j] !== needle[j]) {
        eq = false;
        break;
      }
    }
    if (eq) return i;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Oracle price
// ---------------------------------------------------------------------------

/**
 * Decode the temporary bytes-0..8 oracle format (task #15 lands a typed
 * feed, but the program reads a raw u64 LE until then).
 */
export function decodeOraclePrice(
  data: Buffer | Uint8Array
): bigint | null {
  if (data.length < 8) return null;
  const r = new Reader(data);
  return r.u64();
}

// ---------------------------------------------------------------------------
// Shared byte-level helpers
// ---------------------------------------------------------------------------

function toU8(data: Buffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function readU128(view: DataView, off: number): bigint {
  const lo = view.getBigUint64(off, true);
  const hi = view.getBigUint64(off + 8, true);
  return (hi << 64n) | lo;
}

function readI128(view: DataView, off: number): bigint {
  const u = readU128(view, off);
  const sign = 1n << 127n;
  return u >= sign ? u - (1n << 128n) : u;
}
