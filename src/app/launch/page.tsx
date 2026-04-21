"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { useRouter } from "next/navigation";
import { getConnection } from "@/lib/solana";

const SERVICE_FEE_SOL = 0.03;
const MAX_NAME = 32;
const MAX_TICKER = 10;
const MAX_DESC = 500;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "building" }
  | { kind: "signing" }
  | { kind: "sending"; signature?: string }
  | { kind: "confirmed"; feeSig: string; launchSig: string; mint: string }
  | { kind: "error"; message: string };

export default function LaunchPage() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const router = useRouter();

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [initialBuySol, setInitialBuySol] = useState<string>("0");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const connected = !!publicKey;
  const initialBuy = parseFloat(initialBuySol || "0");

  const valid =
    connected &&
    name.trim().length > 0 &&
    name.length <= MAX_NAME &&
    ticker.trim().length > 0 &&
    ticker.length <= MAX_TICKER &&
    description.trim().length > 0 &&
    description.length <= MAX_DESC &&
    !!imageFile &&
    imageFile.size <= MAX_IMAGE_BYTES &&
    !isNaN(initialBuy) &&
    initialBuy >= 0 &&
    initialBuy <= 5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !publicKey || !signTransaction || !signAllTransactions) return;

    try {
      // 1. Upload image
      setStatus({ kind: "uploading" });
      const form = new FormData();
      form.append("file", imageFile!);
      const uploadRes = await fetch("/api/upload-image", {
        method: "POST",
        body: form,
      });
      if (!uploadRes.ok) {
        throw new Error(`Image upload failed: ${await uploadRes.text()}`);
      }
      const { imageUri } = (await uploadRes.json()) as { imageUri: string };

      // 2. Request launch transactions from the server
      setStatus({ kind: "building" });
      const launchRes = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ticker: ticker.trim().toUpperCase(),
          description: description.trim(),
          imageUri,
          initialBuySol: initialBuy,
          creator: publicKey.toBase58(),
        }),
      });
      if (!launchRes.ok) {
        throw new Error(`/api/launch failed: ${await launchRes.text()}`);
      }
      const body = (await launchRes.json()) as {
        mint: string;
        feeTxBase64: string;
        launchTxBase64: string;
      };

      // 3. Deserialize, sign both, submit both
      setStatus({ kind: "signing" });
      const feeTx = Transaction.from(Buffer.from(body.feeTxBase64, "base64"));
      const launchTx = VersionedTransaction.deserialize(
        Uint8Array.from(atob(body.launchTxBase64), (c) => c.charCodeAt(0))
      );

      const [signedFee, signedLaunch] = await signAllTransactions([feeTx, launchTx]);

      setStatus({ kind: "sending" });
      const connection = getConnection();
      const feeSig = await connection.sendRawTransaction(signedFee.serialize(), {
        skipPreflight: false,
      });
      await connection.confirmTransaction(feeSig, "confirmed");

      const launchSig = await connection.sendRawTransaction(signedLaunch.serialize(), {
        skipPreflight: false,
      });
      await connection.confirmTransaction(launchSig, "confirmed");

      setStatus({
        kind: "confirmed",
        feeSig,
        launchSig,
        mint: body.mint,
      });

      setTimeout(() => router.push(`/t/${body.mint}`), 1500);
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const busy = ["uploading", "building", "signing", "sending"].includes(status.kind);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full border border-zinc-800 rounded-lg p-8 space-y-6 bg-zinc-950/50">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">launch a ...perc token</h1>
          <p className="text-sm text-zinc-500">
            {SERVICE_FEE_SOL} SOL service fee. Every launch reserves a slot on the Percolator perp layer.
          </p>
        </div>

        {!connected && (
          <div className="border border-zinc-800 rounded p-4 space-y-3">
            <p className="text-sm text-zinc-400">Connect a wallet to continue.</p>
            <WalletMultiButton />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="name" hint={`${name.length}/${MAX_NAME}`}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME))}
              className={inputCls}
              placeholder="My Perc Token"
              disabled={busy}
            />
          </Field>

          <Field label="ticker" hint={`${ticker.length}/${MAX_TICKER}`}>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase().slice(0, MAX_TICKER))}
              className={inputCls}
              placeholder="MPT"
              disabled={busy}
            />
          </Field>

          <Field label="description" hint={`${description.length}/${MAX_DESC}`}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESC))}
              rows={3}
              className={`${inputCls} resize-none`}
              placeholder="What's the story of this token?"
              disabled={busy}
            />
          </Field>

          <Field label="image" hint="png / jpg / webp, max 5MB">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-zinc-400 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:bg-zinc-800 file:text-zinc-100 hover:file:bg-zinc-700"
              disabled={busy}
            />
            {imageFile && (
              <div className="text-xs text-zinc-500 mt-1">
                {imageFile.name} ({(imageFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </Field>

          <Field label="initial buy (SOL)" hint="optional, max 5 SOL">
            <input
              type="number"
              step="0.01"
              min="0"
              max="5"
              value={initialBuySol}
              onChange={(e) => setInitialBuySol(e.target.value)}
              className={inputCls}
              disabled={busy}
            />
          </Field>

          <button
            type="submit"
            disabled={!valid || busy}
            className="w-full py-3 rounded bg-zinc-100 text-black font-semibold hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
          >
            {statusLabel(status)}
          </button>
        </form>

        {status.kind === "error" && (
          <div className="border border-red-900 bg-red-950/30 rounded p-3 text-xs text-red-300 break-all">
            {status.message}
          </div>
        )}

        {status.kind === "confirmed" && (
          <div className="border border-green-900 bg-green-950/30 rounded p-3 text-xs text-green-300 space-y-1">
            <div>mint: {status.mint}</div>
            <div>launch sig: {status.launchSig}</div>
            <div className="text-green-500">redirecting...</div>
          </div>
        )}
      </div>
    </main>
  );
}

const inputCls =
  "w-full px-3 py-2 bg-black border border-zinc-800 rounded text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-50";

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

function statusLabel(s: Status): string {
  switch (s.kind) {
    case "uploading":
      return "uploading image...";
    case "building":
      return "building transactions...";
    case "signing":
      return "awaiting wallet signature...";
    case "sending":
      return "submitting to chain...";
    case "confirmed":
      return "confirmed";
    default:
      return "launch";
  }
}
