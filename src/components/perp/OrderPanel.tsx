"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import type { Side } from "@/lib/percolator";

interface Props {
  mint: PublicKey;
  /** Current mark price (lamports per token, u64). `null` while oracle is uninit. */
  markPrice: bigint | null;
  /**
   * The user's current capital in this slab in mint-native units. `null`
   * until the typed engine decoder lands. The order panel uses it for the
   * client-side margin check.
   */
  userCapital: bigint | null;
  /**
   * Submit a Place Order intent to the parent. `onSubmit` is responsible
   * for building + signing + sending the tx; the panel only owns the
   * form state.
   */
  onSubmit: (args: {
    side: Side;
    size: bigint;
    maxPrice: bigint;
    minPrice: bigint;
  }) => Promise<void> | void;
}

const MAX_LEVERAGE = 10;
const POS_SCALE = 1_000_000n; // matches percolator::POS_SCALE

export function OrderPanel({ mint, markPrice, userCapital, onSubmit }: Props) {
  const { publicKey } = useWallet();
  const [side, setSide] = useState<Side>("long");
  const [sizeInput, setSizeInput] = useState("0");
  const [leverage, setLeverage] = useState(2);
  const [slippageBps, setSlippageBps] = useState(100); // 1%
  const [submitting, setSubmitting] = useState(false);

  const sizeFloat = Number(sizeInput) || 0;
  // size in POS_SCALE units (bigint). size=1 means "1 unit of the token".
  const sizeQ = useMemo(() => {
    if (!Number.isFinite(sizeFloat) || sizeFloat <= 0) return 0n;
    return BigInt(Math.round(sizeFloat * Number(POS_SCALE)));
  }, [sizeFloat]);

  const notional = useMemo(() => {
    if (sizeQ === 0n || markPrice === null) return 0n;
    return (sizeQ * markPrice) / POS_SCALE;
  }, [sizeQ, markPrice]);

  /** Required initial margin = notional / leverage. Leveraged cap controlled by slider. */
  const imReq = leverage > 0 ? notional / BigInt(leverage) : 0n;
  const marginOk = userCapital !== null ? userCapital >= imReq : null;
  const oracleOk = markPrice !== null && markPrice > 0n;

  const canSubmit =
    !!publicKey &&
    sizeQ > 0n &&
    oracleOk &&
    leverage > 0 &&
    leverage <= MAX_LEVERAGE &&
    marginOk !== false &&
    !submitting;

  async function handleSubmit() {
    if (!canSubmit || markPrice === null) return;
    setSubmitting(true);
    try {
      // Slippage bounds around the live mark price (client-side guard;
      // engine re-checks against its oracle at tx time).
      const bpsBig = BigInt(slippageBps);
      const maxPrice = (markPrice * (10_000n + bpsBig)) / 10_000n;
      const minPrice = (markPrice * (10_000n - bpsBig)) / 10_000n;
      await onSubmit({ side, size: sizeQ, maxPrice, minPrice });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="order-panel"
      data-mint={mint.toBase58()}
      className="border border-zinc-800 rounded-lg p-5 space-y-5 bg-zinc-950/40"
    >
      <header className="flex items-baseline justify-between">
        <div className="text-base font-semibold">place order</div>
        {!publicKey && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            no wallet
          </span>
        )}
      </header>

      {/* Side toggle */}
      <div
        role="tablist"
        aria-label="order side"
        className="grid grid-cols-2 gap-1 p-1 bg-zinc-900/50 rounded-md border border-zinc-800"
      >
        {(["long", "short"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={side === s}
            data-testid={`side-${s}`}
            onClick={() => setSide(s)}
            className={
              "py-2 text-xs uppercase tracking-[0.18em] rounded transition-colors " +
              (side === s
                ? s === "long"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-red-500/10 text-red-300"
                : "text-zinc-500 hover:text-zinc-300")
            }
          >
            {s}
          </button>
        ))}
      </div>

      <Field label="size" hint="tokens (1 = 1 unit)">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={sizeInput}
          onChange={(e) => setSizeInput(e.target.value)}
          className={inputCls}
          data-testid="order-size"
        />
      </Field>

      <Field label={`leverage: ${leverage}x`} hint={`max ${MAX_LEVERAGE}x`}>
        <input
          type="range"
          min={1}
          max={MAX_LEVERAGE}
          value={leverage}
          onChange={(e) => setLeverage(parseInt(e.target.value, 10))}
          className="w-full"
          data-testid="order-leverage"
        />
      </Field>

      <Field label={`slippage: ${(slippageBps / 100).toFixed(2)}%`} hint="bps">
        <input
          type="range"
          min={10}
          max={1000}
          step={10}
          value={slippageBps}
          onChange={(e) => setSlippageBps(parseInt(e.target.value, 10))}
          className="w-full"
          data-testid="order-slippage"
        />
      </Field>

      {/* Preview */}
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <Preview label="mark" value={markPrice === null ? "—" : markPrice.toString()} />
        <Preview label="notional" value={notional === 0n ? "—" : notional.toString()} />
        <Preview label="margin req" value={imReq === 0n ? "—" : imReq.toString()} />
        <Preview label="capital" value={userCapital === null ? "pending" : userCapital.toString()} />
      </dl>

      {!publicKey ? (
        <WalletMultiButton style={{ width: "100%" }} />
      ) : (
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          data-testid="order-submit"
          className="w-full py-3 rounded bg-zinc-100 text-black font-semibold hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "submitting…" : `place ${side}`}
        </button>
      )}

      {marginOk === false && (
        <div className="text-xs text-red-400">
          Insufficient capital. Deposit more to open this size.
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 bg-black border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-500";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-xs text-zinc-500">
        <span>{label}</span>
        {hint && <span>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Preview({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</dt>
      <dd className="font-mono tabular-nums text-zinc-200 truncate">{value}</dd>
    </div>
  );
}
