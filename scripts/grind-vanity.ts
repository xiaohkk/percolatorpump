/**
 * Vanity keypair grinder for the percolatorpump pool.
 *
 * Usage:
 *   pnpm tsx scripts/grind-vanity.ts --count 10 --suffix perc
 *
 * If Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY) are
 * set the found keypairs are inserted into the `vanity_pool` table. Otherwise
 * the grinder still runs and prints the pubkeys to stdout.
 */
import { Keypair } from "@solana/web3.js";
import { insertKeypair, suffixMatches } from "../src/lib/vanity-pool";

function parseArgs(argv: string[]): { count: number; suffix: string } {
  let count = 10;
  let suffix = "perc";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--count" && argv[i + 1]) {
      count = parseInt(argv[++i], 10);
    } else if (a === "--suffix" && argv[i + 1]) {
      suffix = argv[++i];
    }
  }
  return { count, suffix };
}

async function main() {
  const { count, suffix } = parseArgs(process.argv.slice(2));
  const hasSupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  );

  console.log(
    `Grinding ${count} keypair(s) ending in "${suffix}" (Supabase: ${
      hasSupabase ? "on" : "off, printing only"
    })`
  );

  let found = 0;
  let searched = 0;
  const start = Date.now();

  while (found < count) {
    const kp = Keypair.generate();
    searched++;

    const pubkey = kp.publicKey.toBase58();
    if (suffixMatches(pubkey, suffix)) {
      found++;
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[${elapsed}s] FOUND #${found}: ${pubkey}`);

      if (hasSupabase) {
        try {
          await insertKeypair(kp, suffix);
        } catch (e) {
          console.error("  insert failed:", (e as Error).message);
        }
      }
    }

    if (searched % 500_000 === 0) {
      const elapsed = (Date.now() - start) / 1000;
      const rate = (searched / elapsed).toFixed(0);
      console.log(
        `  searched ${(searched / 1_000_000).toFixed(
          1
        )}M (${rate}/s) found=${found}/${count}`
      );
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `Done. ${found} keypair(s) in ${elapsed}s, searched ${(
      searched / 1_000_000
    ).toFixed(2)}M.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
