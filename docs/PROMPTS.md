# Prompts — Master Index

Every prompt needed to finish the project. Read `docs/STATE.md` first for
context, then pick a task. Each prompt is self-contained: copy-paste into
a fresh Claude session.

## Index

### Phase 1 (launcher)
- [#6 — Launcher E2E tests](#task-6--launcher-e2e-tests)
- [#7 — Mainnet launcher cutover](#task-7--mainnet-launcher-cutover)
- [#22 — VPS production deploy](#task-22--vps-production-deploy)

### Phase 2 protocol (Rust)
- [#9 — InitializeEngine instruction](#task-9--initializeengine-instruction)
- [#10 — Deposit instruction](#task-10--deposit-instruction)
- [#11 — Withdraw instruction](#task-11--withdraw-instruction)
- [#12 — PlaceOrder instruction](#task-12--placeorder-instruction)
- [#13 — Liquidate instruction](#task-13--liquidate-instruction)
- [#14 — Crank instruction](#task-14--crank-instruction)
- [#15 — Oracle adapter program](#task-15--oracle-adapter-program)
- [#16 — Keeper bot](#task-16--keeper-bot)
- [#17 — Grind program ID + devnet deploy](#task-17--grind-program-id--devnet-deploy)
- [#18 — Security self-review](#task-18--security-self-review)
- [#23 — CreateMarket (paid listing)](#task-23--createmarket-paid-listing-instruction)

### Phase 2 frontend (Next.js)
- [#19 — /perp/[mint] market page](#task-19--perpmint-market-page)
- [#20 — /portfolio + /markets discover](#task-20--portfolio--markets-discover)
- [#21 — Seed top memes script + unlock flow](#task-21--seed-top-memes-script--unlock-flow)
- [#24 — /markets/create (paid listing UI)](#task-24--marketscreate-paid-listing-ui)
- [#25 — Landing page rewrite for Approach D](#task-25--landing-page-rewrite-for-approach-d)

---

## Task #6 — Launcher E2E tests

```
Expand the Phase 1 launcher test suite to cover grinder, PumpPortal client,
and a real devnet launch end-to-end.

Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percpad

Read docs/STATE.md before starting.

Current coverage:
- vitest unit tests at src/lib/__tests__/vanity-pool.test.ts (4 tests)
- Playwright spec at e2e/landing.spec.ts (3 tests)

Add unit tests (vitest):
  src/lib/__tests__/pumpportal.test.ts
    - bps-to-percent conversion
    - composeLaunchTx returns feeTx with correct amount + correct payer
    - postTradeLocal throws on non-200 with response body included in error
    - buildCreateTx partial-signs with the mint keypair (mock fetch response)
    - buildBuyTx / buildSellTx wire the correct denominatedInSol strings

  src/lib/__tests__/grinder.test.ts
    - suffix match: case-insensitive, correct on random strings
    - insertKeypair + popVanityKeypair roundtrip (mock Supabase client)

Add Playwright e2e tests (against dev server on localhost:3000):
  e2e/launch-flow.spec.ts
    - form validation: empty name rejected, ticker >10 chars truncated
    - image upload: wrong mime type blocked, too-large file blocked
    - submit without wallet: Launch button disabled
    - with a stubbed wallet + stubbed /api/launch: clicking Launch hits
      POST with the right body and redirects on success

  e2e/share-page.spec.ts
    - /t/[mint] for a known devnet mint renders name/ticker/image skeleton
    - OG meta tags present in the HTML
    - copy-mint-button copies to clipboard

Add devnet smoke script (tool, not test):
  scripts/smoke-devnet-launch.ts
    - Requires ~/.config/solana/id.json with devnet SOL
    - Grinds one perc keypair inline
    - Calls composeLaunchTx with test metadata
    - Signs both feeTx + launchTx locally
    - Submits to devnet
    - Asserts the mint appeared on-chain
    - Appends mint + sigs to DEVNET_LAUNCHES.md

Install Playwright browsers if not done:
  npx playwright install chromium

Run:
  pnpm test
  pnpm test:e2e
  pnpm tsx scripts/smoke-devnet-launch.ts

Report:
- Test counts per file
- Any pre-existing tests that started failing and why
- Output of the devnet smoke run (mint + sigs)
```

---

## Task #7 — Mainnet launcher cutover

```
Flip the launcher from devnet to mainnet, preserving all working flows.

Depends on: #22 (VPS deployed), production Supabase, mainnet treasury wallet
(hardware-wallet backed).

Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percpad
             + remote VPS.

Read docs/STATE.md before starting.

Steps:
1. Production Supabase project
   - Create fresh project at supabase.com (separate from dev)
   - Apply migrations: 0001_vanity_pool.sql + 0002_launch_images_bucket.sql
   - Copy NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY

2. Mainnet treasury
   - USE A HARDWARE WALLET OR PHANTOM-BACKED KEYPAIR. Never the dev keypair.
   - Record pubkey (only pubkey) in .env.production as TREASURY_WALLET
   - Document which wallet you're using in docs/OPERATIONS.md

3. Fresh encryption key for prod
   - node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   - Store in .env.production AND in your password manager. Losing this
     bricks the production vanity pool.

4. Mainnet RPC (Helius paid tier recommended)
   - NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
   - NEXT_PUBLIC_NETWORK=mainnet-beta

5. Seed prod vanity pool
   - SSH into VPS. tmux. `pnpm grind --count 100`
   - Expect 2-4 hours. Aim for 50+ before first mainnet launch.

6. Deploy the code
   - git pull + pnpm install --prod --frozen-lockfile + pnpm build
   - systemctl restart percolatorpump
   - curl https://percolatorpump.fun/ -> 200
   - curl https://percolatorpump.fun/api/treasury/balance -> valid JSON

7. First mainnet self-test launch
   - Connect Phantom on mainnet
   - Launch "Percolator Test 001" with 0.01 SOL initial buy
   - Total cost: ~0.1 SOL
   - Confirm: mint appears on pump.fun, ends in "perc", /t/{mint} renders,
     treasury got 0.03 SOL, counter ticked up

8. Rollback plan if broken
   - systemctl stop percolatorpump
   - Revert .env.production to devnet values
   - systemctl start
   - Diagnose before re-cutover

Tests:
  - curl smoke tests for /, /launch, /api/treasury/balance
  - SSL cert validity
  - Two-browser launch test
  - Simulate PumpPortal 503: block outbound briefly, /api/launch returns
    clear error not a 500 stack trace

Report:
- .env.production checklist (pubkeys only)
- First launch cost + mint address
- 24h treasury balance after live traffic
- Bugs found
```

---

## Task #9 — InitializeEngine instruction

```
Implement the InitializeEngine instruction in the Percolator program.

Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percolator
Read docs/STATE.md in the percpad repo for full context.

Context:
- program/src/processor.rs returns NotImplemented for every variant except CreateSlab.
- CreateSlab zero-fills the engine region after a 104-byte SlabHeader.
- The parent crate (src/percolator.rs) exposes a RiskEngine constructor.
  Look for `new_in_place`, `init`, or `reset` that accepts `&mut RiskEngine`.

Requirements:
- Add `InitializeEngine { risk_params: RiskParams }` to PercolatorInstruction.
  Re-export or mirror RiskParams from the parent crate.
- Accounts: [writable] slab, [signer] creator (matches SlabHeader.creator).
- Idempotency: add an `initialized: u8` field to SlabHeader (or reuse _pad).
  Reject if already initialized with AlreadyInitialized error.
- Call the parent's in-place initializer against the engine region.
- Update SlabHeader.initialized = 1.
- msg!("InitializeEngine: slab={}, mark_price=..., funding_cap=...")

Tests:
Unit (program/src/instruction.rs):
  - Borsh roundtrip for InitializeEngine with RiskParams present

Integration (program/tests/initialize_engine.rs):
  - happy_path: CreateSlab then InitializeEngine, assert engine is populated
  - double_init_rejected: second call returns AlreadyInitialized
  - wrong_signer_rejected: non-creator signer
  - uninitialized_slab_rejected: InitializeEngine without prior CreateSlab
  - invalid_risk_params_rejected: funding_cap=0 or leverage=0

Run:
  cargo test -p percolator-program --lib
  cargo test -p percolator-program --test initialize_engine

Report: constructor used, RiskParams fields exposed, test results.
```

---

## Task #10 — Deposit instruction

```
Implement the Deposit instruction.

Depends on: #9.
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percolator
Read docs/STATE.md.

Requirements:
- Add `Deposit { amount: u64 }` to PercolatorInstruction.
- Accounts:
  0. [writable] slab
  1. [signer] user
  2. [writable] user_token_account (source ATA for the mint)
  3. [writable] vault_token_account (PDA ["vault", slab.pubkey])
  4. [] mint (must match SlabHeader.mint)
  5. [] token_program
  6. [] system_program

- Add vault_bump to SlabHeader (update CreateSlab to derive + store it)
- Validate: slab initialized, mint matches, ATA mint + owner correct,
  vault PDA correct with stored bump
- Engine call: find_or_create_account by owner pubkey. New slot: check
  num_used_accounts < MAX_ACCOUNTS, claim bitmap. Increment
  account.capital, engine.C_tot, engine.V.
- CPI: SPL token transfer user -> vault for amount
- amount = 0 rejected; wide_math guards overflow

Tests (program/tests/deposit.rs):
  - fresh_deposit: new user, new slot, capital = amount
  - repeat_deposit: same user, capital grows
  - zero_amount_rejected
  - wrong_mint_rejected
  - slab_full_rejected: pre-fill MAX_ACCOUNTS-1, fresh user rejected
  - vault_pda_mismatch_rejected
  - uninitialized_engine_rejected
  - user_token_account_wrong_owner_rejected

Run:
  cargo test -p percolator-program --test deposit

Report: confirm engine capital accounting matches vault token balance per scenario.
```

---

## Task #11 — Withdraw instruction

```
Implement the Withdraw instruction.

Depends on: #10.
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percolator
Read docs/STATE.md.

Requirements:
- Add `Withdraw { amount: u64 }` to PercolatorInstruction.
- Accounts: same as Deposit, reversed transfer.
- Engine call order (critical):
    1. Accrue market to current slot (funding updates)
    2. Settle account's lazy A/K (apply pnl_delta)
    3. Mature reserved_pnl based on warmup
    4. Compute h from Residual / PNL_matured_pos_tot
    5. withdrawable = capital + floor(max(pnl, 0) - R) * h
    6. Reject if amount > withdrawable
    7. Decrement capital first, then profit
    8. Decrement engine V, C_tot accordingly
- CPI: vault -> user, signed by slab PDA

Tests (program/tests/withdraw.rs):
  - flat_account_full_withdraw: deposited 1M, no position, withdraw 1M
  - profit_withdraw_with_h_equals_1: healthy, full profit
  - profit_withdraw_with_h_below_1: inject deficit, verify haircut
  - warmup_not_passed_rejected: fresh profit still in R_i
  - over_withdraw_rejected
  - capital_is_senior: h=0, capital still fully withdrawable
  - settle_lazy_before_check: stale K snapshot, withdraw triggers settle
  - partial_withdraw_leaves_valid_state

Run:
  cargo test -p percolator-program --test withdraw

Report: exact h calculation used, trace one test case's numbers.
```

---

## Task #12 — PlaceOrder instruction

```
Implement the PlaceOrder instruction.

Depends on: #10.
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percolator
Read docs/STATE.md.

Requirements:
- Add `PlaceOrder { side: Side, size: u64, max_price: u64, min_price: u64 }`.
- Accounts: [writable] slab, [signer] user, [] oracle_account, [] clock_sysvar.
- Oracle: read u64 mark price from bytes 0..8 of oracle_account (tmp before #15).
- Engine flow:
    1. Accrue market to current slot
    2. Settle account lazily
    3. Check SideMode: reject with DrainOnly for DRAIN_ONLY or RESET_PENDING
    4. Compute new position (open/add/reduce/flip)
    5. Margin check: required = |new_notional| / max_leverage
    6. Reject if capital + effective_pnl < required
    7. Slippage guard vs oracle
    8. Update basis, A_side, K_side (use parent's place_order_internal)

Tests (program/tests/place_order.rs):
  - open_long_ok
  - open_short_ok
  - close_long_at_profit
  - close_short_at_loss
  - flip_long_to_short_single_tx
  - over_leverage_rejected
  - insufficient_margin_rejected
  - zero_size_rejected
  - drain_only_blocks_open (use test helper to force state)
  - drain_only_allows_close
  - price_slippage_rejected
  - stale_oracle_rejected
  - A_precision_floor_triggers_drain_only
  - reset_pending_blocks_new_but_allows_settle

Run:
  cargo test -p percolator-program --test place_order

Report: trace one long-open (basis_i, A_long, K_long, OI_long) before/after +
one DrainOnly trigger trace.
```

---

## Task #13 — Liquidate instruction

```
Implement the Liquidate instruction.

Depends on: #12.
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percolator
Read docs/STATE.md.

Requirements:
- Add `Liquidate { victim_slot: u16 }`.
- Accounts: [writable] slab, [signer] liquidator (any wallet, permissionless),
  [writable] liquidator_token_account, [] oracle_account, [] clock_sysvar,
  [writable] vault_token_account, [] token_program.
- Flow:
    1. Accrue + settle victim lazily
    2. Compute equity = capital + effective_pnl
       Reject if equity >= maintenance_margin (healthy)
    3. Call parent's liquidate_at_oracle_internal:
       - closes position
       - emits deficit into K_opposite socialization
       - k-overflow fallback to h
    4. Deduct victim's capital to zero (or minus bounty)
    5. Bounty = min(LIQ_BOUNTY_BPS * orig_capital / 10000, cap)
       Transfer vault -> liquidator via PDA signer
    6. Check side-mode triggers (A floor, etc.)

Tests (program/tests/liquidate.rs):
  - healthy_account_cannot_be_liquidated
  - underwater_long_liquidated_socializes_to_shorts
  - underwater_short_liquidated_socializes_to_longs
  - partial_liq_not_supported (full close only)
  - liquidator_bounty_paid
  - bankrupt_account_with_zero_capital_still_clears_position
  - k_overflow_fallback_triggers_haircut: invariant V >= C_tot + I + effective_pnl holds
  - drain_only_triggered_by_liquidation

Run:
  cargo test -p percolator-program --test liquidate

Report: trace one bankrupt-long with K_short before/after, deficit-per-unit,
validation sum_of_effective_pnl_deltas ≈ deficit ± MAX_ROUNDING_SLACK.
```

---

## Task #14 — Crank instruction

```
Implement the Crank instruction (dispatcher over funding, GC, ADL-reset).

Depends on: #13.
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percolator
Read docs/STATE.md.

Requirements:
- Add `Crank { kind: CrankKind }` with CrankKind = Funding | Gc | AdlReset.
- Accounts: [writable] slab, [signer] caller, [] clock_sysvar,
  [writable] caller_token_account, [writable] vault_token_account,
  [] token_program.
- Funding: call accrue_market_to(current_slot). Bounty if accrued, else
  Err::NothingToDo.
- Gc: gc_crank with GC_CLOSE_BUDGET=32. Bounty scales with closures.
- AdlReset: advance state machine:
    - RESET_PENDING + all stale settled → NORMAL
    - DRAIN_ONLY + OI_side == 0 → snapshot K, increment epoch, A=1, → RESET_PENDING
  Respect LIQ_BUDGET_PER_CRANK=64 per call.

Tests (program/tests/crank.rs):
  - funding_crank_happy_path
  - funding_no_op_returns_error
  - gc_closes_stale_accounts
  - gc_budget_respected (32/call)
  - adl_drain_only_transition
  - adl_reset_pending_transition (A=1, K snapshotted)
  - adl_normal_restore
  - bounty_paid_only_when_work_done
  - concurrent_cranks_same_slot_idempotent

Run:
  cargo test -p percolator-program --test crank

Report: full state-machine trace NORMAL → DRAIN_ONLY → RESET_PENDING → NORMAL
with A/K/OI values at each step.
```

---

## Task #15 — Oracle adapter program

```
Build the on-chain oracle adapter program with 4 sources.

Target: /Users/jefferson/Desktop/quarter-two-earning-M/percolator/oracle/
(new workspace member).
Read docs/STATE.md.

Requirements:
- Four source kinds per feed, gated by source_kind: u8 in feed account:
    0 = PUMP_BONDING:  pump.fun bonding curve (virtual_sol_reserves @ 0x08,
                       virtual_token_reserves @ 0x10)
    1 = PUMPSWAP:      PumpSwap AMM pool (reserves + 30-sample ring buffer median)
    2 = RAYDIUM_CPMM:  Raydium CP pool (base_reserve, quote_reserve)
    3 = METEORA_DLMM:  Meteora DLMM (active_bin_id + bin_step)

- Instructions:
    InitializeFeed { mint, source_account, source_kind }
    Update (permissionless; reads source, writes price into feed)
    Graduate (permissionless; bonding curve 'complete' flag flipped → graduated=true)
    ConvertSource { new_kind } (migrate feed post-graduation)

- Feed account layout:
    { mint: Pubkey, source: Pubkey, source_kind: u8, graduated: bool,
      last_update_slot: u64, price_lamports_per_token: u64,
      ring_buffer: [u64; 30], ring_idx: u8 }

- Percolator consumers reject feeds where last_update_slot > STALE_SLOTS (150).

- InitializeFeed validates source account exists + has non-zero reserves.

Tests (oracle/tests/):
  - initialize_feed + stale_source_rejected
  - update_pumpbonding_reads_reserves
  - update_pumpswap_reads_reserves_and_appends_ring
  - update_raydium_reads_reserves
  - update_meteora_reads_active_bin
  - graduate_requires_complete_flag
  - graduate_once_only
  - convert_source_pump_bonding_to_pumpswap
  - convert_source_rejected_without_graduation
  - ring_buffer_wraps_correctly
  - median_within_expected_bounds

Run:
  cargo test -p percolator-oracle

Report: exact byte offsets per source, median math, 1 sample price calc per source.
```

---

## Task #16 — Keeper bot

```
Build a permissionless incentivized keeper bot.

Depends on: #13, #14, #15.
Target: /Users/jefferson/Desktop/quarter-two-earning-M/percolator/keeper/
(new workspace member).
Read docs/STATE.md.

Requirements:
- Rust async binary, tokio runtime.
- Inputs: RPC URL, keeper keypair, slabs to watch (or discover via
  getProgramAccounts).
- Main loop (every 3s):
    1. Refresh stale oracle feeds (Oracle.Update)
    2. Per slab:
       a. Compute every account's equity with last-settled state + oracle
       b. equity < maintenance_margin → Liquidate
       c. funding not accrued in M slots → Crank { Funding }
       d. side in state-transition-available → Crank { AdlReset }
       e. bitmap has stale zeros → Crank { Gc }
- Bounty tracking: log SOL earned per instruction type. Refuse to submit if
  estimated fee > estimated bounty.
- Metrics: prometheus-style counters on :9100.

Tests (keeper/tests/):
  - integration_liquidates_underwater_account (ProgramTest harness)
  - integration_skips_healthy_account
  - integration_bounty_threshold_respected
  - integration_two_keepers_no_double_claim

Run:
  cargo test -p percolator-keeper
  cargo run --bin keeper -- --config keeper.toml

Report: on-chain calls made, avg tick latency, fee estimate vs bounty estimate.
```

---

## Task #17 — Grind program ID + devnet deploy

```
Grind a vanity program ID ending in ...perc, deploy percolator-program to devnet.

Depends on: #14 (program feature-complete enough to deploy).
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percolator
Read docs/STATE.md.

Requirements:
1. Grind a keypair:
   solana-keygen grind --ends-with perc:1 --num-threads 8
   → file like percolator-program-…perc.json
   Save to .keys/ (add to .gitignore)
2. Build:
   cargo-build-sbf --manifest-path program/Cargo.toml
3. Deploy:
   solana program deploy target/deploy/percolator_program.so \
     --program-id .keys/percolator-program-perc.json \
     --url https://api.devnet.solana.com \
     --keypair ~/.config/solana/id.json
4. Fund deploy wallet via airdrop or faucet (5 SOL devnet).
5. Save PROGRAM_ID in program/PROGRAM_ID.txt + update percpad/.env.local
   as NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID.
6. Smoke test: scripts/devnet-smoke.ts calls CreateSlab + InitializeEngine +
   Deposit, asserts on-chain state.
7. Write program/DEPLOY.md: command, .so path, rent deposit, how to upgrade,
   how to revoke upgrade authority for mainnet.

Tests:
  - scripts/devnet-smoke.ts succeeds end-to-end
  - Assert PROGRAM_ID base58 ends in "perc"

Run:
  solana program show <PROGRAM_ID> --url devnet

Report: PROGRAM_ID (ending ...perc), SOL spent, smoke tx sigs,
mainnet revoke-auth command.
```

---

## Task #18 — Security self-review

```
Security self-review + hardening of the Percolator program.

Depends on: #9-#14 and #23 implemented.
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percolator
Read docs/STATE.md.

Review every instruction handler against this checklist. Fix findings.

Checklist per instruction:
1. Signer verification
2. Owner verification (slab owned by our program, token accounts by SPL Token)
3. Mint match (token accounts' mint = SlabHeader.mint)
4. Writable flag correctness
5. PDA derivation (canonical bump, stored bump used consistently)
6. Arithmetic (checked_* or wide_math everywhere)
7. CPI ordering (mutate state AFTER CPI, not before)
8. Rent exemption preserved after realloc
9. Re-entrancy (SPL Token safe; no custom CPI)
10. Bitmap race (atomic + idempotent)
11. Stale oracle check (every price read)
12. Max leverage from RiskParams, not user input
13. Conservation invariant: V >= C_tot + I + sum(effective_pnl) (debug assert)
14. DrainOnly/ResetPending respected on new OI

Deliverables:
- program/SECURITY.md: threat model, trusted inputs, attacker capabilities,
  mitigations, known limits, external-audit focus areas
- Inline `// SECURITY:` comments on non-obvious checks
- Focused commits: "security: <fix>"

Tests:
  - wrong_signer_rejected per mutating instruction
  - wrong_owner_rejected per account
  - wrong_mint_rejected per token account
  - pda_wrong_bump_rejected
  - stale_oracle_rejected (PlaceOrder + Liquidate)
  - reentrancy_via_evil_token_program (stretch)

Report: 14 items × each instruction = PASS/FAIL/N-A matrix, list of fixes.
```

---

## Task #19 — /perp/[mint] market page

```
Build /perp/[mint] market detail page.

Depends on: #17 (program deployed), #15 (oracle).
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percpad
Read docs/STATE.md.

Route: /perp/[mint]

Layout (two-col desktop, stacked mobile):
- LEFT (2/3): Candle chart. Reuse percolator-meta's lightweight-charts
  setup from Desktop/400000dollars/percolator-meta/ChartCanvas pattern.
  1m candles from oracle ring buffer.
- RIGHT (1/3):
  * Order panel: Side toggle, size (token or USD), leverage 1-10x slider,
    slippage, Deposit button (if no capital), Place Order button (client
    margin check)
  * Position panel: entry / mark / matured PnL / warming PnL (with
    countdown) / haircut preview at current h / Close button

- HEADER indicators:
  * mark price, 24h % change
  * OI long / OI short
  * BIG h card (color-coded: green ≥0.95 / yellow 0.80-0.95 / red <0.80)
  * A/K state badge per side
  * insurance fund depth (in token)
  * funding rate next-accrual countdown

- FOOTER: live fill tape (ws)

Deliverables:
- src/app/perp/[mint]/page.tsx
- src/components/perp/{OrderPanel,PositionPanel,HaircutCard,ABKBadge,FillTape}.tsx
- src/lib/percolator-client.ts (account decoders + instruction builders)
- src/hooks/useMarket.ts (zustand-backed market state)

Tests (e2e/perp.spec.ts):
  - page loads for a known mint
  - leverage > cap rejected client-side
  - Place Order disabled with insufficient margin
  - Close button only with open position
  - h card colors at 0.99 / 0.85 / 0.75

Run:
  pnpm dev
  navigate to /perp/<devnet mint>

Report: screenshot-description (ASCII layout) + exact margin formula.
```

---

## Task #20 — /portfolio + /markets discover

```
Build /portfolio and /markets pages.

Depends on: #19 (percolator-client lib exists).
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percpad
Read docs/STATE.md.

/markets
- Table columns: ticker, mcap, 24h vol, OI, h, state badge, origin badge,
  graduated flag
- Origin badges:
    "SEED" (emerald) = we created at genesis
    "OPEN" (zinc) = paid listing
    "PERC" (pink) = Phase 1 launcher (vanity only)
  Read SlabHeader.origin byte.
- Sortable headers. Default sort by 24h volume.
- Filter: All / Seed only / Open only.
- Row click → /perp/[mint].
- Data: getProgramAccounts for slabs, parallel RPC per mint metadata + oracle.

/portfolio
- Wallet required.
- One card per market with non-zero account.capital.
- Each card: token icon + ticker + mint short + position (long/short, size)
  + capital + matured PnL + warming PnL + withdrawable post-h + Close +
  Withdraw quick buttons.
- Summary row: total deposited, total unrealized, aggregate effective PnL.

Tests (e2e/):
  - markets page loads, shows seed markets
  - sort by vol works
  - portfolio without wallet shows prompt
  - portfolio with wallet (stubbed fixture) loads positions

Deliverables:
- src/app/markets/page.tsx
- src/app/portfolio/page.tsx
- src/components/markets/MarketTable.tsx
- src/components/portfolio/PositionCard.tsx

Report: RPC call count per page load (target ≤ 3, batched).
```

---

## Task #21 — Seed top memes script + unlock flow

```
Write the Day-1 seed script and the treasury-unlock UI.

Depends on: #17 (program deployed), #15 (oracle supports Raydium + Meteora).
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percpad
Read docs/STATE.md.

Script: scripts/seed-top-memes.ts

Config: config/seed-tokens.json — ASK THE USER to confirm the 15 tokens and
verify mint+pool addresses by hand on solscan. Starting set from STATE.md:
TRUMP, PENGU, BONK, WIF, BOME, FARTCOIN, PNUT, MOODENG, MELANIA, POPCAT,
PIPPIN, BIRB, BAN, MEW, USELESS.

Schema:
[
  { "symbol": "WIF", "mint": "...", "oracle_source": "raydium", "pool": "...",
    "risk": { "max_leverage": 10, "maint_bps": 500, "funding_cap": 10000 } },
  ...
]

Script behavior:
1. Dry-run default: prints planned txs + total cost, sends nothing
2. --live sends
3. Per token, batches of 3, single tx per token:
     a. Check slab PDA exists. Skip if yes.
     b. SystemProgram.create_account (rent) + CreateSlab (admin, origin=0) +
        InitializeEngine
     c. Separate tx: Oracle.InitializeFeed with source + pool
4. Rate-limit 2 tx/s
5. Idempotency: re-runs skip completed markets
6. Summary: total SOL spent + slab pubkeys

Landing page unlock UI (edit src/components/treasury-counter.tsx + page.tsx):
- Threshold: 12.0 SOL
- Caption: "Mainnet Percolator deploy + seed 15 top memes unlocks at 12 SOL"
- At unlock: "DEPLOYING - seeding WIF, BONK, POPCAT, ..."
- Post-seed banner: "15 markets live. Trade now → /markets"
- Grid of 15 small ticker tiles below Phase 2 card (muted until unlock)

Tests:
- Dry run produces expected instruction list
- Idempotency: partial re-run skips completed
- Rate limiting: ≤ 2 tx/s
- e2e/seed.spec.ts on local validator: seed 3 markets, verify slabs exist

Deliverables:
- scripts/seed-top-memes.ts
- config/seed-tokens.json
- Updated treasury-counter.tsx + page.tsx
- Env flag NEXT_PUBLIC_PHASE_2_LIVE

Report: exact SOL cost, confirmed mint+pool pairs, devnet tx sigs.
```

---

## Task #22 — VPS production deploy

```
Deploy percolatorpump launcher to a VPS at percolatorpump.fun.

Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percpad
Read docs/STATE.md.

Ask the user for:
- VPS IP + SSH user
- Domain DNS manager creds
- Production Supabase URL + service key (separate from dev)
- Production RPC endpoint (Helius/Triton paid tier)
- Mainnet treasury pubkey (hardware-wallet-backed)

Server setup (Debian/Ubuntu assumed):
1. System: nginx or caddy, certbot, curl, ufw, fail2ban
2. Node via nvm (match local 23.x) + pnpm
3. Deploy user `perc` with sudo
4. git clone git@github.com:xiaohkk/percolatorpump.git → /opt/percolatorpump
5. pnpm install --prod --frozen-lockfile
6. pnpm build
7. .env.production (scp'd or pasted manually, NOT committed)
8. systemd unit percolatorpump.service running `pnpm start` on :3000
9. Reverse proxy (caddy for auto-SSL):
     percolatorpump.fun {
       reverse_proxy localhost:3000
     }
10. DNS: A record percolatorpump.fun → VPS IP
11. ufw: allow 22/80/443 only; fail2ban enabled

Tests:
  - curl https://percolatorpump.fun/ → 200
  - SSL cert valid
  - systemctl restart survives crash, comes back up
  - POST /api/launch with devnet wallet works end-to-end

Runbook at docs/OPERATIONS.md:
  - redeploy: git pull + pnpm build + systemctl restart
  - rotate encryption keys
  - refill vanity pool (ssh, tmux, pnpm grind)
  - read logs: journalctl -u percolatorpump -f

Report: SSL grade, backup of .env.production location, ops gaps.
```

---

## Task #23 — CreateMarket (paid listing) instruction

```
Add a permissionless paid CreateMarket instruction.

Depends on: #9 (InitializeEngine).
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percolator
Read docs/STATE.md.

Background:
- CreateSlab (already implemented) = admin path, no fee, origin=0. Used by
  the seed script (task #21).
- CreateMarket = permissionless, fee-paying path. Used by /markets/create.

Requirements:
- Add `CreateMarket` variant to PercolatorInstruction (no payload; fee and
  mint derivable from accounts).
- Accounts:
  0. [writable, signer] payer (becomes creator of record)
  1. [writable] slab_account (pre-allocated by client like CreateSlab)
  2. [] mint
  3. [] oracle_account
  4. [writable] treasury (must match TREASURY_PUBKEY const)
  5. [] system_program
  6. [] token_program

- Constants:
    MARKET_CREATION_FEE_LAMPORTS: u64 = 500_000_000  // 0.5 SOL
    TREASURY_PUBKEY: Pubkey = pubkey!("EM7mXeCaUvj4yJ6zmEtgDfrUUSiK2vuyiwvijNpayktn")
  (Dev treasury; mainnet TBD via env-derived const.)

- Flow:
  1. Validate slab_account preconditions (empty, owned by program)
  2. Validate treasury == TREASURY_PUBKEY
  3. CPI SystemProgram.transfer(payer → treasury, 0.5 SOL) — NATIVE SOL, not token
  4. Write SlabHeader with origin=1
  5. Add `origin: u8` field to SlabHeader (steal from _pad, keep LEN=104)
  6. msg!("CreateMarket: mint, payer, fee")

Tests (program/tests/create_market.rs):
  - happy_path: fee landed, origin=1
  - wrong_treasury_rejected
  - unallocated_slab_rejected
  - replay_rejected
  - mint_mismatch_rejected
  - slab_header_len_unchanged (asserts LEN still 104)

Run:
  cargo test -p percolator-program --lib
  cargo test -p percolator-program --test create_market

Report: SlabHeader layout before/after, treasury balance delta, CreateSlab
still works with origin=0.
```

---

## Task #24 — /markets/create (paid listing UI)

```
Build the "Add a market" page for hybrid pay-to-list.

Depends on: #23, #15, #17.
Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percpad
Read docs/STATE.md.

Route: /markets/create

User flow:
1. Wallet required
2. Paste SPL mint address
3. Backend resolves (debounced):
   - Metaplex metadata (name, ticker, image)
   - DEX pool detection order: pump.fun bonding curve → PumpSwap →
     Raydium → Meteora. First hit = source.
   - Existing slab check: if yes, show "already exists" + link to /perp/[mint]
4. Preview card:
   - Token info + image
   - DEX pool badge
   - Cost: 0.5 SOL fee + ~0.7 SOL rent ≈ 1.2 SOL total
   - Warning: "Permanent. Cannot be deleted."
5. Confirm:
   - Build single tx: SystemProgram.create_account (slab) + CreateMarket +
     InitializeEngine + Oracle.InitializeFeed (4 instructions ideally)
   - Wallet signs + sends
   - Redirect to /perp/{mint}

Endpoints:
- POST /api/markets/create → { txBase64, expectedCost, detectedSource, metadata }
- GET /api/markets/resolve?mint=... → { metadata, detectedSource, existingSlab }

Components:
- src/app/markets/create/page.tsx
- src/app/api/markets/create/route.ts
- src/app/api/markets/resolve/route.ts
- src/components/markets/PoolBadge.tsx
- src/lib/dex-resolver.ts

Also update:
- /markets (#20) origin badge already covers this
- /t/[mint]: replace "perp: queued" with "add perp market" CTA when Phase 2 live
  AND no slab exists for that mint

Tests (e2e/markets-create.spec.ts):
  - invalid mint inline error
  - mint with no DEX pool → "no trading pool"
  - existing slab → "already exists"
  - happy-path preview renders
  - confirm triggers signing prompt (stubbed)

Run:
  pnpm dev
  navigate to /markets/create

Report: DEX APIs used, /api/markets/resolve avg latency.
```

---

## Task #25 — Landing page rewrite for Approach D

```
Rewrite the landing for Seeded + Pay-to-List positioning.

Working dir: /Users/jefferson/Desktop/quarter-two-earning-M/percpad
Read docs/STATE.md.

Edit src/app/page.tsx:

1. Hero
   - Headline: "Leverage trading on the top Solana memes.\nThe memecoin is your collateral."
   - Sub: "Inverted perps powered by Toly's open-source Percolator risk engine.
          Seeded Day 1 with WIF, BONK, POPCAT, FARTCOIN, GOAT, and more."
   - CTAs: "Trade (soon)" (disabled until Phase 2 unlock) +
            "Launch a ...perc token on pump.fun" → /launch

2. TreasuryCounter props
   - threshold: 12.0 SOL (was 5)
   - caption: "Mainnet Percolator deploy + Day 1 seed of the top 15 Solana memes unlocks at 12 SOL."
   - sub: "Every ...perc launch adds 0.03 SOL. Every paid listing (post-deploy) adds 0.5 SOL."

3. Phase cards
   Phase 1 - Launcher (live now):
     - Launch a ...perc-suffix token on pump.fun (cosmetic vanity)
     - 0.03 SOL fee fuels Phase 2
     (DROP the "reserved perp slot" bullet)
   Phase 2 - Perps (unlocks at 12 SOL):
     - 15 top memes live Day 1: [ticker grid component]
     - 10x leveraged, collateralized in the token itself
     - Any mint not seeded can be added for 0.5 SOL

4. Seed token grid (new component SeedTokenGrid.tsx)
   - 15 small tiles, 5 wide × 3 tall
   - Each tile: ticker, faded until unlock
   - On unlock: tiles clickable → /perp/[mint]

5. Footer
   - Add "Add a market" link (routes to /markets/create once unlocked)

Tests:
  - Update e2e/landing.spec.ts for new copy
  - Verify "X.XX / 12.00 SOL" formatting
  - Seed grid renders 15 tiles (locked state)

Report: ASCII layout sketch of rebuilt landing.
```

---

## Appendix: repeated environment variables

Every prompt implicitly needs these to be set. Checking `.env.example` in
percpad or the in-chat .env.local template is the source of truth.

| Var | Who uses it | Example |
|---|---|---|
| NEXT_PUBLIC_RPC_URL | frontend + scripts | `https://api.devnet.solana.com` or Helius mainnet |
| NEXT_PUBLIC_NETWORK | frontend | `devnet` / `mainnet-beta` |
| NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID | frontend | TBD after task #17 |
| TREASURY_WALLET | server | dev: `EM7mX…ktn`; mainnet: TBD (hardware wallet pubkey) |
| NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY | server | per-env |
| VANITY_POOL_ENCRYPTION_KEY | server | hex 64 chars; prod must differ from dev |
| VANITY_POP_SECRET | server | random base64url |
| PUMPPORTAL_API_URL | server | `https://pumpportal.fun/api` |
| NEXT_PUBLIC_PHASE_2_LIVE | frontend | `true` after seed completes |
