/**
 * Coverage for `scripts/import-vanity-pool.ts`.
 *
 * Shape mirrors `grinder.test.ts`: mock `@supabase/supabase-js` with an
 * in-memory table, exercise `importFromDir` against a temp directory of
 * synthetic keypair files, then assert on row counts + filesystem side
 * effects.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { Keypair } from "@solana/web3.js";

// -----------------------------------------------------------------------
// Supabase mock (copy-shape from grinder.test.ts — small in-memory table)
// -----------------------------------------------------------------------

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
        // Simulate the unique(pubkey) constraint.
        if (rows.some((r) => r.pubkey === record.pubkey)) {
          return {
            error: {
              code: "23505",
              message: `duplicate key value violates unique constraint on pubkey`,
            },
          };
        }
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
    }),
    rpc: async () => ({ data: null, error: null }),
    __rows: rows,
  };
  return client;
}

let mockClient: ReturnType<typeof makeMockClient> | null = null;

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    mockClient = makeMockClient();
    return mockClient;
  }),
}));

// ------- Fixture helpers --------------------------------------------------

function writeSyntheticKeypair(dir: string, suffix: string): string {
  // Brute-force a keypair whose base58 pubkey ends in `suffix` (case-insensitive).
  // `perc` is a 4-char suffix, base58 alphabet size 58 ⇒ ~58^4 ≈ 11 M tries
  // worst case. Usually lands in a few thousand. We cap at 2 M so a bad day
  // on the vitest worker still terminates with a clear failure.
  for (let i = 0; i < 2_000_000; i++) {
    const kp = Keypair.generate();
    const pk = kp.publicKey.toBase58();
    if (pk.toLowerCase().endsWith(suffix.toLowerCase())) {
      const filePath = path.join(dir, `${pk}.json`);
      fs.writeFileSync(filePath, JSON.stringify(Array.from(kp.secretKey)));
      return filePath;
    }
  }
  throw new Error(`could not grind ${suffix} keypair in 2M tries`);
}

function mkTempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `vanity-import-${label}-`));
}

// ------- Env + module reset between tests ---------------------------------

beforeEach(() => {
  vi.resetModules();
  mockClient = null;
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

describe("importFromDir (mocked Supabase)", () => {
  // Grinding 3 four-char-suffix keypairs runs ~15 s worst case in CI; bump
  // the per-test timeout to absorb the occasional unlucky round.
  it(
    "finds 3 matches, inserts 3 rows, and does NOT prune by default",
    async () => {
      const dir = mkTempDir("basic");
      for (let i = 0; i < 3; i++) writeSyntheticKeypair(dir, "p");

      const { importFromDir } = await import("../../../scripts/import-vanity-pool");
      const result = await importFromDir({ dir, suffix: "p", prune: false });

      expect(result.inserted).toHaveLength(3);
      expect(result.duplicates).toHaveLength(0);
      expect(result.errors).toEqual([]);
      expect(result.pruned).toHaveLength(0);
      expect(mockClient!.__rows).toHaveLength(3);

      // Files are still in the dir — --prune not set.
      const stillThere = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith("p.json"));
      expect(stillThere).toHaveLength(3);
    },
    90_000
  );

  it(
    "moves processed files to .imported/ when --prune is set",
    async () => {
      const dir = mkTempDir("prune");
      for (let i = 0; i < 3; i++) writeSyntheticKeypair(dir, "p");

      const { importFromDir } = await import("../../../scripts/import-vanity-pool");
      const result = await importFromDir({ dir, suffix: "p", prune: true });

      expect(result.inserted).toHaveLength(3);
      expect(result.pruned).toHaveLength(3);

      const remaining = fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith("p.json"));
      expect(remaining).toHaveLength(0);

      const importedDir = path.join(dir, ".imported");
      expect(fs.existsSync(importedDir)).toBe(true);
      const imported = fs
        .readdirSync(importedDir)
        .filter((f) => f.toLowerCase().endsWith("p.json"));
      expect(imported).toHaveLength(3);
    },
    90_000
  );

  it(
    "flags duplicate inserts without aborting the run",
    async () => {
      const dir = mkTempDir("dup");
      const filePath = writeSyntheticKeypair(dir, "p");
      // Two identical-content files — same pubkey, different filename —
      // prove the duplicate path runs end-to-end. The copy's filename
      // still needs to end in `p.json` so listCandidateFiles picks it up.
      const copyPath = path.join(
        dir,
        path.basename(filePath, ".json") + "-copyp.json"
      );
      fs.copyFileSync(filePath, copyPath);

      const { importFromDir } = await import("../../../scripts/import-vanity-pool");
      const result = await importFromDir({ dir, suffix: "p", prune: false });

      expect(result.inserted).toHaveLength(1);
      expect(result.duplicates).toHaveLength(1);
      expect(result.errors).toEqual([]);
      expect(mockClient!.__rows).toHaveLength(1);
    },
    90_000
  );
});
