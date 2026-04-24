"use client";

import { useState, useMemo, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { getConnection } from "@/lib/solana";
import { useSlabs } from "@/hooks/useSlabs";
import { PoolBadge } from "@/components/markets/PoolBadge";
import {
  feeForNextListingSol,
  remainingPromoSlots,
  tierKind,
  getTierConfig,
} from "@/lib/tier-pricing";
import {
  PROGRAM_ID,
  IS_STUB_PROGRAM,
  createMarketIx,
  findVaultPda,
} from "@/lib/percolator";
import type { DexSourceKind } from "@/lib/dex-resolver";

const SLAB_ACCOUNT_SIZE = 100_352;

interface ResolveResult {
  mint: string;
  metadata: {
    name: string;
    symbol: string;
    description: string;
    image: string | null;
  } | null;
  dex: { kind: DexSourceKind; source: string } | null;
  dexReason: string;
  existingSlab: string | null;
  programStub: boolean;
}

export default function MarketsCreatePage() {
  const { publicKey, signTransaction } = useWallet();
  const { paidCount } = useSlabs();
  const cfg = useMemo(() => getTierConfig(), []);
  const [mintInput, setMintInput] = useState("");
  const [resolve, setResolve] = useState<ResolveResult | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    slab: string;
    sig: string;
  } | null>(null);

  const treasuryStr = process.env.NEXT_PUBLIC_TREASURY_WALLET || "";
  const treasury = useMemo(() => {
    try {
      return new PublicKey(treasuryStr);
    } catch {
      return null;
    }
  }, [treasuryStr]);

  const feeSol = feeForNextListingSol(paidCount, cfg);
  const tier = tierKind(paidCount, cfg);
  const promoLeft = remainingPromoSlots(paidCount, cfg);

  const doResolve = useCallback(async () => {
    setResolveError(null);
    setResolve(null);
    setSubmitError(null);
    setSubmitResult(null);
    if (!mintInput.trim()) {
      setResolveError("paste a mint pubkey");
      return;
    }
    let pk: PublicKey;
    try {
      pk = new PublicKey(mintInput.trim());
    } catch {
      setResolveError("not a valid Solana pubkey");
      return;
    }
    setResolving(true);
    try {
      const res = await fetch(
        `/api/markets/resolve?mint=${pk.toBase58()}`,
        { cache: "no-store" }
      );
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setResolve(body as ResolveResult);
    } catch (e) {
      setResolveError((e as Error).message);
    } finally {
      setResolving(false);
    }
  }, [mintInput]);

  const canSubmit =
    !!publicKey &&
    !!signTransaction &&
    !!resolve &&
    !resolve.existingSlab &&
    resolve.dex !== null &&
    !submitting &&
    !IS_STUB_PROGRAM &&
    !!treasury;

  const handleConfirm = useCallback(async () => {
    if (!canSubmit || !publicKey || !signTransaction || !resolve || !treasury) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setSubmitResult(null);
    try {
      const conn = getConnection();
      const mintPk = new PublicKey(resolve.mint);

      // Slab account (keypair-allocated, like CreateSlab).
      const slabKp = Keypair.generate();
      const rent = await conn.getMinimumBalanceForRentExemption(
        SLAB_ACCOUNT_SIZE
      );
      const [vaultPda, vaultBump] = findVaultPda(slabKp.publicKey);
      const oracle = new PublicKey(resolve.dex!.source);
      const feeLamports = BigInt(
        Math.round(feeSol * LAMPORTS_PER_SOL)
      );

      const allocIx = SystemProgram.createAccount({
        fromPubkey: publicKey,
        newAccountPubkey: slabKp.publicKey,
        lamports: rent,
        space: SLAB_ACCOUNT_SIZE,
        programId: PROGRAM_ID,
      });
      const cmIx = createMarketIx(
        {
          payer: publicKey,
          slab: slabKp.publicKey,
          mint: mintPk,
          oracle,
          treasury,
        },
        { vault_bump: vaultBump, fee_lamports: feeLamports }
      );

      const tx = new Transaction().add(allocIx, cmIx);
      tx.feePayer = publicKey;
      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      // slabKp must partial-sign for the alloc step (new account auth).
      tx.partialSign(slabKp);

      const signed = await signTransaction(tx);
      const sig = await conn.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      await conn.confirmTransaction(sig, "confirmed");

      // Unused vaultPda reference keeps the import relevant when we wire
      // the subsequent BootstrapLp step.
      void vaultPda;

      setSubmitResult({ slab: slabKp.publicKey.toBase58(), sig });
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, publicKey, signTransaction, resolve, treasury, feeSol]);

  return (
    <main className="min-h-screen px-6 py-14 md:py-20 font-mono">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            add a market
          </h1>
          <p className="text-sm text-zinc-500">
            Pay-to-list any SPL mint as a Percolator perp market.
          </p>
        </header>

        {IS_STUB_PROGRAM && (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 text-xs text-amber-300">
            Program ID not set. Configure{" "}
            <code>NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID</code> before listings.
          </div>
        )}

        {/* Tier banner */}
        <div
          data-testid="tier-banner"
          className={
            "rounded-lg border p-4 flex items-center justify-between gap-3 " +
            (tier === "promo"
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-zinc-800 bg-zinc-950/40")
          }
        >
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              current tier
            </div>
            <div className="text-sm font-semibold text-zinc-100">
              {tier === "promo" ? "promo" : "standard"} · {feeSol.toFixed(2)} SOL
            </div>
          </div>
          <div className="text-right text-[11px] text-zinc-500 space-y-0.5">
            <div>
              {paidCount} / {cfg.promoCount} promo used
            </div>
            {tier === "promo" && (
              <div className="text-emerald-400">
                {promoLeft} promo slot{promoLeft === 1 ? "" : "s"} left
              </div>
            )}
          </div>
        </div>

        {/* Mint input */}
        <div className="space-y-2">
          <label htmlFor="mint" className="text-xs text-zinc-500 block">
            mint address
          </label>
          <div className="flex gap-2">
            <input
              id="mint"
              type="text"
              value={mintInput}
              onChange={(e) => setMintInput(e.target.value)}
              placeholder="paste SPL mint pubkey"
              className="flex-1 px-3 py-2 bg-black border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-500 font-mono"
              data-testid="mint-input"
            />
            <button
              type="button"
              onClick={doResolve}
              disabled={resolving || !mintInput.trim()}
              data-testid="mint-resolve"
              className="px-4 py-2 text-sm rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resolving ? "…" : "resolve"}
            </button>
          </div>
          {resolveError && (
            <div className="text-xs text-red-400">{resolveError}</div>
          )}
        </div>

        {/* Resolved preview */}
        {resolve && (
          <div
            data-testid="resolve-preview"
            className="border border-zinc-800 rounded-lg p-5 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-100">
                  {resolve.metadata?.name || "unindexed token"}
                  {resolve.metadata?.symbol && (
                    <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      ${resolve.metadata.symbol}
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-zinc-500 mt-1">
                  {resolve.mint.slice(0, 6)}…{resolve.mint.slice(-6)}
                </div>
              </div>
              <PoolBadge
                kind={resolve.dex?.kind ?? null}
                source={resolve.dex?.source}
              />
            </div>

            {resolve.existingSlab && (
              <div
                data-testid="resolve-existing"
                className="text-xs text-zinc-400 border-t border-zinc-800 pt-3"
              >
                A slab already exists for this mint →{" "}
                <Link
                  href={`/perp/${resolve.mint}`}
                  className="text-zinc-200 underline"
                >
                  open market
                </Link>
              </div>
            )}

            {!resolve.existingSlab && resolve.dex === null && (
              <div className="text-xs text-amber-400">
                No trading pool detected. {resolve.dexReason}
              </div>
            )}

            {!resolve.existingSlab && resolve.dex && (
              <div className="space-y-3 text-xs text-zinc-400">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="listing fee" value={`${feeSol.toFixed(2)} SOL`} />
                  <Metric label="rent (slab)" value="~0.7 SOL" />
                </div>
                <div className="text-[11px] text-amber-400/80">
                  Permanent. The slab cannot be deleted once created.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Confirm / wallet gate */}
        {!publicKey ? (
          <WalletMultiButton style={{ width: "100%" }} />
        ) : (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            data-testid="create-submit"
            className="w-full py-3 rounded bg-zinc-100 text-black font-semibold hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
          >
            {submitting
              ? "submitting…"
              : canSubmit
              ? `pay ${feeSol.toFixed(2)} SOL & create`
              : "resolve a mint first"}
          </button>
        )}

        {submitError && (
          <div className="border border-red-900 bg-red-950/30 text-red-300 text-xs rounded p-3 break-all">
            {submitError}
          </div>
        )}

        {submitResult && (
          <div className="border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 text-xs rounded p-3 space-y-1">
            <div>slab created: {submitResult.slab}</div>
            <div>tx: {submitResult.sig}</div>
            <Link
              href={`/perp/${resolve?.mint}`}
              className="inline-block mt-2 underline"
            >
              open market →
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </dt>
      <dd className="font-mono tabular-nums text-zinc-200">{value}</dd>
    </div>
  );
}
