"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { CONTRACTS, PHASE } from "@/contracts/addresses";
import { useInvestorActions, usePosition, useIssue, useTxState } from "@/lib/contracts";
import { useNowSeconds } from "@/lib/useNow";
import { getErrorMessage } from "@/lib/safe";
import {
  basisPointsToPercent,
  compactAddress,
  formatDate,
  formatDuration,
  formatIDRX,
  formatTokenAmount,
  parseTokenAmount,
  phaseLabel,
  toDisplayNumber,
  untilLabel,
} from "@/lib/formatters";
import { PageHeader } from "@/components/ui/PageHeader";
import { KeyFigures } from "@/components/ui/KeyFigures";
import { Panel } from "@/components/ui/Panel";
import { Field } from "@/components/ui/Field";
import { TxNotice } from "@/components/ui/TxNotice";
import { PhaseBadge } from "@/components/ui/PhaseBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import { AnimatedNumber, EASE, PageTransition, Press, Reveal } from "@/components/ui/motion";

const PHASES = [
  { title: "Subscription", desc: "Certificates are issued one for one against IDRX." },
  { title: "Active", desc: "Principal funds the project. Profit is shared each period." },
  { title: "Matured", desc: "Tenor over and principal returned. Waiting on the auditor Safe." },
  { title: "Redeeming", desc: "Request, then claim your principal back." },
  { title: "Closed", desc: "Settled. Claiming stays open for remaining holders." },
];

type Tab = "subscribe" | "coupon" | "redeem";

export default function SukukPage() {
  const { address, isConnected } = useAccount();
  const issue = useIssue();
  const me = usePosition(address);
  const now = useNowSeconds();
  const actions = useInvestorActions();

  const [tab, setTab] = useState<Tab>("subscribe");
  const [amount, setAmount] = useState("");
  const tx = useTxState();

  const { phase, terms } = issue;
  const filledPct = terms.quota > 0n ? Math.min(100, (toDisplayNumber(issue.principal) / toDisplayNumber(terms.quota)) * 100) : 0;
  const canSubscribe = phase === PHASE.Subscription && !issue.paused;
  const canRedeem = (phase === PHASE.Redeeming || phase === PHASE.Closed) && !issue.paused;
  const busy = tx.status === "approving" || tx.status === "awaiting_signature";
  const parsed = parseTokenAmount(amount);

  async function run(fn: () => Promise<`0x${string}`>, approveFirst?: bigint) {
    try {
      tx.setError("");
      tx.setHash("");
      if (approveFirst !== undefined) {
        tx.setStatus("approving");
        await actions.approveIDRX(approveFirst);
      }
      tx.setStatus("awaiting_signature");
      tx.setHash(await fn());
      tx.setStatus("confirmed");
      setAmount("");
    } catch (e: unknown) {
      tx.setStatus("failed");
      tx.setError(getErrorMessage(e));
    }
  }

  return (
    <PageTransition>
      <div className="container pb-24">
        <PageHeader
          kicker="Certificate terminal"
          title="Sukuk Certificate Series I"
          description="Subscribe while the issue is open, collect the profit share each period, and redeem the principal after maturity."
          aside={
            <div className="flex flex-wrap items-center gap-3">
              {issue.isLoading ? <Skeleton className="h-6 w-24" /> : <PhaseBadge phase={phase} />}
              {issue.isin && <span className="chip bg-mist text-muted-foreground">ISIN {issue.isin}</span>}
              <a
                href={`https://sepolia.etherscan.io/address/${CONTRACTS.certificate}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-[13px] text-muted-foreground hover:text-forest"
              >
                {compactAddress(CONTRACTS.certificate)} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          }
        />

        <Reveal delay={0.05}>
          <KeyFigures
            figures={[
              {
                label: "Subscribed",
                lead: true,
                loading: issue.isLoading,
                value: <AnimatedNumber value={toDisplayNumber(issue.principal)} suffix=" IDRX" />,
                note: terms.quota > 0n ? `of ${formatIDRX(terms.quota)} IDRX quota` : "No issue configured",
              },
              {
                label: "Profit rate",
                value: basisPointsToPercent(Number(terms.couponRate)),
                note: `paid every ${formatDuration(Number(terms.couponInterval))}`,
              },
              {
                label: "Periods paid",
                value: `${issue.couponsPaid}`,
                note:
                  phase === PHASE.Active && issue.nextCouponDate > 0n
                    ? `next ${untilLabel(Number(issue.nextCouponDate), now)}`
                    : "Starts once the issue is active",
              },
              {
                label: "Maturity",
                value: issue.maturityDate > 0n ? formatDate(Number(issue.maturityDate)) : "Not started",
                note:
                  issue.maturityDate > 0n
                    ? untilLabel(Number(issue.maturityDate), now)
                    : `tenor ${formatDuration(Number(terms.tenor))}`,
              },
            ]}
          />
        </Reveal>

        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-7">
            <Panel title="Subscription" description="IDRX committed against the issue quota." delay={0.05}>
              <div className="flex items-end justify-between gap-4">
                <p className="figure text-4xl font-medium leading-none">{filledPct.toFixed(1)}%</p>
                <p className="text-right text-[13px] text-muted-foreground">
                  <span className="figure text-ink">{formatIDRX(issue.principal)}</span> / {formatIDRX(terms.quota)} IDRX
                </p>
              </div>
              <div
                className="mt-5 h-3 overflow-hidden rounded-full bg-mint"
                role="progressbar"
                aria-label="Quota filled"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(filledPct)}
              >
                <motion.div
                  className="h-full rounded-full bg-forest"
                  initial={{ width: 0 }}
                  animate={{ width: `${filledPct}%` }}
                  transition={{ duration: 1.2, ease: EASE }}
                />
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-4 text-[13px] sm:grid-cols-4">
                {[
                  { k: "Certificates", v: `${formatIDRX(issue.supply)}` },
                  { k: "At the project", v: `${formatIDRX(issue.deployedToTreasury)} IDRX` },
                  { k: "Profit pool", v: `${formatIDRX(issue.couponPool)} IDRX` },
                  { k: "Minimum", v: `${formatIDRX(terms.denomination)} IDRX` },
                ].map((s) => (
                  <div key={s.k} className="rounded-xl bg-mist px-4 py-3">
                    <dt className="text-muted-foreground">{s.k}</dt>
                    <dd className="figure mt-1 text-ink">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            <Panel title="Lifecycle" description="Where this issue is, read from the contract." delay={0.1} bodyClassName="p-3">
              <ol>
                {PHASES.map((p, i) => {
                  const active = i === phase;
                  const done = i < phase;
                  return (
                    <li key={p.title} className={`flex items-start gap-4 rounded-2xl px-4 py-4 ${active ? "bg-mint" : ""}`}>
                      <span
                        className={`figure mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${
                          active
                            ? "bg-forest text-white"
                            : done
                              ? "bg-mint-2 text-forest-deep"
                              : "border border-line-strong text-muted-foreground"
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-[15px] font-semibold ${active || done ? "text-ink" : "text-muted-foreground"}`}>
                          {p.title}
                          {active && <span className="ml-2 align-middle text-xs font-medium text-forest">Current</span>}
                        </p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{p.desc}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          </div>

          <aside className="lg:col-span-5">
            <Reveal delay={0.1} className="panel sticky top-24 overflow-hidden">
              <div className="p-2">
                <div className="grid grid-cols-3 rounded-full bg-mist p-1" role="tablist" aria-label="Action">
                  {(
                    [
                      ["subscribe", "Subscribe"],
                      ["coupon", "Profit"],
                      ["redeem", "Redeem"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={tab === key}
                      onClick={() => {
                        setTab(key);
                        setAmount("");
                        tx.reset();
                      }}
                      className={`relative z-10 min-h-10 rounded-full text-sm font-semibold transition-colors ${
                        tab === key ? "text-forest-deep" : "text-muted-foreground hover:text-ink"
                      }`}
                    >
                      {tab === key && (
                        <motion.span
                          layoutId="terminal-tab"
                          className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_1px_3px_#0c1f1714]"
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      )}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-6 pb-6 pt-4">
                <AnimatePresence mode="wait">
                  {!isConnected ? (
                    <motion.div key="connect" {...fade} className="rounded-2xl bg-mist px-5 py-8 text-center">
                      <p className="title text-lg">Connect a wallet</p>
                      <p className="mx-auto mt-2 max-w-[32ch] text-[13px] leading-relaxed text-muted-foreground">
                        Use a wallet on Sepolia to subscribe, collect profit or redeem.
                      </p>
                      <div className="mt-5 flex justify-center">
                        <WalletConnect />
                      </div>
                    </motion.div>
                  ) : !me.isVerified ? (
                    <motion.div key="kyc" {...fade} className="rounded-2xl bg-amber-soft px-5 py-6 text-[13px] text-amber">
                      <p className="flex items-center gap-2 font-semibold">
                        <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Wallet not KYC verified
                      </p>
                      <p className="mt-2 leading-relaxed">
                        The certificate follows ERC-3643, so only wallets registered by the compliance agent can hold it.
                        Ask the agent to register {address ? compactAddress(address) : "this wallet"}.
                      </p>
                    </motion.div>
                  ) : me.walletFrozen ? (
                    <motion.div key="frozen" {...fade} className="rounded-2xl bg-amber-soft px-5 py-6 text-[13px] text-amber">
                      <p className="font-semibold">This wallet is frozen</p>
                      <p className="mt-1.5 leading-relaxed">The compliance agent has to unfreeze it before it can move certificates.</p>
                    </motion.div>
                  ) : tab === "subscribe" ? (
                    <motion.form
                      key="subscribe"
                      {...fade}
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (parsed > 0n && address) run(() => actions.deposit(parsed, address), parsed);
                      }}
                      className="space-y-5"
                    >
                      {!canSubscribe ? (
                        <p className="rounded-2xl bg-amber-soft px-5 py-5 text-[13px] text-amber">
                          <span className="font-semibold">Subscription is closed.</span> The issue is {phaseLabel(phase).toLowerCase()}.
                        </p>
                      ) : (
                        <>
                          <Field
                            id="subscribe-amount"
                            label="Amount to subscribe"
                            unit="IDRX"
                            value={amount}
                            onChange={setAmount}
                            hint={`Wallet ${formatIDRX(me.idrxBalance)} IDRX`}
                            onFill={() => setAmount(formatTokenAmount(me.idrxBalance))}
                            step={formatTokenAmount(terms.denomination)}
                          />
                          <p className="rounded-xl bg-mist px-4 py-3 text-[13px] text-muted-foreground">
                            Multiples of <span className="figure text-ink">{formatIDRX(terms.denomination)} IDRX</span> only.
                            You receive <span className="figure text-ink">{formatIDRX(parsed)}</span> certificates, one per IDRX.
                          </p>
                          <Press className="w-full">
                            <button type="submit" disabled={parsed <= 0n || busy} className="btn btn-primary w-full">
                              {busy ? "Waiting for wallet…" : "Subscribe"}
                            </button>
                          </Press>
                        </>
                      )}
                      <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
                    </motion.form>
                  ) : tab === "coupon" ? (
                    <motion.div key="coupon" {...fade} className="space-y-5">
                      <div className="rounded-2xl bg-mint px-5 py-6 text-center">
                        <p className="label text-forest-deep">Profit you can claim</p>
                        <p className="figure mt-2 text-3xl font-medium leading-none text-forest-deep">
                          {formatIDRX(me.claimableCoupon)}
                        </p>
                        <p className="mt-1.5 text-xs text-forest-deep">IDRX</p>
                      </div>
                      <dl className="grid grid-cols-2 gap-3 text-[13px]">
                        <div className="rounded-xl bg-mist px-4 py-3">
                          <dt className="text-muted-foreground">Already claimed</dt>
                          <dd className="figure mt-1 text-ink">{formatIDRX(me.couponClaimed)} IDRX</dd>
                        </div>
                        <div className="rounded-xl bg-mist px-4 py-3">
                          <dt className="text-muted-foreground">Next period</dt>
                          <dd className="figure mt-1 text-ink">
                            {phase === PHASE.Active ? untilLabel(Number(issue.nextCouponDate), now) : "Not running"}
                          </dd>
                        </div>
                      </dl>
                      <Press className="w-full">
                        <button
                          type="button"
                          disabled={me.claimableCoupon === 0n || busy || issue.paused}
                          onClick={() => address && run(() => actions.claimCoupon(address))}
                          className="btn btn-primary w-full"
                        >
                          {busy ? "Waiting for wallet…" : "Claim profit"}
                        </button>
                      </Press>
                      <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
                    </motion.div>
                  ) : (
                    <motion.div key="redeem" {...fade} className="space-y-5">
                      {!canRedeem ? (
                        <p className="rounded-2xl bg-amber-soft px-5 py-5 text-[13px] text-amber">
                          <span className="font-semibold">Redemption is not open.</span> It opens after maturity, once the
                          auditor Safe has checked the returned principal.
                        </p>
                      ) : me.claimableRedeem > 0n ? (
                        <>
                          <div className="rounded-2xl bg-mint px-5 py-6 text-center">
                            <p className="label text-forest-deep">Ready to claim</p>
                            <p className="figure mt-2 text-3xl font-medium leading-none text-forest-deep">
                              {formatIDRX(me.claimableAssets)}
                            </p>
                            <p className="mt-1.5 text-xs text-forest-deep">IDRX for {formatIDRX(me.claimableRedeem)} certificates</p>
                          </div>
                          <Press className="w-full">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => address && run(() => actions.redeem(me.claimableRedeem, address, address))}
                              className="btn btn-primary w-full"
                            >
                              {busy ? "Waiting for wallet…" : "Claim principal"}
                            </button>
                          </Press>
                        </>
                      ) : me.pendingRedeem > 0n ? (
                        <div className="rounded-2xl bg-mist px-5 py-7 text-center">
                          <p className="title text-lg">Request pending</p>
                          <p className="figure mt-2 text-2xl leading-none">{formatIDRX(me.pendingRedeem)}</p>
                          <p className="mx-auto mt-3 max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">
                            Your certificates are locked in. The issuer settles requests in batches, then the claim button
                            appears here.
                          </p>
                        </div>
                      ) : (
                        <>
                          <Field
                            id="redeem-amount"
                            label="Certificates to redeem"
                            unit="SUKUK1"
                            value={amount}
                            onChange={setAmount}
                            hint={`Held ${formatIDRX(me.shares)}`}
                            onFill={() => setAmount(formatTokenAmount(me.shares - me.frozenTokens))}
                          />
                          <p className="rounded-xl bg-mist px-4 py-3 text-[13px] text-muted-foreground">
                            Redemption is asynchronous, per ERC-7540: you request now, the issuer settles, then you claim
                            <span className="figure text-ink"> {formatIDRX(parsed)} IDRX</span>.
                          </p>
                          <Press className="w-full">
                            <button
                              type="button"
                              disabled={parsed <= 0n || busy}
                              onClick={() => address && run(() => actions.requestRedeem(parsed, address))}
                              className="btn btn-primary w-full"
                            >
                              {busy ? "Waiting for wallet…" : "Request redemption"}
                            </button>
                          </Press>
                        </>
                      )}
                      <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {isConnected && me.shares > 0n && (
                <dl className="grid grid-cols-2 border-t border-line bg-mist text-[13px]">
                  <div className="px-6 py-4">
                    <dt className="text-muted-foreground">Your certificates</dt>
                    <dd className="figure mt-1 text-base text-ink">{formatIDRX(me.shares)}</dd>
                  </div>
                  <div className="border-l border-line px-6 py-4">
                    <dt className="text-muted-foreground">Principal</dt>
                    <dd className="figure mt-1 text-base text-ink">{formatIDRX(me.principal)} IDRX</dd>
                  </div>
                </dl>
              )}
            </Reveal>
          </aside>
        </div>
      </div>
    </PageTransition>
  );
}

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.3, ease: EASE },
};
