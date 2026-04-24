/**
 * Vitest coverage for the RiskEngine decoders.
 *
 * Each test constructs a raw `Buffer` shaped like a real slab account —
 * 104 header bytes + the engine region — writes known sentinel values at
 * the offsets defined in `engine-layout.ts`, and then asserts the
 * decoder reads them back correctly.
 */

import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  ACCOUNT_OFF,
  ACCOUNT_STRIDE,
  ENGINE_OFF,
  ENGINE_OFFSET,
  ENGINE_SIZE,
  SIDE_MODE_DRAIN_ONLY,
  SIDE_MODE_RESET_PENDING,
  SLAB_HEADER_LEN,
  decodeEngineAccount,
  decodeEngineAggregates,
  findAccountIdxByOwner,
} from "../percolator";

// ------- helpers -----------------------------------------------------------

function newSlabBuffer(): Buffer {
  // `Buffer.alloc` zero-fills, which is what the Rust side does for slab
  // accounts after `CreateSlab` and before `InitializeEngine`.
  return Buffer.alloc(SLAB_HEADER_LEN + ENGINE_SIZE);
}

function writeU128LE(buf: Buffer, off: number, v: bigint) {
  const lo = BigInt.asUintN(64, v);
  const hi = BigInt.asUintN(64, v >> 64n);
  buf.writeBigUInt64LE(lo, off);
  buf.writeBigUInt64LE(hi, off + 8);
}

function writeI128LE(buf: Buffer, off: number, v: bigint) {
  // Two's-complement: reinterpret via 128-bit width.
  const u = v < 0n ? v + (1n << 128n) : v;
  writeU128LE(buf, off, u);
}

// ------- decodeEngineAggregates -------------------------------------------

describe("decodeEngineAggregates", () => {
  it("reads every aggregate field from a hand-built buffer", () => {
    const buf = newSlabBuffer();
    const base = ENGINE_OFFSET;
    writeU128LE(buf, base + ENGINE_OFF.c_tot, 1_000_000_000n);
    writeU128LE(buf, base + ENGINE_OFF.pnl_pos_tot, 750_000_000n);
    writeU128LE(buf, base + ENGINE_OFF.pnl_matured_pos_tot, 900_000_000n);
    writeU128LE(buf, base + ENGINE_OFF.oi_eff_long_q, 123_456_789n);
    writeU128LE(buf, base + ENGINE_OFF.oi_eff_short_q, 987_654_321n);
    writeU128LE(buf, base + ENGINE_OFF.adl_mult_long, 1_000_000_000_000_000n);
    writeU128LE(buf, base + ENGINE_OFF.adl_mult_short, 999_999_999_999_999n);
    writeI128LE(buf, base + ENGINE_OFF.adl_coeff_long, -42n);
    writeI128LE(buf, base + ENGINE_OFF.adl_coeff_short, 17n);
    buf.writeUInt8(SIDE_MODE_DRAIN_ONLY, base + ENGINE_OFF.side_mode_long);
    buf.writeUInt8(SIDE_MODE_RESET_PENDING, base + ENGINE_OFF.side_mode_short);
    buf.writeBigUInt64LE(1_500n, base + ENGINE_OFF.last_oracle_price);
    buf.writeUInt16LE(7, base + ENGINE_OFF.num_used_accounts);

    const agg = decodeEngineAggregates(buf)!;
    expect(agg).not.toBeNull();
    expect(agg.c_tot).toBe(1_000_000_000n);
    expect(agg.pnlPosTot).toBe(750_000_000n);
    expect(agg.pnlMaturedPosTot).toBe(900_000_000n);
    expect(agg.oiEffLong).toBe(123_456_789n);
    expect(agg.oiEffShort).toBe(987_654_321n);
    expect(agg.adlMultLong).toBe(1_000_000_000_000_000n);
    expect(agg.adlMultShort).toBe(999_999_999_999_999n);
    expect(agg.adlCoeffLong).toBe(-42n);
    expect(agg.adlCoeffShort).toBe(17n);
    expect(agg.sideModeLong).toBe("drain_only");
    expect(agg.sideModeShort).toBe("reset_pending");
    expect(agg.lastOraclePrice).toBe(1_500n);
    expect(agg.numUsedAccounts).toBe(7);
  });

  it("returns null when buffer is shorter than the engine region", () => {
    const tooSmall = Buffer.alloc(SLAB_HEADER_LEN + 100); // not enough for accounts offset
    expect(decodeEngineAggregates(tooSmall)).toBeNull();
  });

  it("handles SideMode.Normal + zeroed aggregates", () => {
    const buf = newSlabBuffer();
    // Leave everything zero (post-CreateSlab, pre-InitializeEngine state).
    const agg = decodeEngineAggregates(buf)!;
    expect(agg).not.toBeNull();
    expect(agg.c_tot).toBe(0n);
    expect(agg.pnlPosTot).toBe(0n);
    expect(agg.pnlMaturedPosTot).toBe(0n);
    expect(agg.sideModeLong).toBe("normal");
    expect(agg.sideModeShort).toBe("normal");
    expect(agg.numUsedAccounts).toBe(0);
  });
});

// ------- decodeEngineAccount ----------------------------------------------

describe("decodeEngineAccount", () => {
  it("reads the fields for slot 0", () => {
    const buf = newSlabBuffer();
    const owner = Keypair.generate().publicKey;
    const slotBase = ENGINE_OFFSET + ENGINE_OFF.accounts;
    writeU128LE(buf, slotBase + ACCOUNT_OFF.capital, 42_000n);
    writeI128LE(buf, slotBase + ACCOUNT_OFF.pnl, -123_456n);
    writeU128LE(buf, slotBase + ACCOUNT_OFF.reserved_pnl, 7n);
    writeI128LE(buf, slotBase + ACCOUNT_OFF.position_basis_q, 99_999n);
    buf.set(owner.toBytes(), slotBase + ACCOUNT_OFF.owner);

    const acc = decodeEngineAccount(buf, 0)!;
    expect(acc).not.toBeNull();
    expect(acc.owner.equals(owner)).toBe(true);
    expect(acc.capital).toBe(42_000n);
    expect(acc.pnl).toBe(-123_456n);
    expect(acc.reservedPnl).toBe(7n);
    expect(acc.positionBasisQ).toBe(99_999n);
  });

  it("reads the fields for a non-zero slot index using ACCOUNT_STRIDE", () => {
    const buf = newSlabBuffer();
    const owner = Keypair.generate().publicKey;
    const slotIdx = 5;
    const slotBase =
      ENGINE_OFFSET + ENGINE_OFF.accounts + slotIdx * ACCOUNT_STRIDE;
    writeU128LE(buf, slotBase + ACCOUNT_OFF.capital, 1n << 100n); // high-bit-ish
    buf.set(owner.toBytes(), slotBase + ACCOUNT_OFF.owner);

    const acc = decodeEngineAccount(buf, slotIdx)!;
    expect(acc.capital).toBe(1n << 100n);
    expect(acc.owner.equals(owner)).toBe(true);
  });

  it("returns null for out-of-range slot index", () => {
    const buf = newSlabBuffer();
    // Slab allocates space for 256 accounts (MAX_ACCOUNTS in compact mode).
    expect(decodeEngineAccount(buf, 1000)).toBeNull();
    expect(decodeEngineAccount(buf, -1)).toBeNull();
  });
});

// ------- findAccountIdxByOwner --------------------------------------------

describe("findAccountIdxByOwner", () => {
  it("finds the exact slot whose owner field matches", () => {
    const buf = newSlabBuffer();
    const target = Keypair.generate().publicKey;
    const other = Keypair.generate().publicKey;
    const slotBase = (i: number) =>
      ENGINE_OFFSET + ENGINE_OFF.accounts + i * ACCOUNT_STRIDE;
    buf.set(other.toBytes(), slotBase(0) + ACCOUNT_OFF.owner);
    buf.set(other.toBytes(), slotBase(1) + ACCOUNT_OFF.owner);
    buf.set(target.toBytes(), slotBase(3) + ACCOUNT_OFF.owner);

    expect(findAccountIdxByOwner(buf, target, 256)).toBe(3);
    expect(findAccountIdxByOwner(buf, target, 3)).toBeNull(); // cap stops before slot 3
    expect(findAccountIdxByOwner(buf, Keypair.generate().publicKey, 256)).toBeNull();
  });
});
