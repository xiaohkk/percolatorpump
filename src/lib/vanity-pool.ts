import crypto from "crypto";
import { Keypair } from "@solana/web3.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const ALGORITHM = "aes-256-gcm";
const TABLE = "vanity_pool";

// -----------------------------------------------------------------------------
// Pure helpers (unit-tested directly; do not touch Supabase)
// -----------------------------------------------------------------------------

/**
 * Case-insensitive base58 suffix match.
 */
export function suffixMatches(pubkeyBase58: string, suffix: string): boolean {
  return pubkeyBase58.toLowerCase().endsWith(suffix.toLowerCase());
}

/**
 * Load the 32-byte AES key from env. Accepts either a 64-char hex string or a
 * base64-encoded 32-byte value.
 */
export function getEncryptionKey(): Buffer {
  const raw = process.env.VANITY_POOL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("VANITY_POOL_ENCRYPTION_KEY is not set");
  }

  // Hex (64 chars, all hex)
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  // Base64 -> 32 bytes
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  } catch {
    // fall through
  }

  throw new Error(
    "VANITY_POOL_ENCRYPTION_KEY must be 32 bytes as hex (64 chars) or base64"
  );
}

export interface EncryptedPayload {
  encryptedSecret: Buffer;
  nonce: Buffer; // iv
  authTag: Buffer;
}

export function encryptSecret(secretKey: Uint8Array): EncryptedPayload {
  const key = getEncryptionKey();
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  const encryptedSecret = Buffer.concat([
    cipher.update(Buffer.from(secretKey)),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return { encryptedSecret, nonce, authTag };
}

export function decryptSecret(payload: {
  encryptedSecret: Buffer | Uint8Array;
  nonce: Buffer | Uint8Array;
  authTag: Buffer | Uint8Array;
}): Uint8Array {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(payload.nonce)
  );
  decipher.setAuthTag(Buffer.from(payload.authTag));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedSecret)),
    decipher.final(),
  ]);
  return new Uint8Array(decrypted);
}

// -----------------------------------------------------------------------------
// Supabase-backed pool
// -----------------------------------------------------------------------------

let _client: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set"
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export interface PoppedKeypair {
  publicKey: string;
  encryptedSecret: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}

/**
 * Atomically claim an unclaimed row with the given suffix via an RPC that
 * wraps `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *`.
 * Returns null if the pool is empty for this suffix.
 */
export async function popVanityKeypair(
  suffix = "perc"
): Promise<PoppedKeypair | null> {
  const db = getServiceClient();
  const { data, error } = await db.rpc("pop_vanity_keypair", {
    p_suffix: suffix,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    publicKey: row.pubkey,
    encryptedSecret: toBuffer(row.encrypted_secret),
    nonce: toBuffer(row.iv),
    authTag: toBuffer(row.auth_tag),
  };
}

export async function poolSize(suffix = "perc"): Promise<number> {
  const db = getServiceClient();
  const { count, error } = await db
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("suffix", suffix)
    .is("claimed_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function insertKeypair(
  kp: Keypair,
  suffix = "perc"
): Promise<void> {
  const db = getServiceClient();
  const { encryptedSecret, nonce, authTag } = encryptSecret(kp.secretKey);
  const { error } = await db.from(TABLE).insert({
    suffix: suffix.toLowerCase(),
    pubkey: kp.publicKey.toBase58(),
    encrypted_secret: bufToHex(encryptedSecret),
    iv: bufToHex(nonce),
    auth_tag: bufToHex(authTag),
  });
  if (error) throw error;
}

// Supabase returns bytea either as a hex-prefixed string ("\\x..."), a plain
// hex string, or base64 depending on the driver. Normalize to Buffer.
function toBuffer(v: unknown): Buffer {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === "string") {
    if (v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
    if (/^[0-9a-fA-F]+$/.test(v) && v.length % 2 === 0) {
      return Buffer.from(v, "hex");
    }
    return Buffer.from(v, "base64");
  }
  throw new Error("unsupported bytea value from Supabase");
}

// Supabase accepts bytea inserts as hex-escaped strings: "\\x<hex>"
function bufToHex(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}
