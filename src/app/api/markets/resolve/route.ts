/**
 * GET /api/markets/resolve?mint=<pubkey>
 *
 * Given an SPL mint, return:
 *   - basic Metaplex metadata (name, symbol, image) if indexed,
 *   - detected DEX source (which AMM the oracle should point at),
 *   - whether a slab already exists for this mint.
 *
 * This is the read-only half of task #24's user flow. The write half
 * (POST /api/markets/create) happens client-side once the user confirms
 * — the frontend builds the create-account + CreateMarket tx and the
 * wallet signs.
 */

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/solana";
import { resolveDexSource } from "@/lib/dex-resolver";
import { resolveTokenMetadata } from "@/lib/token-metadata";
import { PROGRAM_ID, IS_STUB_PROGRAM } from "@/lib/percolator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const mint = req.nextUrl.searchParams.get("mint");
  if (!mint) {
    return NextResponse.json({ error: "mint param required" }, { status: 400 });
  }

  let mintPk: PublicKey;
  try {
    mintPk = new PublicKey(mint);
  } catch {
    return NextResponse.json(
      { error: "mint is not a valid Solana public key" },
      { status: 400 }
    );
  }

  const conn = getConnection();

  const [metadata, dex, existingSlab] = await Promise.all([
    resolveTokenMetadata(conn, mintPk).catch(() => null),
    resolveDexSource(conn, mintPk).catch((e) => ({
      mint: mintPk,
      source: null,
      reason: (e as Error).message,
    })),
    findExistingSlab(mintPk).catch(() => null),
  ]);

  return NextResponse.json({
    mint: mintPk.toBase58(),
    metadata: metadata
      ? {
          name: metadata.name,
          symbol: metadata.symbol,
          description: metadata.description,
          image: metadata.image,
        }
      : null,
    dex: dex.source
      ? { kind: dex.source.kind, source: dex.source.source.toBase58() }
      : null,
    dexReason: dex.reason,
    existingSlab: existingSlab?.toBase58() ?? null,
    programStub: IS_STUB_PROGRAM,
  });
}

async function findExistingSlab(mint: PublicKey): Promise<PublicKey | null> {
  if (IS_STUB_PROGRAM) return null;
  const conn = getConnection();
  const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [
      { dataSize: 100_352 },
      // SlabHeader.mint lives at offset 0.
      { memcmp: { offset: 0, bytes: mint.toBase58() } },
    ],
    dataSlice: { offset: 0, length: 0 }, // we only need the pubkey
  });
  return accounts[0]?.pubkey ?? null;
}
