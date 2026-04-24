/**
 * Grinder + pool tests.
 *
 * Split across two concerns:
 *   - `suffixMatches` on random strings — pure, no I/O.
 *   - `insertKeypair` + `popVanityKeypair` roundtrip via a mocked Supabase
 *     client. We intercept the `@supabase/supabase-js` module and stand up an
 *     in-memory table that preserves the encrypted payload through the hex
 *     round-trip the real driver does.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Keypair } from "@solana/web3.js";
import { suffixMatches } from "../vanity-pool";

// -----------------------------------------------------------------------
// Supabase mock
// -----------------------------------------------------------------------

/**
 * Minimal Supabase table row shape the pool code uses. Values are stored
 * verbatim (we fake the `\\x`-hex encoding that real Postgres bytea uses).
 */
interface Row {
  id: number;
  suffix: string;
  pubkey: string;
  encrypted_secret: string;
  iv: string;
  auth_tag: string;
  claimed_at: string | null;
}

function makeMockClient() {
  const rows: Row[] = [];
  let nextId = 1;

  const client = {
    from: (table: string) => ({
      insert: async (record: Partial<Row>) => {
        if (table !== "vanity_pool") return { error: new Error("wrong table") };
        rows.push({
          id: nextId++,
          suffix: record.suffix!,
          pubkey: record.pubkey!,
          encrypted_secret: record.encrypted_secret!,
          iv: record.iv!,
          auth_tag: record.auth_tag!,
          claimed_at: null,
        });
        return { error: null };
      },
      select: (_columns: string, _opts: { count: string; head: boolean }) => ({
        eq: (_col: string, _val: string) => ({
          is: (_col2: string, _val2: null) => Promise.resolve({
            count: rows.filter((r) => r.claimed_at === null).length,
            error: null,
          }),
        }),
      }),
    }),
    rpc: async (fn: string, args: { p_suffix: string }) => {
      if (fn !== "pop_vanity_keypair") {
        return { data: null, error: new Error("unknown rpc") };
      }
      const row = rows.find(
        (r) => r.claimed_at === null && r.suffix === args.p_suffix
      );
      if (!row) return { data: null, error: null };
      row.claimed_at = new Date().toISOString();
      return { data: [row], error: null };
    },
    /** Test helper: expose the in-memory table for assertions. */
    __rows: rows,
  };
  return client;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => makeMockClient()),
}));

// `vanity-pool.ts` caches its Supabase client module-globally, so we must
// reset modules between tests to force re-creation of the mock and avoid
// cross-test state leaks.
beforeEach(() => {
  vi.resetModules();
  process.env.VANITY_POOL_ENCRYPTION_KEY = "00".repeat(32);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://stub.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "stub-service-key";
});

afterEach(() => {
  vi.restoreAllMocks();
});

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe("suffixMatches on random strings", () => {
  it("is case-insensitive", () => {
    expect(suffixMatches("ABCdefPERC", "perc")).toBe(true);
    expect(suffixMatches("abcdefperc", "PERC")).toBe(true);
    expect(suffixMatches("abcdefPeRc", "pErC")).toBe(true);
  });

  it("returns false when the suffix is not at the end", () => {
    expect(suffixMatches("percabc", "perc")).toBe(false);
    expect(suffixMatches("abcPERCdef", "perc")).toBe(false);
  });

  it("is stable over a random corpus of 256 strings", () => {
    // Generate random base58-ish strings and mark them by suffix; verify
    // suffixMatches agrees with a reference `endsWith` check.
    const alphabet =
      "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let mismatches = 0;
    for (let i = 0; i < 256; i++) {
      const len = 20 + (i % 10);
      let s = "";
      for (let j = 0; j < len; j++) {
        s += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const expected = s.toLowerCase().endsWith("perc");
      if (suffixMatches(s, "perc") !== expected) mismatches++;
    }
    expect(mismatches).toBe(0);
  });
});

describe("insertKeypair + popVanityKeypair roundtrip (mocked Supabase)", () => {
  it("inserts a keypair, pops it by suffix, and decrypts back to the same public key", async () => {
    const { insertKeypair, popVanityKeypair } = await import("../vanity-pool");
    const kp = Keypair.generate();
    await insertKeypair(kp, "perc");

    const popped = await popVanityKeypair("perc");
    expect(popped).not.toBeNull();
    expect(popped!.publicKey).toBe(kp.publicKey.toBase58());

    // The pool's on-wire format is hex-escaped `\\x...`. popVanityKeypair
    // returns the decoded Buffers, so we can re-run decryptSecret on
    // them and verify we get the same secretKey back.
    const { decryptSecret } = await import("../vanity-pool");
    const recovered = decryptSecret({
      encryptedSecret: popped!.encryptedSecret,
      nonce: popped!.nonce,
      authTag: popped!.authTag,
    });
    const rebuilt = Keypair.fromSecretKey(recovered);
    expect(rebuilt.publicKey.toBase58()).toBe(kp.publicKey.toBase58());
  });

  it("pop returns null when the suffix pool is empty", async () => {
    const { popVanityKeypair } = await import("../vanity-pool");
    const popped = await popVanityKeypair("agent");
    expect(popped).toBeNull();
  });

  it("does not re-serve a claimed keypair", async () => {
    const { insertKeypair, popVanityKeypair } = await import("../vanity-pool");
    const kp = Keypair.generate();
    await insertKeypair(kp, "perc");
    const first = await popVanityKeypair("perc");
    expect(first).not.toBeNull();
    const second = await popVanityKeypair("perc");
    expect(second).toBeNull();
  });
});
