# Operations runbook

Recurring ops for `percolatorpump`. Read `docs/STATE.md` for the big
picture first.

## Treasury bootstrap — "launch our own …perc token"

The 12 SOL mainnet-deploy threshold is **fueled by pump.fun creator
rewards on our own `…perc` token**. The first thing we do after the
launcher goes live is launch the project's own token via the launcher,
with `TREASURY_WALLET` set as the `creator` on that one mint. From then
on every swap of that token on pump.fun / PumpSwap accrues a creator fee
to the treasury.

This is the only token where `creator` points at the treasury. Every
user launch on `/launch` continues to set `creator = user wallet` (they
keep 100% of their creator rewards).

### One-time procedure (when mainnet launcher is live)

1. Grind a vanity keypair for the project token. The pool already
   contains `…perc` keypairs — pick one and note the pubkey.
2. Log into the launcher with a dev wallet (any funded wallet — the
   creator field is controlled by the API, not the browser session).
3. Temporarily edit `src/app/api/launch/route.ts` so `creator =
   TREASURY_WALLET` instead of the request's `creator` field. Launch
   through the normal `/launch` flow with test metadata (name =
   "percolatorpump", ticker = "PPERC").
4. Confirm the token shows up on pump.fun. Revert the code change.
5. Save the mint pubkey in `docs/OPERATIONS.md` (below), in env as
   `NEXT_PUBLIC_PROJECT_TOKEN_MINT`, and in the pinned slot on the
   landing page footer.
6. Set up a weekly `scripts/claim-creator-rewards.ts` cron that calls
   pump.fun's claim-fees instruction on that mint and sweeps the
   collected SOL into `TREASURY_WALLET`. (Script lands with task #21.)

### Pinned project token mint

```
TBD — set after mainnet launcher goes live.
```

---

## Paid-listing tier gating (task #23 v2)

The on-chain `CreateMarket` instruction enforces a 0.5 SOL floor on
the `fee_lamports` arg. The **actual** price a user pays is decided by
the frontend at `/markets/create` time based on how many
`ORIGIN_OPEN` slabs already exist on-chain.

### Current tiers

| Open listings so far | Fee per new listing |
| --- | --- |
| 0 through 9 | `NEXT_PUBLIC_PROMO_LISTING_FEE_SOL` (default 0.5) |
| 10+ | `NEXT_PUBLIC_STANDARD_LISTING_FEE_SOL` (default 1.5) |

The cutover happens at `NEXT_PUBLIC_PROMO_MARKET_COUNT` (default 10).

### How to change the tier curve

Any env tweak reloads without a program upgrade. Examples:

- **Promo flash sale:** bump `NEXT_PUBLIC_PROMO_MARKET_COUNT` to 20
  for a week, revert to 10 afterwards.
- **Price hike:** raise `NEXT_PUBLIC_STANDARD_LISTING_FEE_SOL` to 2.0.
- **Fire sale:** drop both `PROMO_*` values and redeploy the frontend.

The program's floor stays at 0.5 SOL regardless. If you need to go
lower than 0.5, that's a program-side change
(`MIN_MARKET_CREATION_FEE_LAMPORTS` in `program/src/processor.rs`) and
requires a redeploy.

### Sanity check before mainnet

`cargo test -p percolator-program --test create_market` —
`below_floor_fee_rejected` covers the attack where a user hand-crafts
an ix with a sub-floor fee.

---

## Bulk-import vanity keypairs

External grinders (e.g. `solana-keygen grind --ends-with perc:N`) emit
one `<PUBKEY>.json` file per hit: a JSON array of 64 secret-key bytes.
The `scripts/import-vanity-pool.ts` helper walks a directory, encrypts
each secret with `VANITY_POOL_ENCRYPTION_KEY`, and inserts it into the
Supabase `vanity_pool` table via `insertKeypair`.

### One-time procedure

1. Point your grinder at a working directory, e.g. `~/grind-perc/`:
   ```
   solana-keygen grind --ends-with perc:50 --ignore-case --outdir ~/grind-perc
   ```
2. Confirm env is set:
   ```
   export NEXT_PUBLIC_SUPABASE_URL=...
   export SUPABASE_SERVICE_KEY=...
   export VANITY_POOL_ENCRYPTION_KEY=<32-byte hex or base64>
   ```
3. Dry-run the import (no `--prune`, so files stay put):
   ```
   pnpm tsx scripts/import-vanity-pool.ts --dir ~/grind-perc
   ```
   Expected output:
   ```
   [import-vanity-pool] dir=/Users/you/grind-perc suffix=perc prune=false
   Found 50 candidate file(s).
     inserted AbC…perc
     …
   Summary: 48 inserted, 2 skipped-duplicate, 0 errored, 0 pruned
   ```
4. If the summary looks right, re-run with `--prune` to archive imported
   files into `~/grind-perc/.imported/`:
   ```
   pnpm tsx scripts/import-vanity-pool.ts --dir ~/grind-perc --prune
   ```
   After this, the dir only holds files that failed to import (parse
   error, pubkey suffix mismatch, etc.) — safe to re-run once the
   underlying issue is fixed.

### Flags

| Flag | Default | Notes |
| --- | --- | --- |
| `--dir <path>` | `~/grind-perc` | Source directory |
| `--suffix <s>` | `perc` | Case-insensitive filename + pubkey suffix filter |
| `--prune` | off | Move processed files to `<dir>/.imported/` |

### Failure modes

- **Duplicate pubkey** (already in pool): printed as `dup <pubkey>` and
  counted under `skipped-duplicate`. The file is still moved on
  `--prune`, so a partial import retries cleanly.
- **Malformed file** (not a 64-element JSON number array): printed as
  `errored <file>: <reason>`. Not pruned. The script exits 1 if any
  errors occurred so cron wrappers can alert.
- **Missing env**: the script errors on the first insert — the pool
  module reads `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and
  `VANITY_POOL_ENCRYPTION_KEY` at that point. Nothing is written to
  disk before env is validated.
