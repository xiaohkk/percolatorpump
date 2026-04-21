/**
 * PumpPortal trade-local client.
 *
 * Wraps the PumpPortal `/trade-local` endpoint, which returns a fully-built
 * `VersionedTransaction` that still needs the caller's signature. For token
 * creation, the mint keypair must also partial-sign the returned tx.
 *
 * Docs: https://pumpportal.fun/creation/trading-api/
 */

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface TokenMeta {
  name: string;
  ticker: string;
  description: string;
  imageUri: string;
}

export interface BuildCreateTxParams {
  mintKeypair: Keypair;
  creator: PublicKey;
  name: string;
  ticker: string;
  description: string;
  imageUri: string;
  initialBuySol: number;
  slippageBps?: number;
  priorityFee?: number;
}

export interface BuildBuyTxParams {
  mint: PublicKey;
  buyer: PublicKey;
  solAmount: number;
  slippageBps?: number;
  priorityFee?: number;
}

export interface BuildSellTxParams {
  mint: PublicKey;
  seller: PublicKey;
  tokenAmount: number;
  slippageBps?: number;
  priorityFee?: number;
}

export interface ComposeLaunchTxParams {
  mintKeypair: Keypair;
  creator: PublicKey;
  tokenMeta: TokenMeta;
  initialBuySol: number;
  serviceFeeSol: number;
  treasury: PublicKey;
}

export interface ComposedLaunch {
  /**
   * Legacy `Transaction` containing a single SystemProgram.transfer from
   * `creator` to `treasury` for `serviceFeeSol`. Caller must sign + send
   * before (or in parallel with) `launchTx`.
   */
  feeTx: Transaction;
  /**
   * PumpPortal-built pump.fun create tx. Already partial-signed by the mint
   * keypair; caller signs as `creator` via the wallet adapter.
   */
  launchTx: VersionedTransaction;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

const DEFAULT_SLIPPAGE_BPS = 1000; // 10%
const DEFAULT_PRIORITY_FEE = 0.0005;

function getApiBase(): string {
  const base = process.env.PUMPPORTAL_API_URL;
  if (!base) {
    throw new Error(
      "PUMPPORTAL_API_URL is not set (expected e.g. https://pumpportal.fun/api)"
    );
  }
  return base.replace(/\/+$/, "");
}

/** Convert basis points (1 bp = 0.01%) into PumpPortal's percent-points slippage. */
function bpsToPercent(bps: number): number {
  return bps / 100;
}

async function postTradeLocal(body: Record<string, unknown>): Promise<VersionedTransaction> {
  const url = `${getApiBase()}/trade-local`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status !== 200) {
    let errText: string;
    try {
      errText = await response.text();
    } catch {
      errText = "<unreadable body>";
    }
    throw new Error(
      `PumpPortal /trade-local error (${response.status}): ${errText}`
    );
  }

  const buf = await response.arrayBuffer();
  return VersionedTransaction.deserialize(new Uint8Array(buf));
}

// -----------------------------------------------------------------------------
// Public builders
// -----------------------------------------------------------------------------

/**
 * Build a pump.fun token-creation transaction. The returned tx is partial-
 * signed by `mintKeypair`; the caller still needs to sign as `creator`.
 */
export async function buildCreateTx(
  params: BuildCreateTxParams
): Promise<VersionedTransaction> {
  const {
    mintKeypair,
    creator,
    name,
    ticker,
    description,
    imageUri,
    initialBuySol,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    priorityFee = DEFAULT_PRIORITY_FEE,
  } = params;

  const tx = await postTradeLocal({
    publicKey: creator.toBase58(),
    action: "create",
    tokenMetadata: {
      name,
      symbol: ticker,
      description,
      uri: imageUri,
    },
    mint: mintKeypair.publicKey.toBase58(),
    denominatedInSol: "true",
    amount: initialBuySol,
    slippage: bpsToPercent(slippageBps),
    priorityFee,
    pool: "pump",
  });

  // Partial-sign with the mint keypair so only the creator signature is
  // missing when the wallet adapter sees it.
  tx.sign([mintKeypair]);
  return tx;
}

/** Build a pump.fun buy tx. Caller signs as `buyer`. */
export async function buildBuyTx(
  params: BuildBuyTxParams
): Promise<VersionedTransaction> {
  const {
    mint,
    buyer,
    solAmount,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    priorityFee = DEFAULT_PRIORITY_FEE,
  } = params;

  return postTradeLocal({
    publicKey: buyer.toBase58(),
    action: "buy",
    mint: mint.toBase58(),
    denominatedInSol: "true",
    amount: solAmount,
    slippage: bpsToPercent(slippageBps),
    priorityFee,
    pool: "pump",
  });
}

/** Build a pump.fun sell tx. Caller signs as `seller`. */
export async function buildSellTx(
  params: BuildSellTxParams
): Promise<VersionedTransaction> {
  const {
    mint,
    seller,
    tokenAmount,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    priorityFee = DEFAULT_PRIORITY_FEE,
  } = params;

  return postTradeLocal({
    publicKey: seller.toBase58(),
    action: "sell",
    mint: mint.toBase58(),
    denominatedInSol: "false",
    amount: tokenAmount,
    slippage: bpsToPercent(slippageBps),
    priorityFee,
    pool: "pump",
  });
}

/**
 * Produce the two transactions needed to launch a token on pump.fun with a
 * service fee going to `treasury`:
 *
 *   1. `feeTx` - legacy Transaction, single SystemProgram.transfer of
 *      `serviceFeeSol` from `creator` to `treasury`.
 *   2. `launchTx` - PumpPortal-returned VersionedTransaction containing the
 *      pump.fun create (and optional initial buy), already partial-signed by
 *      the mint keypair.
 *
 * Rationale for returning two txs instead of one atomic tx: PumpPortal's
 * /trade-local returns a pre-built, pre-compiled message we cannot safely
 * mutate (inserting a fresh instruction requires rewriting the message's
 * static account keys, address lookup tables, and instruction indices). The
 * caller signs and submits both sequentially via the wallet adapter.
 */
export async function composeLaunchTx(
  params: ComposeLaunchTxParams
): Promise<ComposedLaunch> {
  const {
    mintKeypair,
    creator,
    tokenMeta,
    initialBuySol,
    serviceFeeSol,
    treasury,
  } = params;

  const launchTx = await buildCreateTx({
    mintKeypair,
    creator,
    name: tokenMeta.name,
    ticker: tokenMeta.ticker,
    description: tokenMeta.description,
    imageUri: tokenMeta.imageUri,
    initialBuySol,
  });

  const feeTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: creator,
      toPubkey: treasury,
      lamports: Math.round(serviceFeeSol * LAMPORTS_PER_SOL),
    })
  );
  feeTx.feePayer = creator;

  return { feeTx, launchTx };
}
