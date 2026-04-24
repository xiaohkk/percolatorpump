/**
 * Unit coverage for the pure planner half of
 * `scripts/claim-creator-rewards.ts`.
 *
 * The real pump.fun claim instruction isn't wired yet (see the TODO
 * block at the top of the script), but the surrounding scaffolding —
 * arg parsing, plan shape, log-line formatting, and the
 * `--live` guardrail — is exercised here.
 */

import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  PUMP_FUN_PROGRAM_ID,
  buildClaimIxTodo,
  formatLogLine,
  parseArgs,
  planClaim,
} from "../../../scripts/claim-creator-rewards";

function dummyMint() {
  return Keypair.generate().publicKey;
}
function dummyTreasury() {
  return Keypair.generate().publicKey;
}

describe("parseArgs", () => {
  it("defaults to dry-run + devnet with a derived keypair path", () => {
    const args = parseArgs([], {
      NEXT_PUBLIC_NETWORK: "devnet",
    });
    expect(args.dryRun).toBe(true);
    expect(args.network).toBe("devnet");
    expect(args.keypairPath).toMatch(/\.keys\/treasury-devnet\.json$/);
    expect(args.rpcUrl).toContain("devnet");
  });

  it("picks up --live and --network mainnet-beta", () => {
    const args = parseArgs(["--live", "--network", "mainnet-beta"], {});
    expect(args.dryRun).toBe(false);
    expect(args.network).toBe("mainnet-beta");
    expect(args.keypairPath).toMatch(/\.keys\/treasury-mainnet-beta\.json$/);
    expect(args.rpcUrl).toContain("mainnet-beta");
  });

  it("honors explicit --keypair and --log overrides", () => {
    const args = parseArgs(
      ["--keypair", "/tmp/kp.json", "--log", "/tmp/log.md"],
      {}
    );
    expect(args.keypairPath).toBe("/tmp/kp.json");
    expect(args.logPath).toBe("/tmp/log.md");
  });
});

describe("planClaim", () => {
  it("returns the right shape + marks the ix as a placeholder", () => {
    const mint = dummyMint();
    const treasury = dummyTreasury();
    const plan = planClaim({
      mint,
      treasury,
      network: "mainnet-beta",
      now: new Date("2026-04-23T00:00:00Z"),
    });
    expect(plan.mint.equals(mint)).toBe(true);
    expect(plan.treasury.equals(treasury)).toBe(true);
    expect(plan.network).toBe("mainnet-beta");
    expect(plan.programId.equals(PUMP_FUN_PROGRAM_ID)).toBe(true);
    expect(plan.claimIxPlaceholder).toBe(true);
    expect(plan.logLinePreview).toMatch(/2026-04-23T00:00:00\.000Z/);
    expect(plan.logLinePreview).toMatch(/0\.000000000 SOL/);
    expect(plan.logLinePreview).toMatch(/DRY-RUN/);
  });
});

describe("formatLogLine", () => {
  it("produces a pipe-delimited row with 9-decimal SOL amount", () => {
    const mint = new PublicKey("11111111111111111111111111111111");
    const line = formatLogLine({
      timestamp: "2026-04-23T12:34:56.000Z",
      mint,
      amountLamports: 1_234_567_890n,
      signature: "5abc…",
    });
    expect(line).toBe(
      `| 2026-04-23T12:34:56.000Z | 11111111111111111111111111111111 | 1.234567890 SOL | 5abc… |`
    );
  });
});

describe("buildClaimIxTodo", () => {
  it("throws a clear TODO error so --live cannot silently succeed", () => {
    expect(() =>
      buildClaimIxTodo({ mint: dummyMint(), creator: dummyTreasury() })
    ).toThrow(/pump\.fun claim instruction layout not yet wired/);
  });
});
