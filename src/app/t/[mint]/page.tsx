import type { Metadata } from "next";
import { PublicKey } from "@solana/web3.js";
import { getConnection } from "@/lib/solana";
import {
  resolveTokenMetadata,
  type ResolvedTokenMetadata,
} from "@/lib/token-metadata";
import PriceBadge from "@/components/price-badge";
import CopyMintButton from "@/components/copy-mint-button";

// The mint is freshly launched by /launch so it may not be indexed yet; keep
// this page dynamic so Next.js never serves a stale ISR copy.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface TokenPageProps {
  params: { mint: string };
}

// ----------------------------------------------------------------------------
// Metadata (for Twitter / Telegram / generic OG previews)
// ----------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: TokenPageProps): Promise<Metadata> {
  const { mint } = params;
  const resolved = await safeResolve(mint);

  const title = resolved
    ? `${resolved.name} (${resolved.symbol}) · percolatorpump`
    : `${mint.slice(0, 4)}...${mint.slice(-4)} · percolatorpump`;
  const description = resolved?.description
    ? resolved.description
    : `Freshly launched ...perc token on pump.fun. Perp market unlocks when Percolator deploys.`;
  const image = resolved?.image || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export default async function TokenPage({ params }: TokenPageProps) {
  const { mint } = params;
  const isValid = isValidPublicKey(mint);
  const resolved = isValid ? await safeResolve(mint) : null;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-2xl w-full border border-zinc-800 rounded-lg p-8 space-y-6 bg-zinc-950/50">
        {!isValid ? (
          <InvalidMint mint={mint} />
        ) : resolved ? (
          <Loaded mint={mint} data={resolved} />
        ) : (
          <Skeleton mint={mint} />
        )}
      </div>
    </main>
  );
}

// ----------------------------------------------------------------------------
// Sections
// ----------------------------------------------------------------------------

function Loaded({
  mint,
  data,
}: {
  mint: string;
  data: ResolvedTokenMetadata;
}) {
  return (
    <>
      <TokenImage src={data.image} alt={data.name} />

      <div className="space-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold break-words">{data.name}</h1>
          <span className="text-sm uppercase tracking-widest text-zinc-500">
            ${data.symbol}
          </span>
        </div>
        {data.description && (
          <p className="text-sm text-zinc-400 leading-relaxed">
            {data.description}
          </p>
        )}
      </div>

      <PerpBadge />

      <MintRow mint={mint} />

      <PriceBadge mint={mint} />

      <MetaRow label="holders">
        <span className="text-zinc-500">-</span>
      </MetaRow>

      <Actions mint={mint} />
    </>
  );
}

function Skeleton({ mint }: { mint: string }) {
  return (
    <>
      <div className="w-64 h-64 bg-zinc-900 rounded mx-auto animate-pulse" />
      <div className="space-y-2">
        <div className="h-6 w-40 bg-zinc-900 rounded animate-pulse" />
        <div className="h-4 w-24 bg-zinc-900 rounded animate-pulse" />
      </div>
      <p className="text-xs text-zinc-500">
        Metadata not indexed yet. This usually takes a few seconds after the
        launch tx confirms. Refresh in a moment.
      </p>

      <PerpBadge />

      <MintRow mint={mint} />

      <PriceBadge mint={mint} />

      <Actions mint={mint} />
    </>
  );
}

function InvalidMint({ mint }: { mint: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">invalid mint</h1>
      <p className="text-sm text-zinc-500 break-all">
        The address <span className="font-mono">{mint}</span> is not a valid
        Solana public key.
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Building blocks
// ----------------------------------------------------------------------------

function TokenImage({
  src,
  alt,
}: {
  src: string | null;
  alt: string;
}) {
  // We use a plain <img> rather than next/image to avoid needing to register
  // every possible IPFS gateway / CDN in next.config.mjs remotePatterns. The
  // image is a fixed 256px square, so the perf hit is negligible.
  if (!src) {
    return (
      <div className="w-64 h-64 bg-zinc-900 rounded mx-auto flex items-center justify-center text-zinc-600 text-xs">
        no image
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={256}
      height={256}
      className="w-64 h-64 rounded mx-auto object-cover bg-zinc-900"
    />
  );
}

function MintRow({ mint }: { mint: string }) {
  const { head, tail } = splitMint(mint);
  return (
    <div className="border border-zinc-800 rounded px-3 py-2 bg-zinc-950/40">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">
        mint
      </div>
      <div className="font-mono text-xs break-all">
        <span className="text-zinc-300">{head}</span>
        <span className="text-emerald-400 font-mono">{tail}</span>
      </div>
    </div>
  );
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-800 rounded px-3 py-2 bg-zinc-950/40 flex items-center justify-between">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="font-mono text-xs text-zinc-300">{children}</div>
    </div>
  );
}

function PerpBadge() {
  return (
    <div className="group relative inline-flex items-center">
      <span className="px-3 py-1 text-[11px] uppercase tracking-widest rounded-full border border-zinc-800 text-zinc-500 bg-zinc-950 cursor-help">
        perp: queued for phase 2
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full mt-2 w-64 text-[11px] leading-snug text-zinc-300 bg-zinc-900 border border-zinc-800 rounded p-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
      >
        This market will go live when the Percolator program deploys at 5 SOL
        treasury.
      </span>
    </div>
  );
}

function Actions({ mint }: { mint: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
      <a
        href={`https://pump.fun/coin/${mint}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full py-3 rounded bg-zinc-100 text-black font-semibold text-sm text-center hover:bg-white transition-colors"
      >
        Trade on pump.fun
      </a>
      <CopyMintButton mint={mint} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function isValidPublicKey(value: string): boolean {
  try {
    // PublicKey accepts any base58 string of the right length; toBytes throws
    // on malformed input.
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Server-side metadata resolver that never throws. RPC hiccups or freshly
 * launched mints (PDA not yet written) just render the skeleton.
 */
async function safeResolve(
  mint: string
): Promise<ResolvedTokenMetadata | null> {
  try {
    const pk = new PublicKey(mint);
    const conn = getConnection();
    return await resolveTokenMetadata(conn, pk);
  } catch {
    return null;
  }
}

/**
 * Split the mint address so the trailing "perc" suffix (vanity) can be
 * highlighted. We match case-insensitively and only highlight the last
 * occurrence if it actually ends the string.
 */
function splitMint(mint: string): { head: string; tail: string } {
  const suffix = "perc";
  if (mint.toLowerCase().endsWith(suffix)) {
    return {
      head: mint.slice(0, mint.length - suffix.length),
      tail: mint.slice(mint.length - suffix.length),
    };
  }
  // If the address doesn't happen to end in "perc" (dev token, imported
  // share), just dim-highlight the last 4 chars so the UI shape is stable.
  return {
    head: mint.slice(0, -4),
    tail: mint.slice(-4),
  };
}
