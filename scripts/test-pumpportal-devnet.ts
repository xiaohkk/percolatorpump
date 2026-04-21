/**
 * Devnet smoke test for the PumpPortal trade-local client.
 *
 * Usage (DO NOT run without a funded devnet wallet):
 *   pnpm tsx scripts/test-pumpportal-devnet.ts
 *
 * This script:
 *   1. Grinds a "perc"-suffix mint keypair (or accepts any keypair if grinding
 *      takes too long - the env var SKIP_GRIND=1 skips the suffix filter).
 *   2. Loads a dev signer keypair from ~/.config/solana/id.json if present.
 *   3. Builds feeTx + launchTx via composeLaunchTx.
 *   4. Signs and submits both to devnet.
 *
 * Note: PumpPortal only supports mainnet pump.fun pools, so this is only a
 * compile/shape smoke test. The actual devnet submission will fail at the
 * pump.fun program level; the goal here is to exercise the client code path.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

import {
  composeLaunchTx,
  buildBuyTx,
  buildSellTx,
} from "../src/lib/pumpportal";

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const SUFFIX = "perc";
const GRIND_BUDGET_MS = 15_000;
const SERVICE_FEE_SOL = 0.01;
const INITIAL_BUY_SOL = 0.0;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function loadDevKeypair(): Keypair | null {
  const file = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(file)) {
    console.warn(`[warn] ${file} not found; cannot sign real txs`);
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function grindMintKeypair(suffix: string, budgetMs: number): Keypair {
  const deadline = Date.now() + budgetMs;
  const lc = suffix.toLowerCase();
  let tries = 0;

  while (Date.now() < deadline) {
    const kp = Keypair.generate();
    tries++;
    if (kp.publicKey.toBase58().toLowerCase().endsWith(lc)) {
      console.log(
        `[grind] matched "${suffix}" after ${tries} tries -> ${kp.publicKey.toBase58()}`
      );
      return kp;
    }
  }

  const kp = Keypair.generate();
  console.warn(
    `[grind] budget exhausted after ${tries} tries; using random mint ${kp.publicKey.toBase58()}`
  );
  return kp;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const signer = loadDevKeypair();

  if (!signer) {
    console.error(
      "No dev keypair available - exiting before hitting PumpPortal."
    );
    process.exit(1);
  }

  const mintKeypair =
    process.env.SKIP_GRIND === "1"
      ? Keypair.generate()
      : grindMintKeypair(SUFFIX, GRIND_BUDGET_MS);

  const treasuryStr = process.env.TREASURY_WALLET;
  if (!treasuryStr) {
    throw new Error("TREASURY_WALLET env var is required");
  }
  const treasury = new PublicKey(treasuryStr);

  console.log("[pumpportal] composeLaunchTx...");
  const { feeTx, launchTx } = await composeLaunchTx({
    mintKeypair,
    creator: signer.publicKey,
    tokenMeta: {
      name: "PercolatorPump Smoke",
      ticker: "PPUMP",
      description: "devnet smoke test token",
      imageUri: "https://example.com/percolatorpump.png",
    },
    initialBuySol: INITIAL_BUY_SOL,
    serviceFeeSol: SERVICE_FEE_SOL,
    treasury,
  });

  // Finalize the legacy fee tx.
  const latest = await connection.getLatestBlockhash();
  feeTx.recentBlockhash = latest.blockhash;
  feeTx.feePayer = signer.publicKey;
  feeTx.sign(signer);

  console.log("[pumpportal] sending feeTx...");
  const feeSig = await connection.sendRawTransaction(feeTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  console.log(`[pumpportal] feeTx submitted: ${feeSig}`);

  // Sign the versioned launch tx as the creator. mintKeypair already partial-
  // signed inside buildCreateTx().
  launchTx.sign([signer]);

  console.log("[pumpportal] sending launchTx...");
  const launchSig = await connection.sendTransaction(launchTx, {
    skipPreflight: false,
    maxRetries: 3,
  });
  console.log(`[pumpportal] launchTx submitted: ${launchSig}`);

  // Demonstrate buy/sell builders compile and return VersionedTransactions.
  const buyTx: VersionedTransaction = await buildBuyTx({
    mint: mintKeypair.publicKey,
    buyer: signer.publicKey,
    solAmount: 0.001,
  });
  const sellTx: VersionedTransaction = await buildSellTx({
    mint: mintKeypair.publicKey,
    seller: signer.publicKey,
    tokenAmount: 1000,
  });
  console.log(
    `[pumpportal] buy/sell builders ok (buy msgVer=${buyTx.version}, sell msgVer=${sellTx.version})`
  );

  // Keep `Transaction` import used even if the block above is modified later.
  void Transaction;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
