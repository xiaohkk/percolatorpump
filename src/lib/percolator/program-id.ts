import { PublicKey } from "@solana/web3.js";

/**
 * Percolator program ID.
 *
 * Read from `NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID` at build time; falls back to a
 * stub pubkey so the UI compiles and renders while task #17 (grind + deploy)
 * is still in flight. The stub is the SystemProgram address — harmless, but
 * intentionally recognizable so a page that's trying to hit a real program
 * fails loud in dev rather than silent.
 *
 * Once #17 lands the PROGRAM_ID, set it in `.env.local`:
 *   NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID=<base58_ending_in_perc>
 */
const STUB_PROGRAM_ID = "11111111111111111111111111111111";

export const PROGRAM_ID: PublicKey = new PublicKey(
  process.env.NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID || STUB_PROGRAM_ID
);

/** `true` when running against the stub. Components can show a "not deployed" banner. */
export const IS_STUB_PROGRAM = PROGRAM_ID.toBase58() === STUB_PROGRAM_ID;

/** Canonical vault PDA seed. Matches `VAULT_SEED` in the Rust program. */
export const VAULT_SEED = Buffer.from("vault");

/** Protocol LP slot reserved in every slab. Matches the Rust constant. */
export const PROTOCOL_LP_SLOT = 0;

export function findVaultPda(
  slab: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, slab.toBuffer()],
    programId
  );
}
