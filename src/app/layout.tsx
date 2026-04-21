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
  description: "Launch a ...perc token on pump.fun. Perp market unlocks when Percolator deploys.",
  metadataBase: new URL("https://percolatorpump.fun"),
  openGraph: {
    title: "percolatorpump",
    description: "Launch a ...perc token on pump.fun. Perp market unlocks when Percolator deploys.",
    url: "https://percolatorpump.fun",
    siteName: "percolatorpump",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "percolatorpump",
    description: "Launch a ...perc token on pump.fun. Perp market unlocks when Percolator deploys.",
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
