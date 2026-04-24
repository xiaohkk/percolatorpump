"use client";

/**
 * Position panel — displays the user's open position in the current
 * market. v0 shows "no position" until the typed engine decoder surfaces
 * `accounts[i].{basis, capital, pnl, reserved_pnl}`.
 *
 * Pre-typed-decoder we still render the scaffolding so layout, a11y,
 * and interactions are exercised by the test harness.
 */
import { useWallet } from "@solana/wallet-adapter-react";

interface Props {
  /** `null` means "not decoded yet"; `undefined` means "no position". */
  position?: {
    side: "long" | "short";
    basis: bigint;
    entry: bigint;
    capital: bigint;
    pnl: bigint;
    reservedPnl: bigint;
  } | null;
  markPrice: bigint | null;
  onClose?: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

export function PositionPanel({
  position,
  markPrice,
  onClose,
  onDeposit,
  onWithdraw,
}: Props) {
  const { publicKey } = useWallet();

  return (
    <div
      data-testid="position-panel"
      className="border border-zinc-800 rounded-lg p-5 space-y-4 bg-zinc-950/40"
    >
      <header className="flex items-baseline justify-between">
        <div className="text-base font-semibold">position</div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          {publicKey ? "connected" : "no wallet"}
        </span>
      </header>

      {position === null ? (
        <div className="text-xs text-zinc-500">
          typed decoder pending — deposit/withdraw wired, live position view
          lands next
        </div>
      ) : !position ? (
        <div className="text-xs text-zinc-500">no open position</div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <Metric label="side" value={position.side} />
            <Metric label="basis" value={position.basis.toString()} />
            <Metric label="entry" value={position.entry.toString()} />
            <Metric label="mark" value={markPrice?.toString() ?? "—"} />
            <Metric label="capital" value={position.capital.toString()} />
            <Metric
              label="pnl (matured)"
              value={(position.pnl - position.reservedPnl).toString()}
            />
          </dl>
          <button
            type="button"
            disabled={!onClose}
            onClick={onClose}
            className="w-full py-2 text-xs rounded border border-red-500/40 bg-red-500/5 text-red-300 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            close position
          </button>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-900">
        <button
          type="button"
          onClick={onDeposit}
          disabled={!onDeposit || !publicKey}
          className="py-2 text-xs rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="position-deposit"
        >
          deposit
        </button>
        <button
          type="button"
          onClick={onWithdraw}
          disabled={!onWithdraw || !publicKey}
          className="py-2 text-xs rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="position-withdraw"
        >
          withdraw
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </dt>
      <dd className="font-mono tabular-nums text-zinc-200 truncate">{value}</dd>
    </div>
  );
}
