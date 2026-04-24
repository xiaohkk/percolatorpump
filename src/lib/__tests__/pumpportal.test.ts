/**
 * Unit tests for the PumpPortal trade-local client.
 *
 * We don't hit the real PumpPortal service. Every test stubs `global.fetch`,
 * lets the client build the request body, and asserts on the captured body +
 * return shape.
 *
 * Internal helpers (`bpsToPercent`, `postTradeLocal`) aren't exported, so
 * they're exercised via their observable effects on the public builders.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Keypair,
  PublicKey,
  VersionedTransaction,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  buildCreateTx,
  buildBuyTx,
  buildSellTx,
  composeLaunchTx,
} from "../pumpportal";

const API_BASE = "https://pumpportal.test/api";

/**
 * Return a VersionedTransaction bytes payload that the client can deserialize.
 * We compile a simple real message (SystemProgram memo transfer of 1 lamport)
 * so the bytes are well-formed; the test doesn't care about the instructions,
 * only that `VersionedTransaction.deserialize` succeeds.
 */
function fakeVersionedTxBytes(mintOrCreator: PublicKey): Uint8Array {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: mintOrCreator,
      toPubkey: mintOrCreator,
      lamports: 1,
    })
  );
  tx.recentBlockhash = "11111111111111111111111111111111";
  tx.feePayer = mintOrCreator;
  // Compile to a v0 versioned tx by converting: easiest is to wrap a legacy
  // message. VersionedTransaction can wrap a legacy Message too.
  const legacyMessage = tx.compileMessage();
  const vt = new VersionedTransaction(legacyMessage);
  return vt.serialize();
}

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

function mockFetchOk(
  captured: CapturedRequest[],
  bodyBytes: Uint8Array
): typeof fetch {
  return vi.fn(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    const rawBody = (init?.body ?? "") as string;
    captured.push({ url, body: JSON.parse(rawBody) });
    // solana-web3.js happily deserializes any valid tx bytes; we return
    // the payload via arrayBuffer.
    // Response needs a BodyInit; wrap the Uint8Array in a Blob to avoid
    // TS typing issues on some lib.dom versions.
    return new Response(new Blob([new Uint8Array(bodyBytes)]), {
      status: 200,
      headers: { "Content-Type": "application/octet-stream" },
    }) as unknown as Response;
  }) as unknown as typeof fetch;
}

function mockFetchError(status: number, body: string): typeof fetch {
  return vi.fn(async () =>
    new Response(body, {
      status,
      headers: { "Content-Type": "text/plain" },
    })
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env.PUMPPORTAL_API_URL = API_BASE;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bpsToPercent conversion (observed via slippage field)", () => {
  it("converts 1000 bps → 10 percent", async () => {
    const buyer = Keypair.generate();
    const mint = Keypair.generate();
    const captured: CapturedRequest[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetchOk(captured, fakeVersionedTxBytes(buyer.publicKey))
    );

    await buildBuyTx({
      mint: mint.publicKey,
      buyer: buyer.publicKey,
      solAmount: 0.01,
      slippageBps: 1000,
    });

    expect(captured[0].body.slippage).toBe(10);
  });

  it("converts 250 bps → 2.5 percent", async () => {
    const buyer = Keypair.generate();
    const mint = Keypair.generate();
    const captured: CapturedRequest[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetchOk(captured, fakeVersionedTxBytes(buyer.publicKey))
    );

    await buildBuyTx({
      mint: mint.publicKey,
      buyer: buyer.publicKey,
      solAmount: 0.5,
      slippageBps: 250,
    });

    expect(captured[0].body.slippage).toBe(2.5);
  });
});

describe("composeLaunchTx", () => {
  it("returns a feeTx whose single instruction transfers the correct lamports from creator to treasury", async () => {
    const creator = Keypair.generate();
    const treasury = Keypair.generate();
    const mint = Keypair.generate();
    const captured: CapturedRequest[] = [];
    // composeLaunchTx calls buildCreateTx which partial-signs with the
    // mint, so the fake payload's message needs both creator and mint as
    // signers.
    const placeholder = new Transaction()
      .add(
        SystemProgram.transfer({
          fromPubkey: creator.publicKey,
          toPubkey: mint.publicKey,
          lamports: 1,
        })
      )
      .add(
        SystemProgram.transfer({
          fromPubkey: mint.publicKey,
          toPubkey: creator.publicKey,
          lamports: 1,
        })
      );
    placeholder.recentBlockhash = "11111111111111111111111111111111";
    placeholder.feePayer = creator.publicKey;
    const bytes = new VersionedTransaction(
      placeholder.compileMessage()
    ).serialize();
    vi.stubGlobal("fetch", mockFetchOk(captured, bytes));

    const { feeTx, launchTx } = await composeLaunchTx({
      mintKeypair: mint,
      creator: creator.publicKey,
      tokenMeta: {
        name: "Test",
        ticker: "TST",
        description: "x",
        imageUri: "https://example/img.png",
      },
      initialBuySol: 0,
      serviceFeeSol: 0.03,
      treasury: treasury.publicKey,
    });

    expect(feeTx.feePayer?.toBase58()).toBe(creator.publicKey.toBase58());
    expect(feeTx.instructions).toHaveLength(1);
    const ix = feeTx.instructions[0];
    // SystemProgram.transfer layout: keys[0] = from (writable, signer),
    // keys[1] = to (writable). Amount lives in the ix data; easiest check
    // is to decode as a SystemProgram transfer.
    expect(ix.programId.toBase58()).toBe(SystemProgram.programId.toBase58());
    expect(ix.keys[0].pubkey.toBase58()).toBe(creator.publicKey.toBase58());
    expect(ix.keys[1].pubkey.toBase58()).toBe(treasury.publicKey.toBase58());
    // Lamports are at offset 4 (u32 tag "Transfer" = 2) then u64 LE.
    const lamports = ix.data.readBigUInt64LE(4);
    expect(Number(lamports)).toBe(Math.round(0.03 * LAMPORTS_PER_SOL));

    // launchTx is the PumpPortal payload, returned as-is (mint partial-sign
    // is covered in a dedicated test below).
    expect(launchTx).toBeInstanceOf(VersionedTransaction);
  });
});

describe("postTradeLocal (error path)", () => {
  it("throws a descriptive Error with the response body on non-200", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchError(400, "Bad request: bad mint param")
    );
    const buyer = Keypair.generate();
    const mint = Keypair.generate();
    await expect(
      buildBuyTx({
        mint: mint.publicKey,
        buyer: buyer.publicKey,
        solAmount: 0.01,
      })
    ).rejects.toThrow(/PumpPortal \/trade-local error \(400\): Bad request/);
  });
});

describe("buildCreateTx", () => {
  it("partial-signs the returned tx with the mint keypair", async () => {
    const creator = Keypair.generate();
    const mint = Keypair.generate();
    const captured: CapturedRequest[] = [];

    // Build a tx whose message expects signatures from BOTH the creator
    // and the mint. The easiest way to do that is to compose two system
    // transfers, one with each as the signer. We then return its bytes and
    // verify that after buildCreateTx runs, the mint signature slot is
    // populated (non-zero).
    const placeholderTx = new Transaction()
      .add(
        SystemProgram.transfer({
          fromPubkey: creator.publicKey,
          toPubkey: mint.publicKey,
          lamports: 1,
        })
      )
      .add(
        SystemProgram.transfer({
          fromPubkey: mint.publicKey,
          toPubkey: creator.publicKey,
          lamports: 1,
        })
      );
    placeholderTx.recentBlockhash = "11111111111111111111111111111111";
    placeholderTx.feePayer = creator.publicKey;
    const vt = new VersionedTransaction(placeholderTx.compileMessage());
    const payload = vt.serialize();

    vi.stubGlobal("fetch", mockFetchOk(captured, payload));

    const signed = await buildCreateTx({
      mintKeypair: mint,
      creator: creator.publicKey,
      name: "Test",
      ticker: "TST",
      description: "x",
      imageUri: "https://example/img.png",
      initialBuySol: 0,
    });

    // The request body should have been well-formed.
    expect(captured[0].url).toBe(`${API_BASE}/trade-local`);
    expect(captured[0].body.action).toBe("create");
    expect(captured[0].body.publicKey).toBe(creator.publicKey.toBase58());
    expect(captured[0].body.mint).toBe(mint.publicKey.toBase58());
    expect(captured[0].body.denominatedInSol).toBe("true");

    // Find which signer slot corresponds to the mint and assert it's
    // populated (sign() filled it in).
    const keys = signed.message.staticAccountKeys.map((k) => k.toBase58());
    const mintIdx = keys.indexOf(mint.publicKey.toBase58());
    expect(mintIdx).toBeGreaterThanOrEqual(0);
    const mintSig = signed.signatures[mintIdx];
    expect(mintSig).toBeDefined();
    expect(
      Buffer.from(mintSig!).some((b) => b !== 0),
      "mint signature slot must be non-zero after partial-sign"
    ).toBe(true);
  });
});

describe("buildBuyTx / buildSellTx denominatedInSol wiring", () => {
  it("buy uses denominatedInSol='true'", async () => {
    const buyer = Keypair.generate();
    const mint = Keypair.generate();
    const captured: CapturedRequest[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetchOk(captured, fakeVersionedTxBytes(buyer.publicKey))
    );
    await buildBuyTx({
      mint: mint.publicKey,
      buyer: buyer.publicKey,
      solAmount: 0.25,
    });
    expect(captured[0].body.action).toBe("buy");
    expect(captured[0].body.denominatedInSol).toBe("true");
    expect(captured[0].body.amount).toBe(0.25);
  });

  it("sell uses denominatedInSol='false' (token units)", async () => {
    const seller = Keypair.generate();
    const mint = Keypair.generate();
    const captured: CapturedRequest[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetchOk(captured, fakeVersionedTxBytes(seller.publicKey))
    );
    await buildSellTx({
      mint: mint.publicKey,
      seller: seller.publicKey,
      tokenAmount: 1_000_000,
    });
    expect(captured[0].body.action).toBe("sell");
    expect(captured[0].body.denominatedInSol).toBe("false");
    expect(captured[0].body.amount).toBe(1_000_000);
  });
});
