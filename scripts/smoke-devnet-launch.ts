/**
 * End-to-end devnet smoke: grind a ...perc mint, run composeLaunchTx, sign
 * both txs with a local dev keypair, submit to devnet, assert the mint
 * exists on-chain, and append a line to DEVNET_LAUNCHES.md.
 *
 * Preconditions:
 *   - ~/.config/solana/id.json holds a keypair with devnet SOL (airdrop 2).
 *   - TREASURY_WALLET is set in the environment (any valid pubkey; we only
 *     need it to route the 0.01 SOL service fee).
 *   - PUMPPORTAL_API_URL is reachable; default hits the real service.
 *
 * Usage:
 *   pnpm tsx scripts/smoke-devnet-launch.ts
 *
 * This script is a tool, not a Playwright spec — it's gated on the above
 * preconditions and will fail loudly if any is missing. It is NOT invoked by
 * `pnpm test:e2e`.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
} from "@solana/web3.js";
import { composeLaunchTx } from "../src/lib/pumpportal";
import { suffixMatches } from "../src/lib/vanity-pool";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const SUFFIX = "perc";
const GRIND_BUDGET_MS = 60_000; // 1 min cap — plenty for "perc" on 4-char space
const SERVICE_FEE_SOL = 0.01;
const INITIAL_BUY_SOL = 0;
const DEVNET_LOG = path.resolve(process.cwd(), "DEVNET_LAUNCHES.md");

function loadDevKeypair(): Keypair {
  const file = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `Dev keypair not found at ${file}. Run: solana-keygen new --outfile ${file}`
    );
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function grindMintKeypair(): Keypair {
  const deadline = Date.now() + GRIND_BUDGET_MS;
  let tries = 0;
  const start = Date.now();
  while (Date.now() < deadline) {
    const kp = Keypair.generate();
    tries++;
    if (suffixMatches(kp.publicKey.toBase58(), SUFFIX)) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(
        `[grind] matched "${SUFFIX}" after ${tries.toLocaleString()} tries (${elapsed}s) → ${kp.publicKey.toBase58()}`
      );
      return kp;
    }
  }
  throw new Error(
    `Grind timed out after ${GRIND_BUDGET_MS}ms (${tries.toLocaleString()} tries). Raise GRIND_BUDGET_MS.`
  );
}

function appendLog(line: string): void {
  const header = `# Devnet launches

Every entry is an end-to-end devnet launch from \`scripts/smoke-devnet-launch.ts\`.
Columns: timestamp | mint | fee sig | launch sig.

| timestamp | mint | fee sig | launch sig |
| --- | --- | --- | --- |
`;
  if (!fs.existsSync(DEVNET_LOG)) {
    fs.writeFileSync(DEVNET_LOG, header);
  }
  fs.appendFileSync(DEVNET_LOG, line + "\n");
}

async function assertMintExists(
  conn: Connection,
  mint: PublicKey,
  retries = 10
): Promise<void> {
  // A mint account is SPL-Token-owned after pump.fun creates it. Even if the
  // pump.fun program hasn't fully initialized it, the SystemProgram allocate
  // makes the account exist. We check `getAccountInfo` returns non-null.
  for (let i = 0; i < retries; i++) {
    const info = await conn.getAccountInfo(mint, "confirmed");
    if (info !== null) {
      console.log(
        `[assert] mint exists: owner=${info.owner.toBase58()}, lamports=${info.lamports}`
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    `mint ${mint.toBase58()} did not appear on-chain after ${retries} retries`
  );
}

async function main(): Promise<void> {
  const treasuryStr = process.env.TREASURY_WALLET;
  if (!treasuryStr) {
    throw new Error("TREASURY_WALLET env var is required");
  }
  const treasury = new PublicKey(treasuryStr);

  const connection = new Connection(RPC_URL, "confirmed");
  const signer = loadDevKeypair();
  console.log(`[setup] signer=${signer.publicKey.toBase58()}, rpc=${RPC_URL}`);

  const balance = await connection.getBalance(signer.publicKey);
  console.log(`[setup] balance=${(balance / 1e9).toFixed(4)} SOL`);
  if (balance < 0.05 * 1e9) {
    throw new Error(
      `Dev signer has ${(balance / 1e9).toFixed(
        4
      )} SOL — need ≥ 0.05. Run: solana airdrop 2`
    );
  }

  const mintKeypair = grindMintKeypair();

  console.log("[compose] composeLaunchTx...");
  const { feeTx, launchTx } = await composeLaunchTx({
    mintKeypair,
    creator: signer.publicKey,
    tokenMeta: {
      name: "Percolator Smoke",
      ticker: "PSMOKE",
      description: "devnet end-to-end smoke test",
      imageUri: "https://example.com/percolatorpump.png",
    },
    initialBuySol: INITIAL_BUY_SOL,
    serviceFeeSol: SERVICE_FEE_SOL,
    treasury,
  });

  // Finalize feeTx (legacy).
  const latest = await connection.getLatestBlockhash();
  feeTx.recentBlockhash = latest.blockhash;
  feeTx.feePayer = signer.publicKey;
  feeTx.sign(signer);

  console.log("[send] feeTx...");
  const feeSig = await connection.sendRawTransaction(feeTx.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  await connection.confirmTransaction(
    { signature: feeSig, ...latest },
    "confirmed"
  );
  console.log(`[send] feeTx confirmed: ${feeSig}`);

  // Sign the versioned launch tx as the creator. Mint keypair already
  // partial-signed inside buildCreateTx.
  launchTx.sign([signer]);

  console.log("[send] launchTx...");
  let launchSig: string;
  try {
    launchSig = await connection.sendTransaction(launchTx, {
      skipPreflight: false,
      maxRetries: 3,
    });
  } catch (err) {
    if (err instanceof SendTransactionError) {
      const logs = await err.getLogs(connection).catch(() => []);
      console.error("[send] launchTx failed. Logs:");
      for (const line of logs) console.error("  " + line);
    }
    throw err;
  }
  const latestAfter = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: launchSig, ...latestAfter },
    "confirmed"
  );
  console.log(`[send] launchTx confirmed: ${launchSig}`);

  await assertMintExists(connection, mintKeypair.publicKey);

  const stamp = new Date().toISOString();
  appendLog(
    `| ${stamp} | ${mintKeypair.publicKey.toBase58()} | ${feeSig} | ${launchSig} |`
  );
  console.log(`[log] appended → ${DEVNET_LOG}`);
  console.log(`\nSUCCESS. Mint: ${mintKeypair.publicKey.toBase58()}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
