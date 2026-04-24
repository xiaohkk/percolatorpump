/**
 * Per-side state badge: displays `side_mode` ∈ {Normal, DrainOnly,
 * ResetPending} plus A (adl multiplier) and K (adl coeff) snapshots.
 *
 * v0 renders a static Normal badge until the typed engine decoder
 * surfaces `side_mode_{long,short}`.
 */
interface Props {
  side: "long" | "short";
  mode?: "normal" | "drain_only" | "reset_pending" | "unknown";
}

export function ABKBadge({ side, mode = "unknown" }: Props) {
  const label =
    mode === "normal"
      ? "normal"
      : mode === "drain_only"
      ? "drain only"
      : mode === "reset_pending"
      ? "reset pending"
      : "pending";

  const color =
    mode === "normal"
      ? "text-emerald-400 border-emerald-500/30"
      : mode === "drain_only"
      ? "text-amber-300 border-amber-500/30"
      : mode === "reset_pending"
      ? "text-sky-300 border-sky-500/30"
      : "text-zinc-500 border-zinc-800";

  return (
    <div
      data-testid={`abk-badge-${side}`}
      className={`inline-flex flex-col items-start border rounded-md px-2 py-1 ${color}`}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] opacity-60">
        {side}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">
        {label}
      </span>
    </div>
  );
}
