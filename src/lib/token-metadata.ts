/**
 * Metaplex Token Metadata PDA reader.
 *
 * Derives the metadata PDA for a mint, fetches the raw account, and decodes
 * the on-chain struct (name / symbol / uri) without adding a metaplex
 * dependency. Layout reference:
 *   https://developers.metaplex.com/token-metadata/accounts#the-metadata-account
 *
 * Relevant prefix:
 *   key:              u8   (1)
 *   update_authority: PK   (32)
 *   mint:             PK   (32)
 *   name:             str  (4 + 32)
 *   symbol:           str  (4 + 10)
 *   uri:              str  (4 + 200)
 *
 * Strings are length-prefixed Borsh strings; the stored bytes are padded
 * with \0 up to the max length, so we trim them after decode.
 */

import { Connection, PublicKey } from "@solana/web3.js";

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export interface OnChainTokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
}

export interface OffChainTokenMetadata {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
}

export interface ResolvedTokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  image: string | null;
  description: string | null;
}

export function findMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      TOKEN_METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

/** Pull a Borsh length-prefixed UTF-8 string starting at `offset`. */
function readBorshString(
  buf: Buffer,
  offset: number
): { value: string; next: number } {
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + len;
  const raw = buf.slice(start, end).toString("utf8");
  // On-chain strings are null-padded to their max length; trim them.
  const trimmed = raw.replace(/\u0000+$/g, "").trim();
  return { value: trimmed, next: end };
}

export function decodeMetadataAccount(
  data: Buffer,
  mint: PublicKey
): OnChainTokenMetadata {
  // Skip: key (1) + update_authority (32) + mint (32)
  let offset = 1 + 32 + 32;

  const name = readBorshString(data, offset);
  offset = name.next;

  const symbol = readBorshString(data, offset);
  offset = symbol.next;

  const uri = readBorshString(data, offset);

  return {
    mint: mint.toBase58(),
    name: name.value,
    symbol: symbol.value,
    uri: uri.value,
  };
}

export async function fetchOnChainMetadata(
  connection: Connection,
  mint: PublicKey
): Promise<OnChainTokenMetadata | null> {
  const pda = findMetadataPda(mint);
  const info = await connection.getAccountInfo(pda, "confirmed");
  if (!info || !info.data || info.data.length === 0) return null;
  try {
    return decodeMetadataAccount(
      Buffer.isBuffer(info.data) ? info.data : Buffer.from(info.data),
      mint
    );
  } catch {
    return null;
  }
}

/**
 * Fetch the off-chain JSON the `uri` field points at. Pump.fun metadata
 * URIs resolve to IPFS JSON of shape `{ name, symbol, description, image }`.
 */
export async function fetchOffChainMetadata(
  uri: string,
  signal?: AbortSignal
): Promise<OffChainTokenMetadata | null> {
  if (!uri) return null;
  try {
    const res = await fetch(uri, { signal, cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as OffChainTokenMetadata;
    return json;
  } catch {
    return null;
  }
}

/**
 * Convenience: fetch + merge on-chain and off-chain token metadata. Returns
 * `null` if the on-chain PDA isn't present yet (token too fresh).
 */
export async function resolveTokenMetadata(
  connection: Connection,
  mint: PublicKey
): Promise<ResolvedTokenMetadata | null> {
  const onChain = await fetchOnChainMetadata(connection, mint);
  if (!onChain) return null;
  const offChain = await fetchOffChainMetadata(onChain.uri);
  return {
    mint: onChain.mint,
    name: offChain?.name || onChain.name,
    symbol: offChain?.symbol || onChain.symbol,
    uri: onChain.uri,
    image: offChain?.image || null,
    description: offChain?.description || null,
  };
}
