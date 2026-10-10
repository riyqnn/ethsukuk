"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ADDRESSES, CONTRACTS } from "@/contracts/addresses";
import { compactAddress } from "@/lib/formatters";
import { useSafePolicy } from "@/lib/contracts";
import { BrandMark } from "./Header";

const PAGES = [
  { href: "/sukuk", label: "Certificate terminal" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/transactions", label: "Ledger" },
  { href: "/protocol", label: "Protocol" },
  { href: "/auditor", label: "Auditor portal" },
  { href: "/compliance", label: "Compliance desk" },
];

export function Footer() {
  const safe = useSafePolicy();

  const contracts = [
    { label: "SukukCertificate", href: `https://sepolia.etherscan.io/address/${CONTRACTS.certificate}`, value: CONTRACTS.certificate },
    { label: "InvestorRegistry", href: `https://sepolia.etherscan.io/address/${CONTRACTS.registry}`, value: CONTRACTS.registry },
    { label: "MockIDRX", href: `https://sepolia.etherscan.io/address/${CONTRACTS.idrx}`, value: CONTRACTS.idrx },
    {
      label:
        safe.threshold !== undefined && safe.owners
          ? `Auditor Safe · ${safe.threshold}-of-${safe.owners.length}`
          : "Auditor Safe",
      href: `https://app.safe.global/home?safe=sep:${ADDRESSES.auditorMultisig}`,
      value: ADDRESSES.auditorMultisig,
    },
  ];

  return (
    <footer className="mt-auto border-t border-line bg-mist">
      <div className="container grid gap-12 py-16 md:grid-cols-[1.3fr_0.7fr_1fr]">
        <div className="max-w-sm">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark className="h-6 w-6" />
            <span className="title text-[17px]">Sukuk Vault</span>
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            A tokenized Sukuk on Ethereum Sepolia: KYC-gated certificates, profit shared every period,
            and principal redeemed after maturity. Every step is readable on-chain.
          </p>
          <p className="mt-4 rounded-xl bg-white px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground ring-1 ring-line">
            Testnet only. The underlying MockIDRX is minted for testing and is not the official IDRX
            stablecoin.
          </p>
        </div>

        <nav aria-label="Footer">
          <p className="label">Pages</p>
          <ul className="mt-4 space-y-1">
            {PAGES.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="inline-flex min-h-9 items-center text-sm font-medium hover:text-forest">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="label">Deployed on Sepolia</p>
          <ul className="mt-4 space-y-2">
            {contracts.map((c) => (
              <li key={c.value}>
                <a
                  href={c.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center justify-between gap-4 rounded-xl border border-line bg-white px-4 py-3 transition-colors hover:border-mint-3"
                >
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground group-hover:text-forest">
                    {compactAddress(c.value)}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="container flex flex-col gap-2 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Sukuk Vault, a testnet deployment. Chain ID 11155111.</p>
          <a href="https://sepolia.etherscan.io/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-forest">
            Sepolia Etherscan <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
