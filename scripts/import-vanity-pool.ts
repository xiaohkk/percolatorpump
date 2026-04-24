/**
 * Bulk-import vanity keypairs from a local directory into the Supabase
 * `vanity_pool` table.
 *
 * Compatible with `solana-keygen grind` output: one `<PUBKEY>.json` file
 * per grind hit, each containing a JSON array of 64 bytes (the secret
 * key).
 *
 * Usage:
 *   pnpm tsx scripts/import-vanity-pool.ts                    # ~/grind-perc, suffix=perc
 *   pnpm tsx scripts/import-vanity-pool.ts --dir /tmp/foo     # custom dir
 *   pnpm tsx scripts/import-vanity-pool.ts --prune            # move imported
 *                                                             # files to
 *                                                             # <dir>/.imported/
 *
 * Env requires the same Supabase credentials as `insertKeypair`:
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY +
 *   VANITY_POOL_ENCRYPTION_KEY (32 bytes, hex or base64).
 */

import fs from "fs";
import os from "os";
import path from "path";
import { Keypair } from "@solana/web3.js";
import { insertKeypair, suffixMatches } from "../src/lib/vanity-pool";

export interface ImportArgs {
  dir: string;
  suffix: string;
  prune: boolean;
}

export interface ImportResult {
  inserted: string[];
  duplicates: string[];
  errors: Array<{ file: string; reason: string }>;
  pruned: string[];
}

/**
 * Shape of the minimum Supabase-insert dependency this script takes.
 * Vitest injects a mock; production passes the real `insertKeypair`.
 */
export type InsertFn = (kp: Keypair, suffix: string) => Promise<void>;

const IMPORTED_SUBDIR = ".imported";

function parseArgs(argv: string[]): ImportArgs {
  let dir = path.join(os.homedir(), "grind-perc");
  let suffix = "perc";
  let prune = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" && argv[i + 1]) dir = argv[++i];
    else if (a === "--suffix" && argv[i + 1]) suffix = argv[++i];
    else if (a === "--prune") prune = true;
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: pnpm tsx scripts/import-vanity-pool.ts [--dir <path>] [--suffix <s>] [--prune]"
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return { dir, suffix, prune };
}

function listCandidateFiles(dir: string, suffix: string): string[] {
  const s = suffix.toLowerCase();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => {
      const lower = name.toLowerCase();
      // File must end in `<suffix>.json`. Compare without any leading
      // dot-files so an accidentally-dropped `.DS_Store` doesn't match.
      if (!lower.endsWith(`${s}.json`)) return false;
      if (name.startsWith(".")) return false;
      const full = path.join(dir, name);
      return fs.statSync(full).isFile();
    })
    .sort();
}

function readKeypairFile(filePath: string): Keypair {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("file must contain a JSON array of 64 numbers");
  }
  if (parsed.length !== 64) {
    throw new Error(`expected 64 secret-key bytes, got ${parsed.length}`);
  }
  for (const v of parsed) {
    if (typeof v !== "number" || v < 0 || v > 255 || !Number.isInteger(v)) {
      throw new Error("each entry must be an integer in 0..255");
    }
  }
  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
}

/**
 * Postgres unique-violation is code 23505. Supabase passes it through on
 * `error.code`. We also defensively match on the message text in case
 * the driver changes.
 */
function isDuplicateError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "23505") return true;
  if (e.message && /duplicate key|already exists|unique/i.test(e.message)) {
    return true;
  }
  return false;
}

/**
 * Core loop. Kept pure w.r.t. the CLI (takes an injected insertFn so the
 * vitest test can stand up an in-memory Supabase mock).
 */
export async function importFromDir(
  args: ImportArgs,
  insertFn: InsertFn = insertKeypair
): Promise<ImportResult> {
  const result: ImportResult = {
    inserted: [],
    duplicates: [],
    errors: [],
    pruned: [],
  };
  const files = listCandidateFiles(args.dir, args.suffix);
  if (files.length === 0) {
    return result;
  }

  const importedDir = path.join(args.dir, IMPORTED_SUBDIR);
  if (args.prune && !fs.existsSync(importedDir)) {
    fs.mkdirSync(importedDir, { recursive: true });
  }

  for (const name of files) {
    const full = path.join(args.dir, name);
    let kp: Keypair;
    try {
      kp = readKeypairFile(full);
    } catch (e) {
      result.errors.push({ file: name, reason: (e as Error).message });
      continue;
    }
    const pubkey = kp.publicKey.toBase58();
    if (!suffixMatches(pubkey, args.suffix)) {
      result.errors.push({
        file: name,
        reason: `pubkey ${pubkey} does not end in ${args.suffix}`,
      });
      continue;
    }

    try {
      await insertFn(kp, args.suffix);
      result.inserted.push(pubkey);
    } catch (e) {
      if (isDuplicateError(e)) {
        result.duplicates.push(pubkey);
      } else {
        result.errors.push({ file: name, reason: (e as Error).message });
        continue;
      }
    }

    if (args.prune) {
      const dest = path.join(importedDir, name);
      fs.renameSync(full, dest);
      result.pruned.push(name);
    }
  }

  return result;
}

function formatSummary(r: ImportResult): string {
  return (
    `Summary: ${r.inserted.length} inserted, ${r.duplicates.length} ` +
    `skipped-duplicate, ${r.errors.length} errored, ${r.pruned.length} pruned`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[import-vanity-pool] dir=${args.dir} suffix=${args.suffix} prune=${args.prune}`
  );
  const files = listCandidateFiles(args.dir, args.suffix);
  if (files.length === 0) {
    console.log(`No matching files in ${args.dir}. Nothing to do.`);
    return;
  }
  console.log(`Found ${files.length} candidate file(s).`);

  const result = await importFromDir(args);

  // Per-file status lines (stream instead of buffering — helps when the
  // list is 10k files and Supabase slows).
  for (const pk of result.inserted) console.log(`  inserted ${pk}`);
  for (const pk of result.duplicates) console.log(`  dup      ${pk}`);
  for (const e of result.errors) console.log(`  errored  ${e.file}: ${e.reason}`);
  if (args.prune) {
    for (const name of result.pruned) console.log(`  pruned   ${name}`);
  }

  console.log("\n" + formatSummary(result));
  if (result.errors.length > 0) process.exitCode = 1;
}

const invokedDirect =
  typeof require !== "undefined" && require.main === module;
if (invokedDirect) {
  main().catch((e) => {
    console.error("import-vanity-pool failed:", e);
    process.exit(1);
  });
}
