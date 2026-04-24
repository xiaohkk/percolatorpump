/**
 * Percolator client SDK — barrel export.
 *
 * Usage:
 *
 *   import {
 *     createSlabIx, depositIx, placeOrderIx,
 *     decodeSlabHeader, decodeEngineSnapshot,
 *     PROGRAM_ID, IS_STUB_PROGRAM, findVaultPda,
 *   } from "@/lib/percolator";
 *
 * The same module works pre-deploy (stub program ID; instructions still
 * build correctly, just can't be sent) and post-deploy (real ID from
 * `NEXT_PUBLIC_PERCOLATOR_PROGRAM_ID`). Components that need to render a
 * "not deployed" banner pre-cutover should check `IS_STUB_PROGRAM`.
 */

export * from "./program-id";
export * from "./instructions";
export * from "./state";
export * from "./engine-layout";
export { Writer, Reader } from "./borsh";
