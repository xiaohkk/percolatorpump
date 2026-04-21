import { NextResponse } from "next/server";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getConnection } from "@/lib/solana";

const THRESHOLD_SOL = 5;
const THRESHOLD_LAMPORTS = THRESHOLD_SOL * LAMPORTS_PER_SOL;

// Don't cache; we want a fresh read each poll.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const treasuryRaw = process.env.TREASURY_WALLET;

  // Graceful dev-mode fallback: no 500, page still renders.
  if (!treasuryRaw) {
    return NextResponse.json(
      {
        lamports: 0,
        sol: 0,
        threshold: THRESHOLD_SOL,
        thresholdLamports: THRESHOLD_LAMPORTS,
      },
      { headers: { "x-treasury-warning": "TREASURY_WALLET not configured" } }
    );
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(treasuryRaw);
  } catch {
    return NextResponse.json(
      {
        lamports: 0,
        sol: 0,
        threshold: THRESHOLD_SOL,
        thresholdLamports: THRESHOLD_LAMPORTS,
      },
      { headers: { "x-treasury-warning": "TREASURY_WALLET is not a valid PublicKey" } }
    );
  }

  try {
    const lamports = await getConnection().getBalance(pubkey);
    return NextResponse.json({
      lamports,
      sol: lamports / LAMPORTS_PER_SOL,
      threshold: THRESHOLD_SOL,
      thresholdLamports: THRESHOLD_LAMPORTS,
    });
  } catch (e) {
    return NextResponse.json(
      {
        lamports: 0,
        sol: 0,
        threshold: THRESHOLD_SOL,
        thresholdLamports: THRESHOLD_LAMPORTS,
        error: (e as Error).message,
      },
      { status: 200, headers: { "x-treasury-warning": "rpc error" } }
    );
  }
}
