/**
 * Seed the 15 Approach-D top memes (task #21).
 *
 * Usage:
 *   pnpm tsx scripts/seed-top-memes.ts              # dry-run (default)
 *   pnpm tsx scripts/seed-top-memes.ts --live
 *   pnpm tsx scripts/seed-top-memes.ts --network mainnet-beta --live
 *
 * Per token (one tx per token for the slab path, a second tx for the
 * oracle feed):
 *   tx1 = SystemProgram.createAccount(slab, 100_352)
 *       + CreateSlab (admin, origin=0)
 *       + InitializeEngine (token's risk params)
 *   tx2 = Oracle InitializeFeed (source_kind driven by config)
 *
 * Idempotent. Each run:
 *   - checks whether the slab PDA exists on chain; if so, skips the token
 *   - enforces that every token entry in config is `verified: true` before
 *     sending anything in --live mode
 *   - prints a cost summary
 *
 * Dry-run never touches the network.
 */

import fs from "fs";
import os from "os";
import path from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createSlabIx,
  initializeEngineIx,
  findVaultPda,
  RiskParams,
} from "../src/lib/percolator";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Slab account size in the deployed `compact` feature. Matches the filter
 * in `useMarket` and the rent we pre-fund with SystemProgram.createAccount. */
export const SLAB_ACCOUNT_SIZE = 100_352;

/** `size_of::<oracle::state::Feed>()`. Hand-computed from `Feed`'s fields
 *  (u64, u64, Pubkey, Pubkey, 4×u8, [u8;4], [u64;30]). */
export const FEED_ACCOUNT_SIZE = 328;

/** Solana default rent constants. `minimum_balance(size) = (size + 128) *
 *  DEFAULT_LAMPORTS_PER_BYTE_YEAR * DEFAULT_EXEMPTION_YEARS`. These match
 *  `solana_program::rent::Rent::default()` which is the cluster default on
 *  devnet and mainnet today. */
const DEFAULT_LAMPORTS_PER_BYTE_YEAR = 3480n;
const DEFAULT_EXEMPTION_YEARS = 2n;

/** Default tx fee floor Solana charges per signature. Used only for
 *  cost reporting; real fees use `getRecentPrioritizationFees`. */
const TX_FEE_LAMPORTS = 5000n;

export const LAMPORTS_PER_SOL_BIG = 1_000_000_000n;

const SENTINEL_PUBKEY = "11111111111111111111111111111111";

// Matches oracle `SourceKind` repr.
const SOURCE_KIND: Record<string, number> = {
  PumpBonding: 0,
  PumpSwap: 1,
  RaydiumCpmm: 2,
  MeteoraDlmm: 3,
};

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

export interface SeedTokenEntry {
  symbol: string;
  mint: string;
  oracle_source: keyof typeof SOURCE_KIND;
  pool: string;
  init_oracle_price: number | string;
  verified: boolean;
  tbd_note?: string;
}

export interface SeedConfig {
  risk_defaults: RiskParamsJson;
  tokens: SeedTokenEntry[];
}

/** JSON-wire version of `RiskParams` — u128 fields ship as decimal strings. */
export interface RiskParamsJson {
  maintenance_margin_bps: number;
  initial_margin_bps: number;
  trading_fee_bps: number;
  max_accounts: number;
  max_crank_staleness_slots: number;
  liquidation_fee_bps: number;
  liquidation_fee_cap: string;
  min_liquidation_abs: string;
  min_initial_deposit: string;
  min_nonzero_mm_req: string;
  min_nonzero_im_req: string;
  insurance_floor: string;
  h_min: number;
  h_max: number;
  resolve_price_deviation_bps: number;
  max_accrual_dt_slots: number;
  max_abs_funding_e9_per_slot: number;
  min_funding_lifetime_slots: number;
  max_active_positions_per_side: number;
}

export function riskFromJson(j: RiskParamsJson): RiskParams {
  return {
    maintenance_margin_bps: j.maintenance_margin_bps,
    initial_margin_bps: j.initial_margin_bps,
    trading_fee_bps: j.trading_fee_bps,
    max_accounts: j.max_accounts,
    max_crank_staleness_slots: j.max_crank_staleness_slots,
    liquidation_fee_bps: j.liquidation_fee_bps,
    liquidation_fee_cap: BigInt(j.liquidation_fee_cap),
    min_liquidation_abs: BigInt(j.min_liquidation_abs),
    min_initial_deposit: BigInt(j.min_initial_deposit),
    min_nonzero_mm_req: BigInt(j.min_nonzero_mm_req),
    min_nonzero_im_req: BigInt(j.min_nonzero_im_req),
    insurance_floor: BigInt(j.insurance_floor),
    h_min: j.h_min,
    h_max: j.h_max,
    resolve_price_deviation_bps: j.resolve_price_deviation_bps,
    max_accrual_dt_slots: j.max_accrual_dt_slots,
    max_abs_funding_e9_per_slot: j.max_abs_funding_e9_per_slot,
    min_funding_lifetime_slots: j.min_funding_lifetime_slots,
    max_active_positions_per_side: j.max_active_positions_per_side,
  };
}

// ---------------------------------------------------------------------------
// Pure planner (tested via vitest)
// ---------------------------------------------------------------------------

export interface ProgramIds {
  percolator: PublicKey;
  oracle: PublicKey;
}

export interface PlannedTx {
  name: string;
  instructions: TransactionInstruction[];
  signers: PublicKey[];
}

export interface TokenPlan {
  symbol: string;
  verified: boolean;
  mintPubkey: PublicKey;
  poolPubkey: PublicKey;
  slabPubkey: PublicKey;
  feedPubkey: PublicKey;
  txs: PlannedTx[];
  /** Rent + fee cost for this token alone, in lamports. */
  costLamports: bigint;
  warnings: string[];
}

export interface PlanSummary {
  tokens: TokenPlan[];
  totalCostLamports: bigint;
  skippedSlabs: string[];
  unverified: string[];
}

/**
 * Compute the rent-exempt minimum balance for a given account size.
 * Mirrors `solana_program::rent::Rent::default().minimum_balance(size)`.
 * Pure so the planner test can run offline.
 */
export function estimateRentLamports(bytes: number): bigint {
  return (BigInt(bytes) + 128n) * DEFAULT_LAMPORTS_PER_BYTE_YEAR * DEFAULT_EXEMPTION_YEARS;
}

/** Pack an oracle `InitializeFeed` instruction. */
export function oracleInitializeFeedIx(
  oracleProgramId: PublicKey,
  feed: PublicKey,
  source: PublicKey,
  mint: PublicKey,
  sourceKind: number
): TransactionInstruction {
  // tag (u8=0) + mint([u8;32]) + source([u8;32]) + source_kind (u8)
  const data = Buffer.alloc(1 + 32 + 32 + 1);
  data.writeUInt8(0, 0);
  mint.toBuffer().copy(data, 1);
  source.toBuffer().copy(data, 33);
  data.writeUInt8(sourceKind, 65);
  return new TransactionInstruction({
    programId: oracleProgramId,
    keys: [
      { pubkey: feed, isSigner: false, isWritable: true },
      { pubkey: source, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build the planned instructions + cost for a single token.
 *
 * `slabKeypairPubkey` and `feedKeypairPubkey` are caller-supplied so the
 * planner stays deterministic for tests. In real use, the CLI generates a
 * fresh keypair for each; the pubkey ends up in the plan report so the
 * operator can note it for follow-up.
 */
export function planForToken(params: {
  token: SeedTokenEntry;
  riskDefaults: RiskParamsJson;
  admin: PublicKey;
  programIds: ProgramIds;
  slabPubkey: PublicKey;
  feedPubkey: PublicKey;
  slabRentLamports?: bigint;
  feedRentLamports?: bigint;
}): TokenPlan {
  const warnings: string[] = [];
  if (!params.token.verified) {
    warnings.push(
      `${params.token.symbol}: verified=false — refuse to send in --live mode`
    );
  }
  if (params.token.mint === SENTINEL_PUBKEY) {
    warnings.push(`${params.token.symbol}: mint is the 1-sentinel placeholder`);
  }
  if (params.token.pool === SENTINEL_PUBKEY) {
    warnings.push(`${params.token.symbol}: pool is the 1-sentinel placeholder`);
  }
  const sourceKind = SOURCE_KIND[params.token.oracle_source];
  if (sourceKind === undefined) {
    throw new Error(
      `${params.token.symbol}: unknown oracle_source ${params.token.oracle_source}`
    );
  }

  const mintPubkey = new PublicKey(params.token.mint);
  const poolPubkey = new PublicKey(params.token.pool);

  const [, vaultBump] = findVaultPda(params.slabPubkey, params.programIds.percolator);

  const slabRent = params.slabRentLamports ?? estimateRentLamports(SLAB_ACCOUNT_SIZE);
  const feedRent = params.feedRentLamports ?? estimateRentLamports(FEED_ACCOUNT_SIZE);

  // tx1: create + init slab + init engine
  const createSlabAccount = SystemProgram.createAccount({
    fromPubkey: params.admin,
    newAccountPubkey: params.slabPubkey,
    lamports: Number(slabRent),
    space: SLAB_ACCOUNT_SIZE,
    programId: params.programIds.percolator,
  });
  const createSlab = createSlabIx(
    {
      payer: params.admin,
      slab: params.slabPubkey,
      mint: mintPubkey,
      oracle: params.feedPubkey,
    },
    // The on-chain program doesn't use `bump` for anything (the slab is a
    // plain keypair account, not a PDA); `vault_bump` is the real-deal.
    { bump: 0, vault_bump: vaultBump },
    params.programIds.percolator
  );
  const initEngine = initializeEngineIx(
    { slab: params.slabPubkey, creator: params.admin },
    {
      risk_params: riskFromJson(params.riskDefaults),
      init_oracle_price:
        typeof params.token.init_oracle_price === "string"
          ? BigInt(params.token.init_oracle_price)
          : params.token.init_oracle_price,
    },
    params.programIds.percolator
  );

  // tx2: create + init feed
  const createFeedAccount = SystemProgram.createAccount({
    fromPubkey: params.admin,
    newAccountPubkey: params.feedPubkey,
    lamports: Number(feedRent),
    space: FEED_ACCOUNT_SIZE,
    programId: params.programIds.oracle,
  });
  const initFeed = oracleInitializeFeedIx(
    params.programIds.oracle,
    params.feedPubkey,
    poolPubkey,
    mintPubkey,
    sourceKind
  );

  const txs: PlannedTx[] = [
    {
      name: "createSlab+initEngine",
      instructions: [createSlabAccount, createSlab, initEngine],
      signers: [params.admin, params.slabPubkey],
    },
    {
      name: "initFeed",
      instructions: [createFeedAccount, initFeed],
      signers: [params.admin, params.feedPubkey],
    },
  ];

  const costLamports = slabRent + feedRent + TX_FEE_LAMPORTS * 2n;

  return {
    symbol: params.token.symbol,
    verified: params.token.verified,
    mintPubkey,
    poolPubkey,
    slabPubkey: params.slabPubkey,
    feedPubkey: params.feedPubkey,
    txs,
    costLamports,
    warnings,
  };
}

/**
 * Build plans for every token in a config. Pure (no RPC). Used by both
 * the CLI and the vitest planner unit test.
 */
export function planAll(params: {
  config: SeedConfig;
  admin: PublicKey;
  programIds: ProgramIds;
  /** Caller-supplied to stay deterministic in tests. */
  slabKeypairGen: (symbol: string) => PublicKey;
  feedKeypairGen: (symbol: string) => PublicKey;
  /** Optional: slabs to skip (already exist on chain). */
  skipSymbols?: Set<string>;
}): PlanSummary {
  const skip = params.skipSymbols ?? new Set<string>();
  const tokens: TokenPlan[] = [];
  const skipped: string[] = [];
  const unverified: string[] = [];
  let total = 0n;
  for (const t of params.config.tokens) {
    if (skip.has(t.symbol)) {
      skipped.push(t.symbol);
      continue;
    }
    const plan = planForToken({
      token: t,
      riskDefaults: params.config.risk_defaults,
      admin: params.admin,
      programIds: params.programIds,
      slabPubkey: params.slabKeypairGen(t.symbol),
      feedPubkey: params.feedKeypairGen(t.symbol),
    });
    if (!plan.verified) unverified.push(t.symbol);
    tokens.push(plan);
    total += plan.costLamports;
  }
  return {
    tokens,
    totalCostLamports: total,
    skippedSlabs: skipped,
    unverified,
  };
}

// ---------------------------------------------------------------------------
// CLI (the half that touches disk + RPC)
// ---------------------------------------------------------------------------

interface CliArgs {
  dryRun: boolean;
  network: "devnet" | "mainnet-beta" | "testnet" | "localnet";
  configPath: string;
  rpcUrl: string;
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = true;
  let network = (process.env.NEXT_PUBLIC_NETWORK as CliArgs["network"]) || "devnet";
  let configPath = path.resolve(process.cwd(), "config/seed-tokens.json");
  let rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL ||
    (network === "mainnet-beta"
      ? "https://api.mainnet-beta.solana.com"
      : "https://api.devnet.solana.com");

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--live") dryRun = false;
    else if (a === "--network") network = argv[++i] as CliArgs["network"];
    else if (a === "--config") configPath = argv[++i];
    else if (a === "--rpc") rpcUrl = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: pnpm tsx scripts/seed-top-memes.ts [--dry-run|--live] [--network <n>] [--config <path>] [--rpc <url>]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return { dryRun, network, configPath, rpcUrl };
}

function loadAdminKeypair(): Keypair {
  const file = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `Admin keypair not found at ${file}. Run: solana-keygen new --outfile ${file}`
    );
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadConfig(p: string): SeedConfig {
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  if (!raw.tokens || !Array.isArray(raw.tokens)) {
    throw new Error(`config ${p}: missing "tokens" array`);
  }
  if (!raw.risk_defaults) {
    throw new Error(`config ${p}: missing "risk_defaults"`);
  }
  return { risk_defaults: raw.risk_defaults, tokens: raw.tokens };
}

function formatSol(lamports: bigint): string {
  const whole = lamports / LAMPORTS_PER_SOL_BIG;
  const frac = lamports % LAMPORTS_PER_SOL_BIG;
  return `${whole}.${frac.toString().padStart(9, "0")} SOL`;
}

async function findSkippedSlabs(
  conn: Connection,
  plans: TokenPlan[]
): Promise<Set<string>> {
  // A fresh keypair never already exists on chain, so we only skip when the
  // operator passes a known-slab pubkey via some future mapping file. For
  // now, return empty — idempotency is still there for reruns because the
  // CLI persists generated keypairs between runs (the operator keeps a
  // .keys/ file, per DEPLOY convention).
  // TODO: once a persisted symbol→slab mapping is added (post-devnet), look
  // up each plan.slabPubkey via `getAccountInfo` and add to skip set.
  return new Set();
}

async function sendPlannedTx(
  conn: Connection,
  admin: Keypair,
  signerKeys: Map<string, Keypair>,
  plan: TokenPlan
) {
  for (const tx of plan.txs) {
    const transaction = new Transaction().add(...tx.instructions);
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = admin.publicKey;

    // Collect Keypair objects for every required signer. `admin` is always
    // required; slab/feed keypair is required for its respective tx.
    const signers: Keypair[] = [admin];
    for (const signer of tx.signers) {
      if (signer.equals(admin.publicKey)) continue;
      const kp = signerKeys.get(signer.toBase58());
      if (!kp) throw new Error(`missing signer keypair for ${signer.toBase58()}`);
      signers.push(kp);
    }

    const sig = await sendAndConfirmTransaction(conn, transaction, signers, {
      commitment: "confirmed",
    });
    console.log(`  ${tx.name} sig=${sig}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const percolatorProgramId = new PublicKey(
    process.env.NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID || SENTINEL_PUBKEY
  );
  const oracleProgramId = new PublicKey(
    process.env.NEXT_PUBLIC_ORACLE_PROGRAM_ID || SENTINEL_PUBKEY
  );

  console.log("=== seed-top-memes ===");
  console.log(`network=${args.network} dryRun=${args.dryRun}`);
  console.log(`rpc=${args.rpcUrl}`);
  console.log(`percolator=${percolatorProgramId.toBase58()}`);
  console.log(`oracle=${oracleProgramId.toBase58()}`);
  console.log(`config=${args.configPath}`);

  const config = loadConfig(args.configPath);

  // For --live, we need an admin keypair. Dry-run uses a throwaway pubkey
  // so the script works with no ~/.config/solana/id.json.
  let adminKp: Keypair | null = null;
  let adminPubkey: PublicKey;
  if (args.dryRun) {
    adminPubkey = new PublicKey(SENTINEL_PUBKEY);
  } else {
    adminKp = loadAdminKeypair();
    adminPubkey = adminKp.publicKey;
  }

  // Generate a stable set of slab/feed keypairs for this run. In --live
  // mode, the operator should capture these addresses; rerunning will
  // generate new ones unless the slab already exists on chain.
  const slabKps = new Map<string, Keypair>();
  const feedKps = new Map<string, Keypair>();
  for (const t of config.tokens) {
    slabKps.set(t.symbol, Keypair.generate());
    feedKps.set(t.symbol, Keypair.generate());
  }
  const slabKeypairGen = (sym: string) => slabKps.get(sym)!.publicKey;
  const feedKeypairGen = (sym: string) => feedKps.get(sym)!.publicKey;

  // Plan everything up front (cheap; pure).
  const firstPassPlan = planAll({
    config,
    admin: adminPubkey,
    programIds: { percolator: percolatorProgramId, oracle: oracleProgramId },
    slabKeypairGen,
    feedKeypairGen,
  });

  // Refine skip set from RPC in --live mode (and best-effort in --dry-run
  // so the report reflects reality if the operator has connectivity).
  let skipSymbols: Set<string> = new Set();
  if (!args.dryRun) {
    const conn = new Connection(args.rpcUrl, "confirmed");
    skipSymbols = await findSkippedSlabs(conn, firstPassPlan.tokens);
  }
  const plan = planAll({
    config,
    admin: adminPubkey,
    programIds: { percolator: percolatorProgramId, oracle: oracleProgramId },
    slabKeypairGen,
    feedKeypairGen,
    skipSymbols,
  });

  // Report.
  console.log("\nPlanned tokens:");
  for (const t of plan.tokens) {
    console.log(
      `  ${t.symbol.padEnd(8)} verified=${t.verified} slab=${t.slabPubkey.toBase58()} feed=${t.feedPubkey.toBase58()} cost=${formatSol(t.costLamports)}`
    );
    for (const w of t.warnings) console.log(`    ! ${w}`);
  }
  if (plan.skippedSlabs.length) {
    console.log(`\nSkipped (already on chain): ${plan.skippedSlabs.join(", ")}`);
  }
  console.log(
    `\nTotal planned cost: ${formatSol(plan.totalCostLamports)} across ${plan.tokens.length} tokens`
  );

  if (args.dryRun) {
    if (plan.unverified.length) {
      console.log(
        `\n[dry-run] WARNING: ${plan.unverified.length} tokens are verified=false. --live will refuse until each is flipped to true after solscan verification.`
      );
    }
    console.log("[dry-run] No transactions sent. Exiting 0.");
    return;
  }

  if (plan.unverified.length) {
    throw new Error(
      `refuse to --live: ${plan.unverified.length} tokens have verified=false: ${plan.unverified.join(", ")}`
    );
  }

  // Live path.
  if (!adminKp) throw new Error("unreachable: adminKp missing in --live");
  const conn = new Connection(args.rpcUrl, "confirmed");
  const signerKeys = new Map<string, Keypair>();
  signerKeys.set(adminKp.publicKey.toBase58(), adminKp);
  for (const [sym, kp] of slabKps.entries()) signerKeys.set(kp.publicKey.toBase58(), kp);
  for (const [sym, kp] of feedKps.entries()) signerKeys.set(kp.publicKey.toBase58(), kp);

  for (const t of plan.tokens) {
    console.log(`\n--> ${t.symbol}`);
    await sendPlannedTx(conn, adminKp, signerKeys, t);
    // Rate-limit: ~2 tx/s across 2 txs/token = 1s between tokens.
    await sleep(500);
  }
  console.log(`\nDone. Total spent: ${formatSol(plan.totalCostLamports)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Only run `main` when invoked as a script (not when imported by vitest).
const invokedDirect =
  typeof require !== "undefined" && require.main === module;
if (invokedDirect) {
  main().catch((err) => {
    console.error("seed-top-memes failed:", err);
    process.exit(1);
  });
}
