import { NextResponse } from "next/server";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/solana";
import { composeLaunchTx } from "@/lib/pumpportal";
import { popVanityKeypair, decryptSecret } from "@/lib/vanity-pool";

const SERVICE_FEE_SOL = 0.03;

interface LaunchBody {
  name: string;
  ticker: string;
  description: string;
  imageUri: string;
  initialBuySol: number;
  creator: string;
}

function validate(body: unknown): body is LaunchBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.name === "string" &&
    b.name.length > 0 &&
    b.name.length <= 32 &&
    typeof b.ticker === "string" &&
    b.ticker.length > 0 &&
    b.ticker.length <= 10 &&
    typeof b.description === "string" &&
    b.description.length > 0 &&
    b.description.length <= 500 &&
    typeof b.imageUri === "string" &&
    b.imageUri.length > 0 &&
    typeof b.initialBuySol === "number" &&
    b.initialBuySol >= 0 &&
    b.initialBuySol <= 5 &&
    typeof b.creator === "string" &&
    b.creator.length > 0
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!validate(body)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const treasuryRaw = process.env.TREASURY_WALLET;
  if (!treasuryRaw) {
    return NextResponse.json({ error: "treasury not configured" }, { status: 500 });
  }

  let treasury: PublicKey;
  let creator: PublicKey;
  try {
    treasury = new PublicKey(treasuryRaw);
    creator = new PublicKey(body.creator);
  } catch {
    return NextResponse.json({ error: "invalid pubkey" }, { status: 400 });
  }

  // Pop a pre-ground ...perc keypair from the vanity pool.
  // Falls back to an ungrinded keypair only when the pool is empty AND an env
  // flag explicitly allows it (so dev flows aren't blocked by an empty DB).
  let mintKeypair: Keypair;
  try {
    const popped = await popVanityKeypair("perc");
    if (!popped) {
      if (process.env.ALLOW_UNGROUND_MINT === "1") {
        mintKeypair = Keypair.generate();
      } else {
        return NextResponse.json(
          { error: "vanity pool empty. retry shortly." },
          { status: 503 }
        );
      }
    } else {
      const secret = decryptSecret({
        encryptedSecret: popped.encryptedSecret,
        nonce: popped.nonce,
        authTag: popped.authTag,
      });
      mintKeypair = Keypair.fromSecretKey(secret);
    }
  } catch (e) {
    return NextResponse.json(
      { error: `pool error: ${(e as Error).message}` },
      { status: 500 }
    );
  }

  // Attach a recent blockhash to the fee tx so the wallet can sign it.
  let feeTxBase64: string;
  let launchTxBase64: string;
  try {
    const { feeTx, launchTx } = await composeLaunchTx({
      mintKeypair,
      creator,
      tokenMeta: {
        name: body.name,
        ticker: body.ticker,
        description: body.description,
        imageUri: body.imageUri,
      },
      initialBuySol: body.initialBuySol,
      serviceFeeSol: SERVICE_FEE_SOL,
      treasury,
    });

    const connection = getConnection();
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    feeTx.recentBlockhash = blockhash;
    feeTx.feePayer = creator;

    feeTxBase64 = feeTx
      .serialize({ requireAllSignatures: false })
      .toString("base64");
    launchTxBase64 = Buffer.from(launchTx.serialize()).toString("base64");
  } catch (e) {
    return NextResponse.json(
      { error: `build error: ${(e as Error).message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    mint: mintKeypair.publicKey.toBase58(),
    feeTxBase64,
    launchTxBase64,
  });
}
