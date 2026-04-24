import { dexSourceLabel, DexSourceKind } from "@/lib/dex-resolver";

interface Props {
  kind: DexSourceKind | null;
  /** Compact pubkey form of the underlying pool account. */
  source?: string;
}

export function PoolBadge({ kind, source }: Props) {
  if (kind === null) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] border border-amber-500/30 bg-amber-500/5 text-amber-300 rounded">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        no trading pool
      </span>
    );
  }

  const palette =
    kind === "pump_bonding"
      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
      : kind === "pumpswap"
      ? "border-pink-500/30 bg-pink-500/5 text-pink-300"
      : kind === "raydium"
      ? "border-sky-500/30 bg-sky-500/5 text-sky-300"
      : "border-violet-500/30 bg-violet-500/5 text-violet-300";

  return (
    <span
      className={`inline-flex items-center gap-2 px-2 py-1 text-[10px] uppercase tracking-[0.18em] border rounded ${palette}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span>{dexSourceLabel(kind)}</span>
      {source && (
        <span className="font-mono text-[9px] opacity-60">
          {source.slice(0, 4)}…{source.slice(-4)}
        </span>
      )}
    </span>
  );
}
