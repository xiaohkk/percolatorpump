/**
 * Percolator instruction builders.
 *
 * Every builder returns a web3.js `TransactionInstruction` ready to go into
 * a `Transaction` or `VersionedTransaction`. Byte layouts mirror the Rust
 * `PercolatorInstruction::pack()` tag + Borsh body format exactly.
 *
 * Instruction tags (stable on-chain ABI):
 *   0 CreateSlab        6 InitializeEngine
 *   1 Deposit           7 BootstrapLp
 *   2 Withdraw          8 CreateMarket
 *   3 PlaceOrder
 *   4 Liquidate
 *   5 Crank
 */

import {
  AccountMeta,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PROGRAM_ID } from "./program-id";
import { Writer } from "./borsh";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type Side = "long" | "short";
export const SIDE_LONG = 0;
export const SIDE_SHORT = 1;

export type CrankKind = "funding" | "gc" | "adl_reset";
export const CRANK_FUNDING = 0;
export const CRANK_GC = 1;
export const CRANK_ADL_RESET = 2;

export interface RiskParams {
  maintenance_margin_bps: bigint | number;
  initial_margin_bps: bigint | number;
  trading_fee_bps: bigint | number;
  max_accounts: bigint | number;
  max_crank_staleness_slots: bigint | number;
  liquidation_fee_bps: bigint | number;
  liquidation_fee_cap: bigint;
  min_liquidation_abs: bigint;
  min_initial_deposit: bigint;
  min_nonzero_mm_req: bigint;
  min_nonzero_im_req: bigint;
  insurance_floor: bigint;
  h_min: bigint | number;
  h_max: bigint | number;
  resolve_price_deviation_bps: bigint | number;
  max_accrual_dt_slots: bigint | number;
  max_abs_funding_e9_per_slot: bigint | number;
  min_funding_lifetime_slots: bigint | number;
  max_active_positions_per_side: bigint | number;
}

// ---------------------------------------------------------------------------
// Instruction 0: CreateSlab
// ---------------------------------------------------------------------------

export interface CreateSlabArgs {
  bump: number;
  vault_bump: number;
}

export interface CreateSlabAccounts {
  payer: PublicKey;
  slab: PublicKey;
  mint: PublicKey;
  oracle: PublicKey;
}

export function createSlabIx(
  accounts: CreateSlabAccounts,
  args: CreateSlabArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const data = new Writer().u8(0).u8(args.bump).u8(args.vault_bump).toBuffer();
  const keys: AccountMeta[] = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.slab, isSigner: false, isWritable: true },
    { pubkey: accounts.mint, isSigner: false, isWritable: false },
    { pubkey: accounts.oracle, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId, keys, data });
}

// ---------------------------------------------------------------------------
// Instruction 1: Deposit
// ---------------------------------------------------------------------------

export interface DepositArgs {
  amount: bigint | number;
}

export interface DepositAccounts {
  slab: PublicKey;
  user: PublicKey;
  userTokenAccount: PublicKey;
  vaultTokenAccount: PublicKey;
  mint: PublicKey;
}

export function depositIx(
  accounts: DepositAccounts,
  args: DepositArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const data = new Writer().u8(1).u64(args.amount).toBuffer();
  const keys: AccountMeta[] = [
    { pubkey: accounts.slab, isSigner: false, isWritable: true },
    { pubkey: accounts.user, isSigner: true, isWritable: false },
    { pubkey: accounts.userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.vaultTokenAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.mint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId, keys, data });
}

// ---------------------------------------------------------------------------
// Instruction 2: Withdraw
// ---------------------------------------------------------------------------

export interface WithdrawArgs {
  amount: bigint | number;
}

export type WithdrawAccounts = DepositAccounts;

export function withdrawIx(
  accounts: WithdrawAccounts,
  args: WithdrawArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  // Accounts layout identical to Deposit; only the tag + amount differ.
  const data = new Writer().u8(2).u64(args.amount).toBuffer();
  const keys: AccountMeta[] = [
    { pubkey: accounts.slab, isSigner: false, isWritable: true },
    { pubkey: accounts.user, isSigner: true, isWritable: false },
    { pubkey: accounts.userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.vaultTokenAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.mint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId, keys, data });
}

// ---------------------------------------------------------------------------
// Instruction 3: PlaceOrder
// ---------------------------------------------------------------------------

export interface PlaceOrderArgs {
  side: Side;
  size: bigint | number;
  max_price: bigint | number;
  min_price: bigint | number;
}

export interface PlaceOrderAccounts {
  slab: PublicKey;
  user: PublicKey;
  oracle: PublicKey;
}

export function placeOrderIx(
  accounts: PlaceOrderAccounts,
  args: PlaceOrderArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const sideU8 = args.side === "long" ? SIDE_LONG : SIDE_SHORT;
  const data = new Writer()
    .u8(3)
    .u8(sideU8)
    .u64(args.size)
    .u64(args.max_price)
    .u64(args.min_price)
    .toBuffer();
  const keys: AccountMeta[] = [
    { pubkey: accounts.slab, isSigner: false, isWritable: true },
    { pubkey: accounts.user, isSigner: true, isWritable: false },
    { pubkey: accounts.oracle, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId, keys, data });
}

// ---------------------------------------------------------------------------
// Instruction 4: Liquidate
// ---------------------------------------------------------------------------

export interface LiquidateArgs {
  victim_slot: number;
}

export interface LiquidateAccounts {
  slab: PublicKey;
  liquidator: PublicKey;
  liquidatorTokenAccount: PublicKey;
  oracle: PublicKey;
  vaultTokenAccount: PublicKey;
}

export function liquidateIx(
  accounts: LiquidateAccounts,
  args: LiquidateArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const data = new Writer().u8(4).u16(args.victim_slot).toBuffer();
  const keys: AccountMeta[] = [
    { pubkey: accounts.slab, isSigner: false, isWritable: true },
    { pubkey: accounts.liquidator, isSigner: true, isWritable: false },
    { pubkey: accounts.liquidatorTokenAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.oracle, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: accounts.vaultTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId, keys, data });
}

// ---------------------------------------------------------------------------
// Instruction 5: Crank
// ---------------------------------------------------------------------------

export interface CrankArgs {
  kind: CrankKind;
}

export interface CrankAccounts {
  slab: PublicKey;
  caller: PublicKey;
  callerTokenAccount: PublicKey;
  vaultTokenAccount: PublicKey;
}

export function crankIx(
  accounts: CrankAccounts,
  args: CrankArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const kindU8 =
    args.kind === "funding"
      ? CRANK_FUNDING
      : args.kind === "gc"
      ? CRANK_GC
      : CRANK_ADL_RESET;
  const data = new Writer().u8(5).u8(kindU8).toBuffer();
  const keys: AccountMeta[] = [
    { pubkey: accounts.slab, isSigner: false, isWritable: true },
    { pubkey: accounts.caller, isSigner: true, isWritable: false },
    { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: accounts.callerTokenAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.vaultTokenAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId, keys, data });
}

// ---------------------------------------------------------------------------
// Instruction 6: InitializeEngine
// ---------------------------------------------------------------------------

export interface InitializeEngineArgs {
  risk_params: RiskParams;
  init_oracle_price: bigint | number;
}

export interface InitializeEngineAccounts {
  slab: PublicKey;
  creator: PublicKey;
}

function writeRiskParams(w: Writer, p: RiskParams): void {
  w.u64(p.maintenance_margin_bps);
  w.u64(p.initial_margin_bps);
  w.u64(p.trading_fee_bps);
  w.u64(p.max_accounts);
  w.u64(p.max_crank_staleness_slots);
  w.u64(p.liquidation_fee_bps);
  w.u128(p.liquidation_fee_cap);
  w.u128(p.min_liquidation_abs);
  w.u128(p.min_initial_deposit);
  w.u128(p.min_nonzero_mm_req);
  w.u128(p.min_nonzero_im_req);
  w.u128(p.insurance_floor);
  w.u64(p.h_min);
  w.u64(p.h_max);
  w.u64(p.resolve_price_deviation_bps);
  w.u64(p.max_accrual_dt_slots);
  w.u64(p.max_abs_funding_e9_per_slot);
  w.u64(p.min_funding_lifetime_slots);
  w.u64(p.max_active_positions_per_side);
}

export function initializeEngineIx(
  accounts: InitializeEngineAccounts,
  args: InitializeEngineArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const w = new Writer().u8(6);
  writeRiskParams(w, args.risk_params);
  w.u64(args.init_oracle_price);
  const data = w.toBuffer();
  const keys: AccountMeta[] = [
    { pubkey: accounts.slab, isSigner: false, isWritable: true },
    { pubkey: accounts.creator, isSigner: true, isWritable: false },
  ];
  return new TransactionInstruction({ programId, keys, data });
}

// ---------------------------------------------------------------------------
// Instruction 7: BootstrapLp
// ---------------------------------------------------------------------------

export interface BootstrapLpArgs {
  amount: bigint | number;
}

export interface BootstrapLpAccounts {
  slab: PublicKey;
  creator: PublicKey;
  creatorTokenAccount: PublicKey;
  vaultTokenAccount: PublicKey;
  mint: PublicKey;
}

export function bootstrapLpIx(
  accounts: BootstrapLpAccounts,
  args: BootstrapLpArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const data = new Writer().u8(7).u64(args.amount).toBuffer();
  const keys: AccountMeta[] = [
    { pubkey: accounts.slab, isSigner: false, isWritable: true },
    { pubkey: accounts.creator, isSigner: true, isWritable: false },
    { pubkey: accounts.creatorTokenAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.vaultTokenAccount, isSigner: false, isWritable: true },
    { pubkey: accounts.mint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId, keys, data });
}

// ---------------------------------------------------------------------------
// Instruction 8: CreateMarket (paid listing, task #23 v2)
// ---------------------------------------------------------------------------

export interface CreateMarketArgs {
  vault_bump: number;
  fee_lamports: bigint | number;
}

export interface CreateMarketAccounts {
  payer: PublicKey;
  slab: PublicKey;
  mint: PublicKey;
  oracle: PublicKey;
  treasury: PublicKey;
}

export function createMarketIx(
  accounts: CreateMarketAccounts,
  args: CreateMarketArgs,
  programId: PublicKey = PROGRAM_ID
): TransactionInstruction {
  const data = new Writer()
    .u8(8)
    .u8(args.vault_bump)
    .u64(args.fee_lamports)
    .toBuffer();
  const keys: AccountMeta[] = [
    { pubkey: accounts.payer, isSigner: true, isWritable: true },
    { pubkey: accounts.slab, isSigner: false, isWritable: true },
    { pubkey: accounts.mint, isSigner: false, isWritable: false },
    { pubkey: accounts.oracle, isSigner: false, isWritable: false },
    { pubkey: accounts.treasury, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({ programId, keys, data });
}
