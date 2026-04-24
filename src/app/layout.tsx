import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "percolatorpump",
  description: "Leverage trading on the top Solana memes. Inverted perps seeded Day 1 with WIF, BONK, POPCAT, and more — collateralized in the token itself.",
  metadataBase: new URL("https://percolatorpump.fun"),
  openGraph: {
    title: "percolatorpump",
    description: "Leverage trading on the top Solana memes. Inverted perps seeded Day 1 with WIF, BONK, POPCAT, and more — collateralized in the token itself.",
    url: "https://percolatorpump.fun",
    siteName: "percolatorpump",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "percolatorpump",
    description: "Leverage trading on the top Solana memes. Inverted perps seeded Day 1 with WIF, BONK, POPCAT, and more — collateralized in the token itself.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${mono.variable} font-mono antialiased bg-black text-zinc-100 min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
