/**
 * Live fill tape — bottom of the `/perp/[mint]` page.
 *
 * Real implementation streams fills via `program logs` subscription. v0
 * renders an empty tape with a "live fills land with keeper #16" notice.
 */
export function FillTape() {
  return (
    <div
      data-testid="fill-tape"
      className="w-full border border-zinc-900 rounded-md p-3 bg-zinc-950/30"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-2">
        <span>fill tape</span>
        <span className="text-zinc-700">pending keeper logs stream</span>
      </div>
      <div className="text-xs text-zinc-600 font-mono">no fills yet</div>
    </div>
  );
}
