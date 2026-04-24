/**
 * Percolator TS SDK sanity tests.
 *
 * These don't hit a real cluster — they verify:
 *   - every instruction builder produces the right tag byte,
 *   - Borsh writer/reader round-trip the integer sizes we use,
 *   - SlabHeader decoder reads the 104-byte layout correctly,
 *   - findVaultPda returns a valid [pubkey, bump] pair for a known seed.
 */

import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  Writer,
  Reader,
  createSlabIx,
  createMarketIx,
  depositIx,
  withdrawIx,
  placeOrderIx,
  liquidateIx,
  crankIx,
  bootstrapLpIx,
  initializeEngineIx,
  decodeSlabHeader,
  findVaultPda,
  PROGRAM_ID,
  ORIGIN_OPEN,
  ORIGIN_SEEDED,
  SLAB_HEADER_LEN,
} from "../percolator";

describe("Borsh writer/reader round-trip", () => {
  it("u8/u16/u32/u64/u128/i128 all round-trip", () => {
    const w = new Writer()
      .u8(0xab)
      .u16(0x1234)
      .u32(0xdeadbeef)
      .u64(0x1122334455667788n)
      .u128(2n ** 120n + 42n);
    // i128 via writing a u128 and reading back as i128 with the sign bit set.
    w.u128(2n ** 128n - 7n);
    const r = new Reader(w.toBuffer());
    expect(r.u8()).toBe(0xab);
    expect(r.u16()).toBe(0x1234);
    expect(r.u32()).toBe(0xdeadbeef);
    expect(r.u64()).toBe(0x1122334455667788n);
    expect(r.u128()).toBe(2n ** 120n + 42n);
    expect(r.i128()).toBe(-7n); // 2^128 - 7 interpreted as i128
  });

  it("Writer.bytes passes raw bytes through", () => {
    const payload = Buffer.from([1, 2, 3, 4]);
    const buf = new Writer().u8(0xff).bytes(payload).toBuffer();
    expect(buf.length).toBe(5);
    expect(buf[0]).toBe(0xff);
    expect(Array.from(buf.slice(1))).toEqual([1, 2, 3, 4]);
  });
});

describe("Instruction builders produce the right tag byte", () => {
  const payer = Keypair.generate().publicKey;
  const slab = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const oracle = Keypair.generate().publicKey;

  it("CreateSlab → tag 0", () => {
    const ix = createSlabIx(
      { payer, slab, mint, oracle },
      { bump: 254, vault_bump: 253 }
    );
    expect(ix.data[0]).toBe(0);
    expect(ix.data[1]).toBe(254);
    expect(ix.data[2]).toBe(253);
    expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
  });

  it("Deposit → tag 1", () => {
    const ix = depositIx(
      {
        slab,
        user: payer,
        userTokenAccount: Keypair.generate().publicKey,
        vaultTokenAccount: Keypair.generate().publicKey,
        mint,
      },
      { amount: 5000n }
    );
    expect(ix.data[0]).toBe(1);
  });

  it("Withdraw → tag 2", () => {
    const ix = withdrawIx(
      {
        slab,
        user: payer,
        userTokenAccount: Keypair.generate().publicKey,
        vaultTokenAccount: Keypair.generate().publicKey,
        mint,
      },
      { amount: 1000n }
    );
    expect(ix.data[0]).toBe(2);
  });

  it("PlaceOrder → tag 3 with side byte", () => {
    const ixLong = placeOrderIx(
      { slab, user: payer, oracle },
      {
        side: "long",
        size: 1_000_000n,
        max_price: 2_000_000n,
        min_price: 500_000n,
      }
    );
    expect(ixLong.data[0]).toBe(3);
    expect(ixLong.data[1]).toBe(0); // long

    const ixShort = placeOrderIx(
      { slab, user: payer, oracle },
      {
        side: "short",
        size: 1_000_000n,
        max_price: 2_000_000n,
        min_price: 500_000n,
      }
    );
    expect(ixShort.data[1]).toBe(1);
  });

  it("Liquidate → tag 4, victim_slot as LE u16", () => {
    const ix = liquidateIx(
      {
        slab,
        liquidator: payer,
        liquidatorTokenAccount: Keypair.generate().publicKey,
        oracle,
        vaultTokenAccount: Keypair.generate().publicKey,
      },
      { victim_slot: 0x0102 }
    );
    expect(ix.data[0]).toBe(4);
    expect(ix.data[1]).toBe(0x02);
    expect(ix.data[2]).toBe(0x01);
  });

  it("Crank → tag 5, kind byte", () => {
    const caller = Keypair.generate().publicKey;
    const tokenAccount = Keypair.generate().publicKey;
    const vaultTa = Keypair.generate().publicKey;
    for (const [kind, expected] of [
      ["funding", 0],
      ["gc", 1],
      ["adl_reset", 2],
    ] as const) {
      const ix = crankIx(
        {
          slab,
          caller,
          callerTokenAccount: tokenAccount,
          vaultTokenAccount: vaultTa,
        },
        { kind }
      );
      expect(ix.data[0]).toBe(5);
      expect(ix.data[1]).toBe(expected);
    }
  });

  it("InitializeEngine → tag 6, big payload", () => {
    const ix = initializeEngineIx(
      { slab, creator: payer },
      {
        risk_params: sampleRiskParams(),
        init_oracle_price: 1_000_000n,
      }
    );
    expect(ix.data[0]).toBe(6);
    // 19 fields of mixed u64/u128 + trailing u64 oracle price; just sanity-
    // check the payload is bigger than a trivial instruction.
    expect(ix.data.length).toBeGreaterThan(100);
  });

  it("BootstrapLp → tag 7", () => {
    const ix = bootstrapLpIx(
      {
        slab,
        creator: payer,
        creatorTokenAccount: Keypair.generate().publicKey,
        vaultTokenAccount: Keypair.generate().publicKey,
        mint,
      },
      { amount: 10_000_000n }
    );
    expect(ix.data[0]).toBe(7);
  });

  it("CreateMarket → tag 8, vault_bump + fee_lamports", () => {
    const treasury = Keypair.generate().publicKey;
    const ix = createMarketIx(
      { payer, slab, mint, oracle, treasury },
      { vault_bump: 250, fee_lamports: 500_000_000n }
    );
    expect(ix.data[0]).toBe(8);
    expect(ix.data[1]).toBe(250);
    // Next 8 bytes should be 500_000_000 LE.
    const r = new Reader(ix.data);
    r.skip(2); // tag + bump
    expect(r.u64()).toBe(500_000_000n);
  });
});

describe("SlabHeader decoder", () => {
  it("round-trips a hand-built 104-byte header", () => {
    const mint = Keypair.generate().publicKey;
    const oracle = Keypair.generate().publicKey;
    const creator = Keypair.generate().publicKey;
    const buf = Buffer.alloc(SLAB_HEADER_LEN);
    buf.set(mint.toBytes(), 0);
    buf.set(oracle.toBytes(), 32);
    buf.set(creator.toBytes(), 64);
    buf[96] = 251; // bump
    buf[97] = 1; // initialized
    buf[98] = 249; // vault_bump
    buf[99] = ORIGIN_OPEN; // origin
    // 100..104 padding stays zero

    const decoded = decodeSlabHeader(buf);
    expect(decoded.mint.equals(mint)).toBe(true);
    expect(decoded.oracle.equals(oracle)).toBe(true);
    expect(decoded.creator.equals(creator)).toBe(true);
    expect(decoded.bump).toBe(251);
    expect(decoded.initialized).toBe(true);
    expect(decoded.vault_bump).toBe(249);
    expect(decoded.origin).toBe(ORIGIN_OPEN);
    expect(decoded.is_paid_listing).toBe(true);
    expect(decoded.is_seeded).toBe(false);
  });

  it("is_seeded flag is correct for origin=0", () => {
    const buf = Buffer.alloc(SLAB_HEADER_LEN);
    // All zero except bump so it's a valid-shape-but-unclaimed header.
    buf[96] = 0;
    buf[99] = ORIGIN_SEEDED;
    const decoded = decodeSlabHeader(buf);
    expect(decoded.is_seeded).toBe(true);
    expect(decoded.is_paid_listing).toBe(false);
  });

  it("throws if data shorter than 104 bytes", () => {
    expect(() => decodeSlabHeader(Buffer.alloc(50))).toThrow();
  });
});

describe("findVaultPda", () => {
  it("returns a valid [pubkey, bump] tuple", () => {
    const slab = Keypair.generate().publicKey;
    const [pda, bump] = findVaultPda(slab);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });
});

// -----------------------------------------------------------------------
// helper
// -----------------------------------------------------------------------

function sampleRiskParams() {
  return {
    maintenance_margin_bps: 500,
    initial_margin_bps: 1000,
    trading_fee_bps: 0,
    max_accounts: 64,
    max_crank_staleness_slots: 1_000_000,
    liquidation_fee_bps: 100,
    liquidation_fee_cap: 1_000_000_000n,
    min_liquidation_abs: 100n,
    min_initial_deposit: 1_000n,
    min_nonzero_mm_req: 100n,
    min_nonzero_im_req: 200n,
    insurance_floor: 0n,
    h_min: 10,
    h_max: 1_000,
    resolve_price_deviation_bps: 500,
    max_accrual_dt_slots: 1_000_000,
    max_abs_funding_e9_per_slot: 100,
    min_funding_lifetime_slots: 1_000_000,
    max_active_positions_per_side: 64,
  };
}
