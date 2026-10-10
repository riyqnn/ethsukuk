"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { ArrowRight, ExternalLink, ShieldCheck } from "lucide-react";
import { CONTRACTS, PHASE } from "@/contracts/addresses";
import { useIssue, usePosition } from "@/lib/contracts";
import { useNowSeconds } from "@/lib/useNow";
import {
  basisPointsToPercent,
  compactAddress,
  formatDate,
  formatIDRX,
  toDisplayNumber,
  untilLabel,
} from "@/lib/formatters";
import { PageHeader } from "@/components/ui/PageHeader";
import { KeyFigures } from "@/components/ui/KeyFigures";
import { Panel } from "@/components/ui/Panel";
import { ConnectGate } from "@/components/ui/ConnectGate";
import { PhaseBadge } from "@/components/ui/PhaseBadge";
import { AnimatedNumber, EASE, PageTransition, Press, Reveal } from "@/components/ui/motion";

const R = 64;
const CIRC = 2 * Math.PI * R;

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const me = usePosition(address);
  const issue = useIssue();
  const now = useNowSeconds();

  if (!isConnected) {
    return (
      <PageTransition>
        <ConnectGate
          kicker="Portfolio"
          title="Your position"
          description="Your certificates, the profit you have collected so far, and the principal you can redeem."
        />
      </PageTransition>
    );
  }

  const idrx = toDisplayNumber(me.idrxBalance);
  const principal = toDisplayNumber(me.principal);
  const total = idrx + principal;
  const invested = total > 0 ? principal / total : 0;
  const ownership = issue.supply > 0n ? toDisplayNumber(me.shares) / toDisplayNumber(issue.supply) : 0;
  const redeemable = issue.phase === PHASE.Redeeming || issue.phase === PHASE.Closed;

  return (
    <PageTransition>
      <div className="container pb-24">
        <PageHeader
          kicker="Portfolio"
          title="Your position"
          description="Certificates are valued one for one against the principal. The profit share is paid separately each period, so it never inflates the certificate price."
          aside={
            <div className="flex flex-wrap items-center gap-3">
              <PhaseBadge phase={issue.phase} />
              {me.isVerified && (
                <span className="chip bg-mint text-forest-deep">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> KYC verified
                </span>
              )}
              <a
                href={`https://sepolia.etherscan.io/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[13px] text-muted-foreground hover:text-forest"
              >
                {address ? compactAddress(address) : ""} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          }
          actions={
            <Press>
              <Link href="/sukuk" className="btn btn-primary">
                {redeemable ? "Redeem principal" : me.claimableCoupon > 0n ? "Claim profit" : "Subscribe"}
                <span className="btn-icon">
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </Link>
            </Press>
          }
        />

        <Reveal delay={0.05}>
          <KeyFigures
            figures={[
              {
                label: "Principal held",
                lead: true,
                loading: me.isLoading,
                value: <AnimatedNumber value={principal} decimals={2} suffix=" IDRX" />,
                note: `${formatIDRX(me.shares)} certificates`,
              },
              {
                label: "Profit claimable",
                loading: me.isLoading,
                value: <AnimatedNumber value={toDisplayNumber(me.claimableCoupon)} decimals={2} suffix=" IDRX" />,
                note: `${formatIDRX(me.couponClaimed)} IDRX claimed so far`,
              },
              {
                label: "Wallet IDRX",
                loading: me.isLoading,
                value: <AnimatedNumber value={idrx} decimals={2} />,
                note: "Available to subscribe",
              },
              {
                label: "Share of the issue",
                value: `${(ownership * 100).toFixed(2)}%`,
                note: `Profit rate ${basisPointsToPercent(Number(issue.terms.couponRate))} a year`,
              },
            ]}
          />
        </Reveal>

        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <Panel title="Allocation" description="How much of your IDRX is committed to the issue." className="lg:col-span-5" delay={0.05}>
            {total === 0 && !me.isLoading ? (
              <div className="rounded-2xl bg-mist px-5 py-8 text-center">
                <p className="font-semibold">Nothing here yet</p>
                <p className="mx-auto mt-1.5 max-w-[30ch] text-[13px] text-muted-foreground">
                  This wallet holds no IDRX and no certificates on Sepolia.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-7 sm:flex-row lg:flex-col xl:flex-row">
                <div className="relative h-44 w-44 shrink-0">
                  <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90" aria-hidden="true">
                    <circle cx="80" cy="80" r={R} fill="none" stroke="#e3f3ea" strokeWidth="16" />
                    <motion.circle
                      cx="80"
                      cy="80"
                      r={R}
                      fill="none"
                      stroke="#16603f"
                      strokeWidth="16"
                      strokeLinecap="round"
                      strokeDasharray={CIRC}
                      initial={{ strokeDashoffset: CIRC }}
                      animate={{ strokeDashoffset: CIRC * (1 - Math.max(invested, 0.002)) }}
                      transition={{ duration: 1.3, ease: EASE }}
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div>
                      <p className="figure text-2xl font-medium leading-none">{(invested * 100).toFixed(1)}%</p>
                      <p className="mt-1 text-xs text-muted-foreground">invested</p>
                    </div>
                  </div>
                </div>
                <ul className="w-full space-y-2.5 text-[13px]">
                  <li className="flex items-center justify-between rounded-xl bg-mist px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-forest" aria-hidden="true" /> In the issue
                    </span>
                    <span className="figure">{formatIDRX(me.principal)}</span>
                  </li>
                  <li className="flex items-center justify-between rounded-xl bg-mist px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-mint-2 ring-1 ring-mint-3" aria-hidden="true" /> In the wallet
                    </span>
                    <span className="figure">{formatIDRX(me.idrxBalance)}</span>
                  </li>
                </ul>
              </div>
            )}
          </Panel>

          <Panel title="Holdings" description="Read from each contract." className="lg:col-span-7" delay={0.1} bodyClassName="p-0">
            <ul className="hairline">
              <li className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="text-[15px] font-semibold">SUKUK1</p>
                    <span className={`chip ${redeemable ? "bg-mint text-forest-deep" : "bg-amber-soft text-amber"}`}>
                      {redeemable ? "Redeemable" : "Running to maturity"}
                    </span>
                    {me.frozenTokens > 0n && (
                      <span className="chip bg-amber-soft text-amber">{formatIDRX(me.frozenTokens)} frozen</span>
                    )}
                  </div>
                  <a
                    href={`https://sepolia.etherscan.io/address/${CONTRACTS.certificate}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-forest"
                  >
                    ERC-7092 certificate · <span className="font-mono">{compactAddress(CONTRACTS.certificate)}</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
                <div className="text-left sm:text-right">
                  <p className="figure text-[15px]">{formatIDRX(me.shares)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Worth {formatIDRX(me.principal)} IDRX</p>
                </div>
              </li>

              <li className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">MockIDRX</p>
                  <a
                    href={`https://sepolia.etherscan.io/address/${CONTRACTS.idrx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-forest"
                  >
                    Testnet underlying · <span className="font-mono">{compactAddress(CONTRACTS.idrx)}</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
                <p className="figure text-[15px]">{formatIDRX(me.idrxBalance)}</p>
              </li>

              {(me.pendingRedeem > 0n || me.claimableRedeem > 0n) && (
                <li className="flex flex-col gap-4 bg-mist px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[15px] font-semibold">Redemption request</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {me.claimableRedeem > 0n ? "Settled and ready to claim" : "Waiting for the issuer to settle"}
                    </p>
                  </div>
                  <p className="figure text-[15px]">
                    {formatIDRX(me.claimableRedeem > 0n ? me.claimableRedeem : me.pendingRedeem)}
                  </p>
                </li>
              )}
            </ul>
          </Panel>
        </div>

        {issue.phase === PHASE.Active && (
          <Reveal delay={0.05} className="panel-mist mt-8 flex flex-col gap-4 p-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="title text-lg">Next profit period</p>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                {issue.couponsPaid.toString()} paid so far. The issuer funds the next one{" "}
                {untilLabel(Number(issue.nextCouponDate), now)}
                {issue.maturityDate > 0n && `, and the issue matures ${formatDate(Number(issue.maturityDate))}`}.
              </p>
            </div>
            <Press>
              <Link href="/sukuk" className="btn btn-soft">
                Open the terminal
              </Link>
            </Press>
          </Reveal>
        )}
      </div>
    </PageTransition>
  );
}
