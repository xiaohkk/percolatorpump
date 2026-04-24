/**
 * Byte offsets into the RiskEngine / Account structs.
 *
 * These mirror `#[repr(C)]` layouts in `percolator/src/percolator.rs`,
 * locked in by the Rust integration test
 *   `percolator/program/tests/engine_layout.rs`
 * which prints and asserts each offset via `core::mem::offset_of!`.
 *
 * When the Rust struct reorders a field, run:
 *
 *   cd percolator && cargo test -p percolator-program \
 *     --test engine_layout -- --nocapture
 *
 * and copy the printed numbers here.
 *
 * Caveat: host layout. Plain `u128`/`i128` fields are 16-byte aligned on
 * x86_64 with Rust ≥ 1.77, 8-byte on BPF. Current integration tests run
 * native via `processor!`, so the deployed bytes the frontend decodes
 * will match these host offsets. Revisit when task #17 deploys a real
 * BPF binary.
 */

/** Slab header length: 3 pubkeys + 4 bytes + 4 pad = 104. */
export const SLAB_HEADER_LEN = 104;

/** Offset at which the RiskEngine bytes start inside a slab account. */
export const ENGINE_OFFSET = SLAB_HEADER_LEN;

/** `size_of::<percolator::RiskEngine>()` under the `compact` feature (MAX_ACCOUNTS = 256). */
export const ENGINE_SIZE = 100_144;

/** `size_of::<percolator::Account>()`. */
export const ACCOUNT_STRIDE = 384;

/** Per-engine field offsets, relative to the start of the engine region. */
export const ENGINE_OFF = {
  vault: 0,
  insurance_balance: 16, // InsuranceFund { balance: U128 } at 16; balance is first field.
  c_tot: 368,
  pnl_pos_tot: 384,
  pnl_matured_pos_tot: 400,
  adl_mult_long: 432,
  adl_mult_short: 448,
  adl_coeff_long: 464,
  adl_coeff_short: 480,
  oi_eff_long_q: 544,
  oi_eff_short_q: 560,
  side_mode_long: 576,
  side_mode_short: 577,
  last_oracle_price: 672,
  num_used_accounts: 800,
  accounts: 1840,
} as const;

/** Per-account field offsets, relative to the start of an Account slot. */
export const ACCOUNT_OFF = {
  capital: 0,
  kind: 16,
  pnl: 32,
  reserved_pnl: 48,
  position_basis_q: 64,
  owner: 200,
} as const;

/** `SideMode` discriminants, mirroring `percolator::SideMode`. */
export const SIDE_MODE_NORMAL = 0;
export const SIDE_MODE_DRAIN_ONLY = 1;
export const SIDE_MODE_RESET_PENDING = 2;

export type SideModeCode =
  | typeof SIDE_MODE_NORMAL
  | typeof SIDE_MODE_DRAIN_ONLY
  | typeof SIDE_MODE_RESET_PENDING;

export function sideModeLabel(code: number): "normal" | "drain_only" | "reset_pending" | "unknown" {
  if (code === SIDE_MODE_NORMAL) return "normal";
  if (code === SIDE_MODE_DRAIN_ONLY) return "drain_only";
  if (code === SIDE_MODE_RESET_PENDING) return "reset_pending";
  return "unknown";
}
