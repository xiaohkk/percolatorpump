import Link from "next/link";
import seedConfig from "../../config/seed-tokens.json";

/**
 * Day-1 seeded markets (top 15 Solana memes by 24h volume, per STATE.md).
 * Ordering mirrors `config/seed-tokens.json` — that file is the single
 * source of truth for the Approach-D seed list.
 *
 * Tile states:
 *   - Muted/locked until `NEXT_PUBLIC_PHASE_2_LIVE === "true"`.
 *   - Once live, tiles with a verified mint become clickable `<Link>`s to
 *     `/perp/[mint]`. Tokens still flagged `verified: false` stay muted
 *     even after unlock; that way a partial seed run can go live without
 *     linking to a bogus mint.
 */
const SENTINEL_PUBKEY = "11111111111111111111111111111111";

export function SeedTokenGrid() {
  const live = process.env.NEXT_PUBLIC_PHASE_2_LIVE === "true";
  return (
    <div
      className="w-full max-w-2xl mx-auto"
      data-testid="seed-token-grid"
      data-live={live ? "true" : "false"}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          day 1 seeded markets
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
          {live ? "live" : "queued"}
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {seedConfig.tokens.map((t) => {
          const linkable =
            live && t.verified === true && t.mint !== SENTINEL_PUBKEY;
          return (
            <SeedTile
              key={t.symbol}
              ticker={t.symbol}
              mint={t.mint}
              linkable={linkable}
            />
          );
        })}
      </div>
    </div>
  );
}

function SeedTile({
  ticker,
  mint,
  linkable,
}: {
  ticker: string;
  mint: string;
  linkable: boolean;
}) {
  const baseClasses =
    "flex items-center justify-center h-10 rounded-md border font-mono text-[11px] uppercase tracking-[0.15em] transition-colors";

  if (linkable) {
    return (
      <Link
        href={`/perp/${mint}`}
        data-ticker={ticker}
        data-locked="false"
        className={
          baseClasses +
          " border-emerald-500/40 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10"
        }
      >
        {ticker}
      </Link>
    );
  }

  // Locked state: non-interactive div, muted palette. Same footprint so
  // the grid doesn't shift at unlock.
  return (
    <div
      data-ticker={ticker}
      data-locked="true"
      className={baseClasses + " border-zinc-800 bg-zinc-950 text-zinc-600"}
    >
      {ticker}
    </div>
  );
}
