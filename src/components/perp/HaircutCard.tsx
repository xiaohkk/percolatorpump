/**
 * The "h" card — headline health indicator for a market.
 *
 * h = residual / matured_pnl_pos_tot, clamped to [0, 1].
 *   h ≥ 0.95 → green  (whole; matured profit convertible on-the-fly)
 *   0.80–0.95 → yellow (partial socialization)
 *   < 0.80 → red      (material haircut on profit withdrawals)
 *
 * Until the typed engine decoder returns `matured_pnl_pos_tot` and the
 * `c_tot + insurance` pair, `h` is `null` and we render "—".
 */
interface Props {
  /** `null` while the typed decoder isn't wired; a float in [0,1] otherwise. */
  h: number | null;
}

export function HaircutCard({ h }: Props) {
  const bucket = h === null ? "unknown" : h >= 0.95 ? "green" : h >= 0.8 ? "yellow" : "red";

  const bgClass =
    bucket === "green"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : bucket === "yellow"
      ? "border-amber-500/40 bg-amber-500/5"
      : bucket === "red"
      ? "border-red-500/40 bg-red-500/5"
      : "border-zinc-800 bg-zinc-950/50";

  const textClass =
    bucket === "green"
      ? "text-emerald-300"
      : bucket === "yellow"
      ? "text-amber-300"
      : bucket === "red"
      ? "text-red-300"
      : "text-zinc-400";

  return (
    <div
      data-testid="haircut-card"
      data-bucket={bucket}
      className={`px-4 py-3 rounded-lg border ${bgClass}`}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
        haircut (h)
      </div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${textClass}`}>
        {h === null ? "—" : h.toFixed(2)}
      </div>
      <div className="text-[10px] text-zinc-600 mt-1">
        {bucket === "green" && "profit convertible 1:1"}
        {bucket === "yellow" && "partial haircut on profit"}
        {bucket === "red" && "material haircut"}
        {bucket === "unknown" && "pending typed decoder"}
      </div>
    </div>
  );
}
