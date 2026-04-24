/**
 * Unit coverage for the pure planner half of `scripts/seed-top-memes.ts`.
 *
 * The planner is intentionally RPC-free so we can assert the exact shape
 * of the planned instruction list and the rent-based cost estimate
 * without a live cluster or a ~/.config/solana keypair.
 */

import { describe, it, expect } from "vitest";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  SLAB_ACCOUNT_SIZE,
  FEED_ACCOUNT_SIZE,
  LAMPORTS_PER_SOL_BIG,
  estimateRentLamports,
  planAll,
  planForToken,
  SeedConfig,
  SeedTokenEntry,
} from "../../../scripts/seed-top-memes";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function dummyRiskDefaults() {
  return {
    maintenance_margin_bps: 500,
    initial_margin_bps: 1000,
    trading_fee_bps: 30,
    max_accounts: 256,
    max_crank_staleness_slots: 1_000_000,
    liquidation_fee_bps: 100,
    liquidation_fee_cap: "1000000000",
    min_liquidation_abs: "1000",
    min_initial_deposit: "1000",
    min_nonzero_mm_req: "0",
    min_nonzero_im_req: "0",
    insurance_floor: "0",
    h_min: 1000,
    h_max: 100000,
    resolve_price_deviation_bps: 1000,
    max_accrual_dt_slots: 1000,
    max_abs_funding_e9_per_slot: 21,
    min_funding_lifetime_slots: 1_000_000,
    max_active_positions_per_side: 128,
  };
}

function dummyToken(overrides: Partial<SeedTokenEntry> = {}): SeedTokenEntry {
  return {
    symbol: "TEST",
    mint: Keypair.generate().publicKey.toBase58(),
    oracle_source: "RaydiumCpmm",
    pool: Keypair.generate().publicKey.toBase58(),
    init_oracle_price: 1,
    verified: true,
    ...overrides,
  };
}

function threeTokenConfig(): SeedConfig {
  return {
    risk_defaults: dummyRiskDefaults(),
    tokens: [
      dummyToken({ symbol: "WIF" }),
      dummyToken({ symbol: "BONK" }),
      dummyToken({ symbol: "POPCAT" }),
    ],
  };
}

// ---------------------------------------------------------------------------
// estimateRentLamports
// ---------------------------------------------------------------------------

describe("estimateRentLamports", () => {
  it("matches the solana_program Rent::default formula (size + 128) * 3480 * 2", () => {
    expect(estimateRentLamports(0)).toBe(128n * 3480n * 2n);
    expect(estimateRentLamports(100_352)).toBe((100_352n + 128n) * 3480n * 2n);
    expect(estimateRentLamports(328)).toBe((328n + 128n) * 3480n * 2n);
  });
});

// ---------------------------------------------------------------------------
// planForToken shape
// ---------------------------------------------------------------------------

describe("planForToken", () => {
  it("emits two txs with the expected instruction layout", () => {
    const admin = Keypair.generate().publicKey;
    const percolatorId = Keypair.generate().publicKey;
    const oracleId = Keypair.generate().publicKey;
    const slab = Keypair.generate().publicKey;
    const feed = Keypair.generate().publicKey;
    const token = dummyToken({ symbol: "WIF" });

    const plan = planForToken({
      token,
      riskDefaults: dummyRiskDefaults(),
      admin,
      programIds: { percolator: percolatorId, oracle: oracleId },
      slabPubkey: slab,
      feedPubkey: feed,
    });

    expect(plan.txs).toHaveLength(2);

    // tx1: SystemProgram.createAccount(slab) → createSlab → initializeEngine
    const tx1 = plan.txs[0];
    expect(tx1.name).toBe("createSlab+initEngine");
    expect(tx1.instructions).toHaveLength(3);
    expect(tx1.instructions[0].programId.equals(SystemProgram.programId)).toBe(true);
    expect(tx1.instructions[1].programId.equals(percolatorId)).toBe(true);
    expect(tx1.instructions[1].data[0]).toBe(0); // CreateSlab tag
    expect(tx1.instructions[2].programId.equals(percolatorId)).toBe(true);
    expect(tx1.instructions[2].data[0]).toBe(6); // InitializeEngine tag
    expect(tx1.signers.some((s) => s.equals(admin))).toBe(true);
    expect(tx1.signers.some((s) => s.equals(slab))).toBe(true);

    // tx2: SystemProgram.createAccount(feed) → InitializeFeed
    const tx2 = plan.txs[1];
    expect(tx2.name).toBe("initFeed");
    expect(tx2.instructions).toHaveLength(2);
    expect(tx2.instructions[0].programId.equals(SystemProgram.programId)).toBe(true);
    expect(tx2.instructions[1].programId.equals(oracleId)).toBe(true);
    expect(tx2.instructions[1].data[0]).toBe(0); // InitializeFeed tag
    // source_kind for RaydiumCpmm = 2, last byte of the data buffer.
    const ixData = tx2.instructions[1].data;
    expect(ixData[ixData.length - 1]).toBe(2);
    expect(tx2.signers.some((s) => s.equals(feed))).toBe(true);
  });

  it("flags unverified tokens and sentinel placeholders with warnings", () => {
    const plan = planForToken({
      token: {
        symbol: "FAKE",
        mint: "11111111111111111111111111111111",
        oracle_source: "PumpSwap",
        pool: "11111111111111111111111111111111",
        init_oracle_price: 1,
        verified: false,
      },
      riskDefaults: dummyRiskDefaults(),
      admin: Keypair.generate().publicKey,
      programIds: {
        percolator: Keypair.generate().publicKey,
        oracle: Keypair.generate().publicKey,
      },
      slabPubkey: Keypair.generate().publicKey,
      feedPubkey: Keypair.generate().publicKey,
    });

    expect(plan.verified).toBe(false);
    expect(plan.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("verified=false"),
        expect.stringContaining("mint is the 1-sentinel placeholder"),
        expect.stringContaining("pool is the 1-sentinel placeholder"),
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// planAll aggregation
// ---------------------------------------------------------------------------

describe("planAll", () => {
  it("plans every config token and sums rent to the matching total", () => {
    const admin = Keypair.generate().publicKey;
    const programIds = {
      percolator: Keypair.generate().publicKey,
      oracle: Keypair.generate().publicKey,
    };
    const slabKps = new Map<string, PublicKey>();
    const feedKps = new Map<string, PublicKey>();
    for (const sym of ["WIF", "BONK", "POPCAT"]) {
      slabKps.set(sym, Keypair.generate().publicKey);
      feedKps.set(sym, Keypair.generate().publicKey);
    }

    const summary = planAll({
      config: threeTokenConfig(),
      admin,
      programIds,
      slabKeypairGen: (s) => slabKps.get(s)!,
      feedKeypairGen: (s) => feedKps.get(s)!,
    });

    expect(summary.tokens).toHaveLength(3);
    expect(summary.skippedSlabs).toEqual([]);
    expect(summary.unverified).toEqual([]);

    // Per-token cost = rent(slab) + rent(feed) + 2 × tx fee (5000).
    const perToken =
      estimateRentLamports(SLAB_ACCOUNT_SIZE) +
      estimateRentLamports(FEED_ACCOUNT_SIZE) +
      5000n * 2n;
    expect(summary.totalCostLamports).toBe(perToken * 3n);

    // Sanity: 3-token cost is well under 3 SOL (~2.1 SOL in practice).
    expect(summary.totalCostLamports).toBeLessThan(3n * LAMPORTS_PER_SOL_BIG);
  });

  it("skips tokens whose symbol is in skipSymbols", () => {
    const config = threeTokenConfig();
    const summary = planAll({
      config,
      admin: Keypair.generate().publicKey,
      programIds: {
        percolator: Keypair.generate().publicKey,
        oracle: Keypair.generate().publicKey,
      },
      slabKeypairGen: () => Keypair.generate().publicKey,
      feedKeypairGen: () => Keypair.generate().publicKey,
      skipSymbols: new Set(["BONK"]),
    });
    expect(summary.tokens.map((t) => t.symbol)).toEqual(["WIF", "POPCAT"]);
    expect(summary.skippedSlabs).toEqual(["BONK"]);
  });
});
