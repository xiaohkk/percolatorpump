/**
 * Tiny Borsh-compatible byte writer / reader for the specific layouts the
 * Percolator program uses on the wire. Borsh's full TS library would give
 * us the same thing; we roll it by hand so we don't pull another dep in.
 *
 * Only the fields our program actually exchanges are here — this is not a
 * general Borsh implementation.
 *
 * All multi-byte integers are little-endian, matching Borsh + the Solana
 * convention.
 */

export class Writer {
  private chunks: Uint8Array[] = [];

  u8(v: number): this {
    const b = new Uint8Array(1);
    b[0] = v & 0xff;
    this.chunks.push(b);
    return this;
  }

  u16(v: number): this {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    this.chunks.push(b);
    return this;
  }

  u32(v: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.chunks.push(b);
    return this;
  }

  u64(v: bigint | number): this {
    const big = typeof v === "bigint" ? v : BigInt(v);
    const b = new Uint8Array(8);
    new DataView(b.buffer).setBigUint64(0, big, true);
    this.chunks.push(b);
    return this;
  }

  u128(v: bigint | number): this {
    const big = typeof v === "bigint" ? v : BigInt(v);
    const b = new Uint8Array(16);
    const lo = big & ((1n << 64n) - 1n);
    const hi = big >> 64n;
    const view = new DataView(b.buffer);
    view.setBigUint64(0, lo, true);
    view.setBigUint64(8, hi, true);
    this.chunks.push(b);
    return this;
  }

  bytes(b: Uint8Array | Buffer): this {
    this.chunks.push(b instanceof Uint8Array ? b : new Uint8Array(b));
    return this;
  }

  /** Serialize everything to a single buffer. */
  toBuffer(): Buffer {
    let len = 0;
    for (const c of this.chunks) len += c.length;
    const out = Buffer.alloc(len);
    let off = 0;
    for (const c of this.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }
}

export class Reader {
  private view: DataView;
  private offset = 0;

  constructor(data: Buffer | Uint8Array) {
    // Both Buffer and Uint8Array expose `buffer`/`byteOffset`/`byteLength`.
    // Node's `Buffer` extends `Uint8Array`, so `instanceof Uint8Array` is
    // always true in Node; we just normalize into a fresh Uint8Array view
    // covering the same bytes.
    const u8 =
      data instanceof Uint8Array
        ? data
        : new Uint8Array(data as ArrayBufferLike);
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  u8(): number {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  u16(): number {
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  u64(): bigint {
    const v = this.view.getBigUint64(this.offset, true);
    this.offset += 8;
    return v;
  }

  i64(): bigint {
    const v = this.view.getBigInt64(this.offset, true);
    this.offset += 8;
    return v;
  }

  u128(): bigint {
    const lo = this.view.getBigUint64(this.offset, true);
    const hi = this.view.getBigUint64(this.offset + 8, true);
    this.offset += 16;
    return (hi << 64n) | lo;
  }

  i128(): bigint {
    // Percolator's on-chain `i128` is stored as two u64 little-endian words
    // matching the parent crate's `I128([u64; 2])` layout. That's identical
    // to the two's-complement wire format used by a raw `i128` on LE
    // platforms — decode as u128 and reinterpret the sign.
    const u = this.u128();
    const sign_bit = 1n << 127n;
    return u >= sign_bit ? u - (1n << 128n) : u;
  }

  bytes(len: number): Uint8Array {
    const out = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      len
    );
    this.offset += len;
    return new Uint8Array(out); // detach — caller owns the copy
  }

  skip(len: number): this {
    this.offset += len;
    return this;
  }
}
