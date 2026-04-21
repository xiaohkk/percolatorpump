# percolatorpump

> [percolatorpump.fun](https://percolatorpump.fun)

Launch `…perc` tokens on pump.fun. Every launch reserves a slot for a leveraged perp market that goes live when Toly's Percolator risk engine deploys to mainnet.

- **Phase 1 (live):** vanity-suffix pump.fun launcher. 0.03 SOL service fee per launch.
- **Phase 2 (locked):** every `…perc` token gets a 10x leveraged SOV-style perp market, soft-burn insurance fund, unlocked at 5 SOL treasury.

## Stack

- Next.js 14 (app router, TypeScript)
- Tailwind + JetBrains Mono
- Solana wallet adapter, `@solana/web3.js`
- PumpPortal `trade-local` for pump.fun create
- Supabase (Postgres for the vanity pool, Storage for launch images)
- AES-256-GCM encrypted keypair storage

## One-time setup

### 1. Env

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com     # devnet for now
NEXT_PUBLIC_NETWORK=devnet
TREASURY_WALLET=<pubkey you control>

NEXT_PUBLIC_SUPABASE_URL=<your supabase project url>
SUPABASE_SERVICE_KEY=<service role key>

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
VANITY_POOL_ENCRYPTION_KEY=<64 hex chars>

# Random long string, server-only
VANITY_POP_SECRET=<random>

PUMPPORTAL_API_URL=https://pumpportal.fun/api
```

### 2. Supabase

Run both migrations against your Supabase project:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_vanity_pool.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_launch_images_bucket.sql
```

Or paste them into the Supabase SQL editor.

### 3. Seed the vanity pool

```bash
pnpm grind --count 20 --suffix perc
```

Takes ~30-60s per keypair on a laptop. Run ahead of time, or in a tmux.

### 4. Dev server

```bash
pnpm dev
```

Open http://localhost:3000.

## Flow

1. `/launch`: connect wallet, fill form, click Launch
2. Wallet signs 2 transactions:
   - **Fee tx** (legacy): 0.03 SOL → treasury
   - **Launch tx** (versioned, pre-signed by the `…perc` mint keypair): pump.fun create + optional initial buy
3. Redirect to `/t/{mint}` share page
4. Landing page treasury counter ticks up. At 5 SOL, Phase 2 unlocks.

## Tests

```bash
pnpm test              # unit (vitest)
pnpm run build         # typecheck + prod build
```

## Scripts

```bash
pnpm grind             # grind ...perc keypairs into the pool
pnpm dev               # local dev server
pnpm build             # production build
pnpm start             # run production build
```

## Deferred (Phase 2, built in parallel)

The Percolator Solana program wrapper lives in the parent repo's `program/` directory:
`/Users/jefferson/Desktop/quarter-two-earning-M/percolator/program/`

Deploys to mainnet when `TREASURY_WALLET` hits 5 SOL. At that point every `…perc` token launched through Phase 1 gets a perp market backfilled.
