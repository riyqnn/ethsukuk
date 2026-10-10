import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { Web3Provider } from "@/lib/wagmi";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

// Display: optical sizing keeps large headlines tight and small ones open.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--nf-display",
  display: "swap",
  axes: ["opsz", "wdth"],
});

const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--nf-body",
  display: "swap",
});

// Tabular figures for balances, addresses and hashes.
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--nf-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sukuk Vault | Tokenized Sukuk on Ethereum Sepolia",
  description:
    "Deposit IDRX into an ERC-4626 Sukuk vault, hold sSUKUK shares and redeem principal plus yield after auditor approval. Running on Ethereum Sepolia.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Web3Provider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </Web3Provider>
      </body>
    </html>
  );
}
