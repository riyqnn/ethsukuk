"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ADDRESSES, CONTRACTS } from "@/contracts/addresses";
import { useSafePolicy } from "@/lib/contracts";
import { compactAddress } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { EASE, PageTransition, Press, Reveal, Stagger, StaggerItem } from "@/components/ui/motion";


type Lane = "Agent" | "Protocol" | "Investors" | "Auditor Safe";

const CALLS: { n: number; lane: Lane; call: string; effect: string; to?: string; std: string }[] = [
  { n: 1, lane: "Agent", call: "registerIdentity()", effect: "Records the KYC result for a wallet", std: "ERC-3643" },
  { n: 2, lane: "Protocol", call: "openIssue()", effect: "Quota, denomination, tenor, profit rate", std: "ERC-7092" },
  { n: 3, lane: "Investors", call: "deposit()", effect: "IDRX in, certificates minted 1:1", std: "ERC-4626" },
  { n: 4, lane: "Auditor Safe", call: "closeSubscription()", effect: "Ends the offer, starts the tenor", to: "Active", std: "Safe" },
  { n: 5, lane: "Protocol", call: "allocateToTreasury()", effect: "Principal out to the project", std: "Safe" },
  { n: 6, lane: "Protocol", call: "fundCoupon()", effect: "Pays one profit period in", std: "ERC-4626" },
  { n: 7, lane: "Investors", call: "claimCoupon()", effect: "Pulls the holder's profit share", std: "ERC-4626" },
  { n: 8, lane: "Protocol", call: "returnFromTreasury()", effect: "Project repays the principal", std: "Safe" },
  { n: 9, lane: "Protocol", call: "markMatured()", effect: "Tenor over, principal fully back", to: "Matured", std: "ERC-7092" },
  { n: 10, lane: "Auditor Safe", call: "openRedemption()", effect: "Lets holders request their money", to: "Redeeming", std: "Safe" },
  { n: 11, lane: "Investors", call: "requestRedeem()", effect: "Certificates leave, request opens", std: "ERC-7540" },
  { n: 12, lane: "Protocol", call: "fulfillRedeem()", effect: "Settles the open requests", std: "ERC-7540" },
  { n: 13, lane: "Investors", call: "redeem()", effect: "Claims the principal in IDRX", std: "ERC-7540" },
];

export default function ProtocolPage() {
  const safe = useSafePolicy();

  return (
    <PageTransition>
      <div className="container pb-24">
        <PageHeader
          kicker="Protocol"
          title="How the certificate is wired"
          description="Thirteen calls take an issue from the KYC gate to redemption. Each one is gated to a single role, enforced by the contract."
          actions={
            <Press>
              <Link href="/auditor" className="btn btn-ghost">
                Auditor portal
                <span className="btn-icon">
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            </Press>
          }
        />

        {/* One row per call, in the order they happen. Role and standard are the columns that matter. */}
        <Panel
          title="Every call, in order"
          description="Calls that move the issue to a new phase are marked with the phase they lead to."
          bodyClassName="p-0"
        >
          <div className="hidden grid-cols-[3rem_1fr_9rem_7rem] gap-4 border-b border-line bg-mist px-6 py-3 text-xs text-muted-foreground sm:grid">
            <span>#</span>
            <span>Call and effect</span>
            <span>Caller</span>
            <span>Standard</span>
          </div>
          <ol className="hairline">
            {CALLS.map((c, i) => (
              <motion.li
                key={c.n}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: Math.min(i, 8) * 0.04, ease: EASE }}
                className="grid grid-cols-[2.25rem_1fr] items-start gap-4 px-6 py-4 transition-colors hover:bg-mist sm:grid-cols-[3rem_1fr_9rem_7rem] sm:items-center"
              >
                <span className="figure text-[13px] text-muted-foreground">{String(c.n).padStart(2, "0")}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="font-mono text-[13px] font-medium text-forest">{c.call}</code>
                    {c.to && <span className="chip bg-mint text-[11px] text-forest-deep">to {c.to}</span>}
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{c.effect}</p>
                  <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                    {c.lane} · {c.std}
                  </p>
                </div>
                <span className="hidden text-[13px] font-medium sm:block">{c.lane}</span>
                <span className="hidden text-[13px] text-muted-foreground sm:block">{c.std}</span>
              </motion.li>
            ))}
          </ol>
        </Panel>

        <Stagger className="mt-8 grid gap-8 lg:grid-cols-2" gap={0.1}>
          <StaggerItem>
            <div className="panel h-full p-7">
              <p className="label">PROTOCOL_ROLE</p>
              <h2 className="title mt-2 text-2xl">Protocol admin</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Opens the issue, moves principal to and from the project, funds each profit period,
                settles redemptions and can pause. It cannot close the offer or open redemption.
              </p>
              <dl className="mt-6 space-y-3 text-[13px]">
                <Row label={ADDRESSES.protocolAdmins.length > 1 ? "Holders" : "Holder"}>
                  <span className="flex flex-col items-end gap-1">
                    {ADDRESSES.protocolAdmins.map((a) => (
                      <AddressLink key={a} href={`https://sepolia.etherscan.io/address/${a}`} value={a} />
                    ))}
                  </span>
                </Row>
                <Row label="Can call">
                  <span className="font-mono">openIssue · allocateToTreasury · fundCoupon · fulfillRedeem · pause</span>
                </Row>
              </dl>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="panel-mist h-full p-7">
              <p className="label">AUDITOR_ROLE</p>
              <h2 className="title mt-2 text-2xl">Auditor Safe</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                The only key that can close the offer and open redemption. The role administers
                itself, so the protocol admin cannot grant it.
              </p>
              <dl className="mt-6 space-y-3 text-[13px]">
                <Row label="Safe">
                  <AddressLink href={`https://app.safe.global/home?safe=sep:${ADDRESSES.auditorMultisig}`} value={ADDRESSES.auditorMultisig} />
                </Row>
                <Row label="Signing policy">
                  {safe.isLoading ? (
                    <Skeleton className="h-5 w-24" />
                  ) : safe.threshold !== undefined && safe.owners ? (
                    <span className="chip bg-pistachio text-forest-deep">
                      {safe.threshold.toString()} of {safe.owners.length} owners
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Could not read the Safe</span>
                  )}
                </Row>
                {safe.owners && (
                  <Row label="Owners">
                    <span className="flex flex-col items-end gap-1">
                      {safe.owners.map((o) => (
                        <AddressLink key={o} href={`https://sepolia.etherscan.io/address/${o}`} value={o} />
                      ))}
                    </span>
                  </Row>
                )}
              </dl>
            </div>
          </StaggerItem>
        </Stagger>

        <Reveal delay={0.05} className="panel-mist mt-8 p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="label">AGENT_ROLE</p>
              <h2 className="title mt-2 text-2xl">Compliance agent</h2>
              <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
                Keeps the ERC-3643 register: records verified wallets, freezes a wallet or part of a balance,
                forces a transfer under a court order, and moves a position to a new wallet after a lost key.
              </p>
            </div>
            <Press>
              <Link href="/compliance" className="btn btn-ghost btn-sm">
                Compliance desk
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Press>
          </div>
          <dl className="mt-6 space-y-3 text-[13px]">
            <Row label="Registry">
              <AddressLink href={`https://sepolia.etherscan.io/address/${CONTRACTS.registry}`} value={CONTRACTS.registry} />
            </Row>
            <Row label="Can call">
              <span className="font-mono">registerIdentity · setAddressFrozen · freezePartialTokens · forcedTransfer · recoveryAddress</span>
            </Row>
          </dl>
        </Reveal>

        <Panel title="Deployed contracts" description="Ethereum Sepolia, chain ID 11155111." className="mt-8" bodyClassName="p-0" delay={0.05}>
          <ul className="hairline">
            {[
              {
                name: "SukukCertificate",
                spec: "ERC-7092 bond, ERC-4626 accounting, ERC-7540 redemption. Issues SUKUK1.",
                address: CONTRACTS.certificate,
              },
              { name: "InvestorRegistry", spec: "ERC-3643 KYC gate consulted on every transfer.", address: CONTRACTS.registry },
              { name: "MockIDRX", spec: "ERC-20, 18 decimals. Testnet only, not the official IDRX.", address: CONTRACTS.idrx },
            ].map((c) => (
              <li key={c.address} className="flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[15px] font-semibold">{c.name}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{c.spec}</p>
                </div>
                <a
                  href={`https://sepolia.etherscan.io/address/${c.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 break-all font-mono text-xs text-muted-foreground hover:text-forest"
                >
                  {c.address} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </Panel>

        <Reveal className="mt-8 rounded-[24px] bg-amber-soft px-7 py-6 text-[13px] leading-relaxed text-amber">
          <p className="font-semibold">What the contract does not check</p>
          <p className="mt-1 max-w-[86ch]">
            The contract does not verify that a real-world asset backs the issue, or that a funded profit period
            matches what the project actually earned. Those checks are made off-chain by the Safe owners before they
            sign. The expected figure is published as expectedCouponAmount() for comparison.
          </p>
        </Reveal>
      </div>
    </PageTransition>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-t border-line pt-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function AddressLink({ href, value }: { href: string; value: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono font-medium text-forest hover:underline">
      {compactAddress(value)} <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}
