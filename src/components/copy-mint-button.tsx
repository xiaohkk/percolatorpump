"use client";

import { useState } from "react";

interface CopyMintButtonProps {
  mint: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Small button that writes the mint address to the clipboard and flashes a
 * "copied" label for ~1.5s. Stays a plain client component so the rest of
 * the page can remain server-rendered.
 */
export default function CopyMintButton({
  mint,
  className,
  children,
}: CopyMintButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in insecure contexts (http). Fall back quietly.
      const area = document.createElement("textarea");
      area.value = mint;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // give up
      } finally {
        document.body.removeChild(area);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "w-full py-3 rounded border border-zinc-700 text-zinc-200 text-sm font-semibold hover:bg-zinc-900 transition-colors"
      }
    >
      {copied ? "copied" : children ?? "Copy mint address"}
    </button>
  );
}
