import { describe, it, expect, beforeAll } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  suffixMatches,
  encryptSecret,
  decryptSecret,
} from "../vanity-pool";

beforeAll(() => {
  // 32 bytes of zeros, hex-encoded
  process.env.VANITY_POOL_ENCRYPTION_KEY = "00".repeat(32);
});

describe("suffixMatches", () => {
  it("matches case-insensitively on the base58 pubkey", () => {
    expect(suffixMatches("abcPERC", "perc")).toBe(true);
    expect(suffixMatches("abcperc", "PERC")).toBe(true);
    expect(suffixMatches("abcPeRc", "pErC")).toBe(true);
  });

  it("does not match when suffix differs", () => {
    expect(suffixMatches("abcagent", "perc")).toBe(false);
    expect(suffixMatches("percabc", "perc")).toBe(false);
  });
});

describe("encrypt / decrypt roundtrip", () => {
  it("recovers identical secretKey bytes", () => {
    const kp = Keypair.generate();
    const payload = encryptSecret(kp.secretKey);
    const recovered = decryptSecret(payload);

    expect(recovered.length).toBe(kp.secretKey.length);
    expect(Buffer.from(recovered).equals(Buffer.from(kp.secretKey))).toBe(true);

    const rebuilt = Keypair.fromSecretKey(recovered);
    expect(rebuilt.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });

  it("uses a fresh nonce per call", () => {
    const kp = Keypair.generate();
    const a = encryptSecret(kp.secretKey);
    const b = encryptSecret(kp.secretKey);
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.encryptedSecret.equals(b.encryptedSecret)).toBe(false);
  });
});
