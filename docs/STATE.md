# Project State (read this first)

Last updated: 2026-04-24

This doc is the single source of truth for anyone picking up the project
cold (including a fresh Claude session). Read top-to-bottom before executing
any prompt in PROMPTS.md.

---

## Product in one sentence

`percolatorpump.fun` is a Solana perps protocol that uses the memecoin
itself as collateral, seeded Day 1 with the top 15 Solana memes, with a
pay-to-list flow for everything else. A Phase 1 launcher on pump.fun funds
the protocol deploy.

## Strategic model (Approach D: Seeded + Pay-to-List)

| Tier | What | Who pays | How much |
|---|---|---|---|
| **Seeded** | 15 top Solana memes (WIF, BONK, POPCAT, etc.) | Us, from Phase 1 treasury | ~10.5 SOL rent for 15 markets |
| **Open** | Any other SPL mint (new pump.fun tokens, `…perc` launches, obscure memes) | Whoever wants the market | 0.5 SOL fee + ~0.7 SOL rent |

Phase 1 launcher (`…perc` vanity tokens on pump.fun) is a **revenue stream**,
not a gating mechanism. It no longer promises a free perp market.

## Financial plan

- **Reserve (untouched):** 14 SOL
- **Phase 1 treasury:** accumulates from 0.03 SOL launcher service fees
- **Threshold to unlock Phase 2:** 12 SOL accumulated
- **Spent at unlock:** ~0.5 SOL program deploy + ~10.5 SOL seed = ~11 SOL
- **Post-unlock revenue:** 0.5 SOL per open listing + trading fees per market

## Repo layout

```
Desktop/quarter-two-earning-M/
├── percolator/                  (Toly's fork + our program wrapper)
│   ├── src/percolator.rs        (the frozen library; add-only changes)
│   ├── src/i128.rs, wide_math.rs
│   ├── program/                 (our Solana program, MAX_ACCOUNTS=256)
│   │   ├── src/{lib,instruction,processor,state,error}.rs
│   │   └── tests/create_slab.rs
│   ├── oracle/                  (to be built - task #15)
│   ├── keeper/                  (to be built - task #16)
│   └── Cargo.toml               (workspace)
│
└── percpad/                     (Phase 1 launcher app + Phase 2 frontend)
    ├── src/app/                 (Next.js 14 app router)
    ├── src/lib/                 (vanity-pool, pumpportal, solana)
    ├── src/components/          (UI)
    ├── supabase/migrations/     (0001 vanity pool, 0002 images bucket)
    ├── scripts/                 (grind-vanity, test-pumpportal-devnet)
    ├── e2e/                     (Playwright)
    ├── .keys/                   (git-ignored - dev treasury keypair)
    └── docs/                    (this file + PROMPTS.md + OPERATIONS.md)
```

GitHub: https://github.com/xiaohkk/percolatorpump (public, `main` branch)
Domain (not yet pointed): percolatorpump.fun

## Status (what's built)

### Phase 1 launcher — code complete
- Scaffold, wallet adapter, dark terminal UI
- Vanity grinder (…perc suffix, AES-256-GCM)
- PumpPortal `trade-local` client (composeLaunchTx returns {feeTx, launchTx})
- `/launch` page + form + submit
- `/t/[mint]` share page (Metaplex decode, pump.fun price, OG tags)
- Landing + live treasury counter
- `/api/launch`, `/api/upload-image`, `/api/treasury/balance`, `/api/vanity/pop`
- Supabase migrations (2 files)
- 4 vitest unit tests, 3 Playwright specs
- README + .env.example
- Dev server runs locally. Production deploy pending (task #22).

Needs you to: create Supabase project, apply migrations, seed vanity pool,
decide on treasury wallet, deploy to VPS.

### Phase 2 program — critical path complete, not yet deployed
- Cargo workspace (`.`, `program`, `oracle`, `keeper`), parent lib
  add-only (new `compact` MAX_ACCOUNTS=256 cfg branch only)
- Compact slab ~100 KB, ~0.70 SOL rent
- Program ID ground to end in `...perc`:
  `hhjXnj81pWwrUwVLAEojFFK9mPR2DSCUV3QiFXfperc`
- PercolatorInstruction: 9 variants with full Borsh codec
  (CreateSlab, InitializeEngine, Deposit, Withdraw, PlaceOrder,
  Liquidate, Crank, BootstrapLp, CreateMarket). All implemented,
  none stubbed.
- SlabHeader 104 bytes with initialized/vault_bump/origin fields
- Oracle adapter program written + tested
- Keeper bot crate written + tested (funding/GC/ADL/liquidation)
- Tests (on 2026-04-24):
  - `cargo test -p percolator-program`: 78/78 pass (10 lib + 68
    integration across 8 suites — create_slab, initialize_engine,
    deposit, withdraw, place_order, liquidate, crank, create_market,
    engine_layout)
  - `cargo test -p percolator-oracle`: 15/15 pass
  - `cargo test -p percolator-keeper`: 6/6 pass
- Pushed to `xiaohkk/percolator:master` at 3b2d465

Devnet deploys (task #17):
- percolator-program: `hhjXnj81pWwrUwVLAEojFFK9mPR2DSCUV3QiFXfperc`
- percolator-oracle:  `7ombRzUH7EwQhnJnwutRvtohLot6y5j6AYjrkHjQ14Xv`
  (deployed 2026-04-24, sig `4oE3VNnF6Tu...`, ~0.52 SOL)
Both pubkeys wired into `percpad/.env.local`. Upgrade authority for
both is `FaXhdZcAg8Y8DLgCd42yvmYFKaWUbi4CrpueMq5DCFfA` (local CLI
keypair). Deploy wallet balance after: ~1.34 SOL.

Not yet done: devnet smoke test script (`scripts/devnet-smoke.ts`
was punted — 99 BanksClient tests cover runtime correctness; live-RPC
validation will happen as the frontend exercises real devnet tx
encoding). Security self-review (task #18). VPS deploy (task #22).
Mainnet cutover + program upgrade-authority revoke (task #7).

### Frontend — critical path complete, not yet deployed
- All Phase 1 launcher pages + API routes (landing, /launch, /t/[mint])
- Phase 2 UI fully written: /markets (browse), /markets/create (paid
  listing tier), /perp/[mint] (trading), /portfolio (positions)
- Seed tokens config (`config/seed-tokens.json`) with DEX routing
- Scripts: import-vanity-pool, seed-top-memes, claim-creator-rewards,
  smoke-devnet-launch
- Percolator on-chain client (`src/lib/percolator/`): Borsh mirrors
  of program instructions + slab/engine decoders
- Ops runbook at `docs/OPERATIONS.md`
- 53 vitest unit tests pass; Playwright specs for landing, launch,
  markets, markets-create, perp, share-page
- Supabase dev project `fgkltlgdvpeeqaqziwvc` live, vanity pool seeded
- Devnet treasury funded at
  `EM7mXeCaUvj4yJ6zmEtgDfrUUSiK2vuyiwvijNpayktn` (~1 SOL)
- Pushed to `xiaohkk/percolatorpump:main` at 7e32b4c

Not yet done: VPS deploy (task #22), mainnet launcher cutover (task #7).

## Approach D seed tokens (top 15 by 24h volume)

| # | Ticker | DEX source |
|---|---|---|
| 1 | TRUMP | Meteora + Raydium |
| 2 | PENGU | Raydium |
| 3 | BONK | Raydium |
| 4 | WIF | Raydium + Orca |
| 5 | BOME | Raydium |
| 6 | FARTCOIN | Meteora |
| 7 | PNUT | Raydium |
| 8 | MOODENG | Raydium |
| 9 | MELANIA | Meteora |
| 10 | POPCAT | Raydium |
| 11 | PIPPIN | Raydium |
| 12 | BIRB | Raydium |
| 13 | BAN | Raydium |
| 14 | MEW | Raydium |
| 15 | USELESS | PumpSwap |

Oracle must cover: Raydium, Meteora, PumpSwap, pump.fun bonding curve
(for fresh new markets via /markets/create).

Mint addresses + exact pool addresses to be populated in
`config/seed-tokens.json` when the seed script is written (task #21).
Verify each mint on solscan by hand before going live — a typo = dead market.

## Devnet strategy

Devnet tests run against 2-3 synthetic tokens for protocol correctness only.
Real top memes don't exist on devnet. The 15-market seed happens ONLY on
mainnet at Phase 2 unlock.

## Naming convention

| Surface | Value |
|---|---|
| Domain | percolatorpump.fun |
| GitHub | xiaohkk/percolatorpump |
| Frontend brand | "percolatorpump" |
| Local repo dir | percpad/ (kept short for typing) |
| Program crate | percolator-program |
| Program ID | `hhjXnj81pWwrUwVLAEojFFK9mPR2DSCUV3QiFXfperc` (ground, not yet deployed) |

## Writing style preferences

- No em dashes anywhere (user preference, memory)
- Code comments: only when the "why" is non-obvious, never the "what"
- Commit messages: small, specific, lowercase type prefix

## Critical path

Done:
```
#9  InitializeEngine   #15 Oracle adapter        #21 seed script
#10 Deposit            #16 Keeper bot            #24 /markets/create
#11 Withdraw           #19 /perp/[mint]          #25 landing rewrite
#12 PlaceOrder         #20 /markets+/portfolio   #6  Launcher E2E tests
#13 Liquidate          #23 CreateMarket paid     #17 Devnet deploy (minus smoke)
#14 Crank
```

Remaining:
```
#17 devnet smoke test (punted — deferred to frontend-driven validation)
#18 Security self-review → gate before mainnet
#22 VPS deploy (standalone, unblocked)
#7  Mainnet launcher cutover (standalone, unblocked)
```

## Conventions for executing a prompt

1. Read this file (STATE.md)
2. Open docs/PROMPTS.md, find the prompt by task number
3. Copy the prompt verbatim into a fresh Claude session
4. Do not add context outside what the prompt says
5. When the task reports completion, verify by the prompt's own "Run" + "Report" sections
6. Mark the task completed only after the reports confirm success

## One-time setup to run locally

```bash
# in percpad/
cp .env.example .env.local        # then fill in
pnpm install
pnpm grind --count 20             # seed vanity pool (needs Supabase)
pnpm dev                          # localhost:3000
```

## One-time setup for program work

```bash
# in percolator/
cargo check --workspace           # parent + program
cargo test -p percolator-program  # program tests
cargo-build-sbf --manifest-path program/Cargo.toml  # BPF binary
```
