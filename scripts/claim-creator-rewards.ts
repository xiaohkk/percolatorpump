/**
 * Weekly-cron-friendly claim of pump.fun creator rewards on the project
 * token whose `creator` field is `TREASURY_WALLET`.
 *
 * Usage:
 *   pnpm tsx scripts/claim-creator-rewards.ts                        # dry-run (default)
 *   pnpm tsx scripts/claim-creator-rewards.ts --live
 *   pnpm tsx scripts/claim-creator-rewards.ts --network mainnet-beta --live
 *
 * Flow:
 *   1. Read NEXT_PUBLIC_PROJECT_TOKEN_MINT. Bail with a friendly message
 *      if not set — happens when the project token hasn't been launched
 *      yet (see docs/OPERATIONS.md "Treasury bootstrap").
 *   2. Load the treasury keypair from .keys/treasury-<network>.json.
 *      Dry-run tolerates a missing file and uses a throwaway keypair so
 *      this script is always safe to execute.
 *   3. Poll the treasury balance.
 *   4. Build the pump.fun `collect_creator_fee` instruction on the mint.
 *   5. Send (live) or print (dry-run).
 *   6. Poll balance again; print delta and append a line to
 *      docs/CREATOR_REWARDS.md.
 *
 * =========================================================================
 * TODO: pump.fun claim-instruction layout
 * =========================================================================
 *
 * The pump.fun program at `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
 * exposes a creator-fee claim instruction (typically named
 * `collect_creator_fee` or `claim_creator_rewards` in the Anchor IDL).
 * As of this landing, the full IDL is NOT packaged in any SDK we
 * currently depend on and the program's public IDL JSON is not
 * programmatically discoverable.
 *
 * Before flipping this script from stub to working:
 *
 *   a) Pull the IDL from an authoritative source. Options:
 *        - `anchor idl fetch 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
 *          (requires the program to publish its IDL on-chain — verify).
 *        - Copy the JSON from pump.fun's public GitHub if/when they
 *          publish an SDK.
 *        - Reverse-engineer from a real claim tx on Solscan. Search for
 *          any successful creator-fee claim tx to this program and note
 *          the 8-byte discriminator (first 8 bytes of `ix.data`) and the
 *          account-meta list order.
 *   b) Drop the IDL or a hand-coded instruction builder into
 *      `src/lib/pumpfun-claim.ts` and replace `buildClaimIxTodo` below
 *      with a real builder.
 *   c) Confirm `fee_recipient` (where claimed SOL lands) is the creator,
 *      NOT a global pump.fun treasury — if it's the latter, an
 *      additional `withdraw_creator_fee` step is likely required. This
 *      matters because the whole point is routing into
 *      `TREASURY_WALLET`.
 *
 * Until (a)-(c) are done, running with `--live` intentionally fails with
 * a loud error so a cron wrapper alerts on the first weekly run rather
 * than silently sending empty txs.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";

export const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);

export const REWARDS_LOG_RELATIVE_PATH = "docs/CREATOR_REWARDS.md";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

export interface CliArgs {
  dryRun: boolean;
  network: "devnet" | "mainnet-beta" | "testnet" | "localnet";
  rpcUrl: string;
  keypairPath: string;
  logPath: string;
}

export function parseArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env
): CliArgs {
  let dryRun = true;
  let network = (env.NEXT_PUBLIC_NETWORK as CliArgs["network"]) || "devnet";
  let rpcUrlOverride: string | null = env.NEXT_PUBLIC_RPC_URL || null;
  let keypairPath = "";
  let logPath = path.resolve(process.cwd(), REWARDS_LOG_RELATIVE_PATH);

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--live") dryRun = false;
    else if (a === "--network") network = argv[++i] as CliArgs["network"];
    else if (a === "--rpc") rpcUrlOverride = argv[++i];
    else if (a === "--keypair") keypairPath = argv[++i];
    else if (a === "--log") logPath = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: pnpm tsx scripts/claim-creator-rewards.ts [--dry-run|--live] [--network <n>] [--keypair <path>] [--log <path>]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${a}`);
    }
  }

  const rpcUrl =
    rpcUrlOverride ??
    (network === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com");

  if (!keypairPath) {
    keypairPath = path.resolve(process.cwd(), `.keys/treasury-${network}.json`);
  }
  return { dryRun, network, rpcUrl, keypairPath, logPath };
}

// ---------------------------------------------------------------------------
// Pure planner (unit-tested)
// ---------------------------------------------------------------------------

export interface ClaimPlan {
  mint: PublicKey;
  treasury: PublicKey;
  network: CliArgs["network"];
  programId: PublicKey;
  /**
   * Set to `true` until the real pump.fun instruction layout is wired in.
   * While `true`, `--live` refuses to send. Dry-run still prints a plan.
   */
  claimIxPlaceholder: boolean;
  logLinePreview: string;
}

export function formatLogLine(params: {
  timestamp: string;
  mint: PublicKey;
  amountLamports: bigint;
  signature: string;
}): string {
  const sol = (Number(params.amountLamports) / LAMPORTS_PER_SOL).toFixed(9);
  return `| ${params.timestamp} | ${params.mint.toBase58()} | ${sol} SOL | ${params.signature} |`;
}

export function planClaim(params: {
  mint: PublicKey;
  treasury: PublicKey;
  network: CliArgs["network"];
  /**
   * Override for deterministic tests. Production defers to `new Date()`.
   */
  now?: Date;
}): ClaimPlan {
  const ts = (params.now ?? new Date()).toISOString();
  const preview = formatLogLine({
    timestamp: ts,
    mint: params.mint,
    amountLamports: 0n,
    signature: "DRY-RUN",
  });
  return {
    mint: params.mint,
    treasury: params.treasury,
    network: params.network,
    programId: PUMP_FUN_PROGRAM_ID,
    claimIxPlaceholder: true,
    logLinePreview: preview,
  };
}

/**
 * Placeholder builder. Throws until the pump.fun IDL is wired in.
 * Exported so the vitest planner test can assert that `--live` rejects
 * cleanly rather than silently building a zero-byte instruction.
 */
export function buildClaimIxTodo(_params: {
  mint: PublicKey;
  creator: PublicKey;
}): TransactionInstruction {
  throw new Error(
    "pump.fun claim instruction layout not yet wired — see TODO at top of scripts/claim-creator-rewards.ts"
  );
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function loadTreasuryKeypair(filePath: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function appendLogLine(logPath: string, line: string): void {
  if (!fs.existsSync(logPath)) {
    const header =
      "# Creator-reward claims\n\n" +
      "Append-only log. Each row records one run of `scripts/claim-creator-rewards.ts --live`.\n\n" +
      "| timestamp (UTC) | mint | amount | tx signature |\n" +
      "|---|---|---|---|\n";
    fs.writeFileSync(logPath, header);
  }
  fs.appendFileSync(logPath, line + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mintRaw = process.env.NEXT_PUBLIC_PROJECT_TOKEN_MINT;

  console.log("=== claim-creator-rewards ===");
  console.log(`network=${args.network} dryRun=${args.dryRun}`);
  console.log(`rpc=${args.rpcUrl}`);
  console.log(`keypair=${args.keypairPath}`);

  if (!mintRaw) {
    console.log(
      "\nNEXT_PUBLIC_PROJECT_TOKEN_MINT is not set — project token mint not set."
    );
    console.log(
      "The project token gets launched per docs/OPERATIONS.md 'Treasury bootstrap'.\n" +
        "Nothing to claim until that step runs. Exiting 0."
    );
    return;
  }
  const mint = new PublicKey(mintRaw);

  // Load treasury. Dry-run tolerates a missing file so `pnpm tsx
  // ... --dry-run` works on fresh checkouts.
  let treasury: Keypair | null = null;
  let treasuryPubkey: PublicKey;
  if (fs.existsSync(args.keypairPath)) {
    treasury = loadTreasuryKeypair(args.keypairPath);
    treasuryPubkey = treasury.publicKey;
  } else if (args.dryRun) {
    console.log(
      `\n(no keypair at ${args.keypairPath} — dry-run uses a synthetic pubkey for the plan)`
    );
    treasuryPubkey = Keypair.generate().publicKey;
  } else {
    throw new Error(
      `treasury keypair missing at ${args.keypairPath} (required in --live)`
    );
  }

  const plan = planClaim({ mint, treasury: treasuryPubkey, network: args.network });
  console.log("\nPlan:");
  console.log(`  mint:             ${plan.mint.toBase58()}`);
  console.log(`  treasury:         ${plan.treasury.toBase58()}`);
  console.log(`  program:          ${plan.programId.toBase58()}`);
  console.log(`  log would append: ${plan.logLinePreview}`);

  if (args.dryRun) {
    console.log(
      "\n[dry-run] No transaction built — pump.fun claim ix layout is a TODO."
    );
    console.log("[dry-run] Exiting 0.");
    return;
  }

  // Live path. Refuse until the ix layout is real.
  if (plan.claimIxPlaceholder) {
    throw new Error(
      "refuse to --live: pump.fun claim instruction layout not wired. See TODO at top of this script."
    );
  }

  // Unreachable until the TODO is resolved.
  /* eslint-disable no-unreachable */
  if (!treasury) throw new Error("unreachable: treasury null in --live");
  const conn = new Connection(args.rpcUrl, "confirmed");
  const balanceBefore = BigInt(await conn.getBalance(treasuryPubkey));
  console.log(
    `\nbalance before: ${(Number(balanceBefore) / LAMPORTS_PER_SOL).toFixed(9)} SOL`
  );
  // Once the TODO is resolved, this is where we'd:
  //   const ix = buildClaimIx({ mint, creator: treasuryPubkey });
  //   const tx = new Transaction().add(ix);
  //   tx.feePayer = treasuryPubkey;
  //   const sig = await sendAndConfirmTransaction(conn, tx, [treasury], ...);
  //   const balanceAfter = BigInt(await conn.getBalance(treasuryPubkey));
  //   appendLogLine(args.logPath, formatLogLine({ ... }));
  /* eslint-enable no-unreachable */
}

const invokedDirect =
  typeof require !== "undefined" && require.main === module;
if (invokedDirect) {
  main().catch((e) => {
    console.error("claim-creator-rewards failed:", e);
    process.exit(1);
  });
}

// Suppress unused-import warnings while the live path is a TODO. When
// the live path is wired up, these will be consumed.
void os;
void appendLogLine;
