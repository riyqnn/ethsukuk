"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { ExternalLink, RefreshCw } from "lucide-react";
import { CONTRACTS } from "@/contracts/addresses";
import { useVaultActivity, type ActivityKind } from "@/lib/activity";
import { compactAddress, formatIDRX } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import { EASE, PageTransition } from "@/components/ui/motion";

/** Money events carry an amount; gate events mark a change of phase or compliance. */
const EVENTS: Record<ActivityKind, { label: string; money: boolean }> = {
  IssueOpened: { label: "Issue opened", money: true },
  Deposit: { label: "Subscription", money: true },
  SubscriptionClosed: { label: "Subscription closed by auditor Safe", money: false },
  AllocatedToTreasury: { label: "Principal sent to the project", money: true },
  ReturnedFromTreasury: { label: "Principal returned by the project", money: true },
  CouponFunded: { label: "Profit period funded", money: true },
  CouponClaimed: { label: "Profit claimed", money: true },
  Matured: { label: "Matured", money: false },
  RedemptionOpened: { label: "Redemption opened by auditor Safe", money: false },
  RedeemRequest: { label: "Redemption requested", money: false },
  RedeemFulfilled: { label: "Redemption settled by issuer", money: true },
  Withdraw: { label: "Principal claimed", money: true },
  IssueClosed: { label: "Issue closed", money: false },
  AddressFrozen: { label: "Wallet freeze changed", money: false },
  RecoverySuccess: { label: "Wallet recovered", money: false },
  Paused: { label: "Contract paused", money: false },
  Unpaused: { label: "Contract unpaused", money: false },
};

function when(ts: number): string {
  if (!ts) return "Unknown time";
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TransactionsPage() {
  const { address, isConnected } = useAccount();
  const [scope, setScope] = useState<"all" | "mine">("all");
  const { data: activity, isLoading, isError, refetch, isFetching } = useVaultActivity();

  const rows = (activity ?? []).filter(
    (item) => scope === "all" || (!!address && item.account?.toLowerCase() === address.toLowerCase()),
  );

  return (
    <PageTransition>
      <div className="container pb-24">
        <PageHeader
          kicker="Ledger"
          title="Everything the issue has done"
          description="Read straight from the certificate's event logs on Sepolia. New events appear here as soon as they are mined."
          aside={
            <a
              href={`https://sepolia.etherscan.io/address/${CONTRACTS.certificate}#events`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-forest"
            >
              Compare with Etherscan <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          }
        />

        <Panel
          title="Certificate events"
          description={isLoading ? "Reading logs…" : `${rows.length} ${rows.length === 1 ? "event" : "events"}${scope === "mine" ? " involving your wallet" : ""}`}
          bodyClassName="p-0"
          action={
            <div className="flex items-center gap-2">
              <div className="relative grid grid-cols-2 rounded-full bg-mist p-1" role="tablist" aria-label="Filter">
                {(["all", "mine"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={scope === v}
                    onClick={() => setScope(v)}
                    className={`relative z-10 min-h-9 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                      scope === v ? "text-forest-deep" : "text-muted-foreground hover:text-ink"
                    }`}
                  >
                    {scope === v && (
                      <motion.span
                        layoutId="ledger-scope"
                        className="absolute inset-0 -z-10 rounded-full bg-white shadow-[0_1px_3px_#0c1f1714]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    {v === "all" ? "All" : "Mine"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => refetch()}
                aria-label="Reload events"
                className="grid h-10 w-10 place-items-center rounded-full border border-line text-muted-foreground transition-colors hover:border-mint-3 hover:text-forest"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              </button>
            </div>
          }
        >
          {scope === "mine" && !isConnected ? (
            <Empty title="Connect a wallet to filter" text="The Mine view shows events where your address deposited, redeemed or was the actor.">
              <WalletConnect />
            </Empty>
          ) : isLoading ? (
            <ul className="hairline" aria-label="Loading events">
              {Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="flex items-center justify-between gap-4 px-6 py-5">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-24" />
                </li>
              ))}
            </ul>
          ) : isError ? (
            <Empty title="Could not read the event logs" text="The Sepolia RPC did not answer. This is usually temporary.">
              <button type="button" onClick={() => refetch()} className="btn btn-soft btn-sm">
                Try again
              </button>
            </Empty>
          ) : rows.length === 0 ? (
            <Empty
              title={scope === "mine" ? "No events for your wallet" : "No events yet"}
              text={scope === "mine" ? "Subscribe, claim profit or redeem and it shows up here." : "The certificate has not emitted any events on this deployment."}
            />
          ) : (
            <ol className="hairline">
              {rows.map((item, i) => {
                const meta = EVENTS[item.kind];
                return (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: Math.min(i, 10) * 0.03, ease: EASE }}
                    className="grid gap-3 px-6 py-5 transition-colors hover:bg-mist sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div className="flex min-w-0 items-start gap-4">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.money ? "bg-forest" : "bg-amber"}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold">{meta.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {when(item.timestamp)}
                          {item.account && (
                            <>
                              {" · "}
                              <span className="font-mono">{compactAddress(item.account)}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-6 pl-6 sm:pl-0">
                      <div className="text-left sm:text-right">
                        {item.amount !== undefined ? (
                          <p className="figure text-[15px]">
                            {formatIDRX(item.amount)} <span className="text-xs text-muted-foreground">{item.kind === "IssueOpened" ? "IDRX quota" : "IDRX"}</span>
                          </p>
                        ) : (
                          <p className="text-[13px] text-muted-foreground">State change</p>
                        )}
                        {item.shares !== undefined && (
                          <p className="figure text-xs text-muted-foreground">{formatIDRX(item.shares)} SUKUK1</p>
                        )}
                      </div>
                      <a
                        href={`https://sepolia.etherscan.io/tx/${item.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`View ${meta.label} transaction on Etherscan`}
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-forest"
                      >
                        {compactAddress(item.txHash)}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </Panel>

        <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-forest" aria-hidden="true" /> Moves IDRX
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber" aria-hidden="true" /> Changes phase or compliance
          </span>
        </p>
      </div>
    </PageTransition>
  );
}

function Empty({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="title text-lg">{title}</p>
      <p className="mt-2 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">{text}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
