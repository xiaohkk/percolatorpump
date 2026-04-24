"use client";

import { useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  IS_STUB_PROGRAM,
  PROTOCOL_LP_SLOT,
  Side,
  placeOrderIx,
  findVaultPda,
  PROGRAM_ID,
  EngineAggregates,
  EngineAccount,
} from "@/lib/percolator";
import { useUserPosition } from "@/hooks/useUserPosition";
import { useOracleSeries } from "@/hooks/useOracleSeries";
import { getConnection } from "@/lib/solana";
import { OrderPanel } from "@/components/perp/OrderPanel";
import { PositionPanel } from "@/components/perp/PositionPanel";
import { HaircutCard } from "@/components/perp/HaircutCard";
import { ABKBadge } from "@/components/perp/ABKBadge";
import { FillTape } from "@/components/perp/FillTape";
import { MarkChart } from "@/components/perp/MarkChart";
import { Transaction } from "@solana/web3.js";

export default function PerpPage() {
  const params = useParams<{ mint: string }>();
  const mintStr = params?.mint ?? "";
  const mintPk = useMemo(() => {
    try {
      return new PublicKey(mintStr);
    } catch {
      return null;
    }
  }, [mintStr]);

  const { publicKey, signTransaction } = useWallet();
  const { market, account: userAccount } = useUserPosition(
    mintPk,
    publicKey ?? null
  );
  const series = useOracleSeries(mintPk);

  const handlePlaceOrder = useCallback(
    async (args: {
      side: Side;
      size: bigint;
      maxPrice: bigint;
      minPrice: bigint;
    }) => {
      if (!publicKey || !signTransaction) return;
      if (market.status !== "ready") return;

      const ix = placeOrderIx(
        {
          slab: market.data.slab,
          user: publicKey,
          oracle: market.data.header.oracle,
        },
        {
          side: args.side,
          size: args.size,
          max_price: args.maxPrice,
          min_price: args.minPrice,
        },
        PROGRAM_ID
      );

      const conn = getConnection();
      const tx = new Transaction().add(ix);
      tx.feePayer = publicKey;
      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signed = await signTransaction(tx);
      const sig = await conn.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      await conn.confirmTransaction(sig, "confirmed");
      await market.refresh();
    },
    [publicKey, signTransaction, market]
  );

  if (!mintPk) {
    return (
      <main className="min-h-screen px-6 py-16 flex items-start justify-center font-mono">
        <div className="max-w-xl w-full border border-zinc-800 rounded-lg p-8 space-y-2">
          <h1 className="text-2xl font-bold">invalid mint</h1>
          <p className="text-sm text-zinc-500 break-all">
            The address <span className="font-mono">{mintStr}</span> is not a
            valid Solana public key.
          </p>
        </div>
      </main>
    );
  }

  const aggregates =
    market.status === "ready" ? market.data.aggregates : null;
  const vault = market.status === "ready" ? market.data.vault : 0n;
  const insurance = market.status === "ready" ? market.data.insurance : 0n;
  const h = aggregates ? computeH(vault, insurance, aggregates) : null;

  return (
    <main className="min-h-screen px-4 md:px-8 py-8 md:py-14 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">
        {IS_STUB_PROGRAM && (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-3 text-xs text-amber-300">
            Program ID not set — this page is rendering against a stub program.
            Task #17 (devnet deploy) populates the real PROGRAM_ID.
          </div>
        )}

        {/* Header */}
        <header className="flex flex-wrap items-start gap-4 justify-between">
          <div className="space-y-1">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              {mintStr.slice(0, 6)}…{mintStr.slice(-4)}
            </h1>
            <p className="text-xs text-zinc-500">perp market</p>
          </div>
          <div className="flex gap-3 items-start flex-wrap">
            <HaircutCard h={h} />
            <div className="flex flex-col gap-1">
              <ABKBadge
                side="long"
                mode={aggregates?.sideModeLong ?? "unknown"}
              />
              <ABKBadge
                side="short"
                mode={aggregates?.sideModeShort ?? "unknown"}
              />
            </div>
          </div>
        </header>

        {/* Status banners */}
        {market.status === "not_found" && (
          <div
            data-testid="perp-not-found"
            className="border border-zinc-800 rounded-md p-4 text-sm text-zinc-400"
          >
            No slab exists for this mint yet.{" "}
            <a href="/markets/create" className="text-zinc-200 underline">
              Add a market
            </a>{" "}
            to open the first listing.
          </div>
        )}
        {market.status === "error" && (
          <div className="border border-red-900 bg-red-950/30 text-red-300 text-xs rounded p-3">
            RPC error: {market.message}
          </div>
        )}
        {market.status === "loading" && (
          <div className="h-[320px] border border-zinc-800 rounded animate-pulse" />
        )}

        {market.status === "ready" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* LEFT: chart (2/3 on desktop) */}
            <div className="lg:col-span-2 space-y-4">
              <MarkChart
                points={series.points}
                liveMark={series.liveMark}
                mint={mintStr}
              />
              <FillTape />
            </div>

            {/* RIGHT: order + position */}
            <div className="space-y-5">
              <OrderPanel
                mint={mintPk}
                markPrice={market.data.oraclePrice}
                userCapital={userAccount?.capital ?? null}
                onSubmit={handlePlaceOrder}
              />
              <PositionPanel
                position={toPositionProp(userAccount, market.data.oraclePrice)}
                markPrice={market.data.oraclePrice}
              />
              <SlabFacts
                slab={market.data.slab.toBase58()}
                vault={market.data.vault}
                insurance={market.data.insurance}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * h = min(residual, matured) / matured
 * where residual = vault - c_tot - insurance.
 *
 * Returns `null` when there's no matured positive PnL (trivially whole),
 * so the card can render a neutral "—" rather than div-by-zero or 1.00.
 */
function computeH(
  vault: bigint,
  insurance: bigint,
  agg: EngineAggregates
): number | null {
  const matured = agg.pnlMaturedPosTot;
  if (matured === 0n) return null;
  const residual =
    vault > agg.c_tot + insurance ? vault - agg.c_tot - insurance : 0n;
  const numer = residual < matured ? residual : matured;
  // Safe to Number() here: matured fits in u128 but the ratio is in [0,1],
  // and we clamp above. Convert via a scaled integer to preserve 4 decimals.
  const SCALE = 10_000n;
  const scaled = Number((numer * SCALE) / matured);
  return scaled / Number(SCALE);
}

/**
 * Map the raw on-chain `Account` slot to the `PositionPanel` shape.
 * Returns `undefined` when there's no open position (zero basis), and
 * `null` when the slab hasn't been scanned yet (still loading).
 */
function toPositionProp(
  acct: EngineAccount | null,
  markPrice: bigint | null
):
  | {
      side: "long" | "short";
      basis: bigint;
      entry: bigint;
      capital: bigint;
      pnl: bigint;
      reservedPnl: bigint;
    }
  | null
  | undefined {
  if (!acct) return undefined;
  if (acct.positionBasisQ === 0n) return undefined;
  const side: "long" | "short" = acct.positionBasisQ > 0n ? "long" : "short";
  const absBasis =
    acct.positionBasisQ < 0n ? -acct.positionBasisQ : acct.positionBasisQ;
  // We don't persist entry on-chain; approximate with current mark for
  // display until task #15's typed oracle feed exposes entry ticks.
  const entry = markPrice ?? 0n;
  return {
    side,
    basis: absBasis,
    entry,
    capital: acct.capital,
    pnl: acct.pnl,
    reservedPnl: acct.reservedPnl,
  };
}

function SlabFacts({
  slab,
  vault,
  insurance,
}: {
  slab: string;
  vault: bigint;
  insurance: bigint;
}) {
  const [vaultPda] = findVaultPda(new PublicKey(slab));
  return (
    <div className="border border-zinc-900 rounded-md p-3 text-[11px] text-zinc-500 space-y-1">
      <FactRow label="slab" value={shortPk(slab)} />
      <FactRow label="vault pda" value={shortPk(vaultPda.toBase58())} />
      <FactRow label="lp slot" value={`#${PROTOCOL_LP_SLOT} (reserved)`} />
      <FactRow label="vault (engine)" value={vault.toString()} />
      <FactRow label="insurance" value={insurance.toString()} />
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="uppercase tracking-[0.18em]">{label}</span>
      <span className="font-mono text-zinc-300 truncate">{value}</span>
    </div>
  );
}

function shortPk(s: string): string {
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
