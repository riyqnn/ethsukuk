"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, Check, ExternalLink, RefreshCw } from "lucide-react";
import { ADDRESSES, PHASE } from "@/contracts/addresses";
import { useIssue, useSafePolicy, useTreasuryBalance } from "@/lib/contracts";
import { useNowSeconds } from "@/lib/useNow";
import {
  fetchPendingSafeTransactions,
  fetchSafeInfo,
  getErrorMessage,
  getEvmProvider,
  proposeSafeTransaction,
  type SafeInfo,
  type SafePendingTransaction,
} from "@/lib/safe";
import { compactAddress, formatIDRX, toDisplayNumber, untilLabel } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/PageHeader";
import { KeyFigures } from "@/components/ui/KeyFigures";
import { Panel } from "@/components/ui/Panel";
import { StepAction } from "@/components/ui/StepAction";
import { PhaseBadge } from "@/components/ui/PhaseBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import { AnimatedNumber, EASE, PageTransition, Press, Reveal } from "@/components/ui/motion";

export default function AuditorPage() {
  const { address, isConnected } = useAccount();
  const issue = useIssue();
  const safePolicy = useSafePolicy();
  const treasury = useTreasuryBalance();
  const now = useNowSeconds();

  const [loadingStep, setLoadingStep] = useState<"close" | "open" | null>(null);
  const [txHash, setTxHash] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingTxs, setPendingTxs] = useState<SafePendingTransaction[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [safeInfo, setSafeInfo] = useState<SafeInfo | null>(null);
  const [hasLoadedQueue, setHasLoadedQueue] = useState(false);

  const { phase, terms } = issue;
  const safeQueueUrl = `https://app.safe.global/transactions/queue?safe=sep:${ADDRESSES.auditorMultisig}`;
  const threshold = safePolicy.threshold !== undefined ? Number(safePolicy.threshold) : safeInfo?.threshold;
  const policy =
    safePolicy.threshold !== undefined && safePolicy.owners
      ? `${safePolicy.threshold}-of-${safePolicy.owners.length}`
      : null;

  const canClose = phase === PHASE.Subscription && issue.supply > 0n;
  const canOpen = phase === PHASE.Matured;

  async function loadQueue() {
    setLoadingPending(true);
    const [pending, info] = await Promise.all([fetchPendingSafeTransactions(), fetchSafeInfo()]);
    setPendingTxs(pending);
    setSafeInfo(info);
    setHasLoadedQueue(true);
    setLoadingPending(false);
  }

  async function handlePropose(functionName: "closeSubscription" | "openRedemption") {
    if (!address) {
      setErrorMsg("Connect a wallet that owns the Safe first.");
      return;
    }
    const provider = getEvmProvider();
    if (!provider) {
      setErrorMsg("No browser wallet was detected.");
      return;
    }
    try {
      setLoadingStep(functionName === "closeSubscription" ? "close" : "open");
      setErrorMsg("");
      setTxHash("");
      await provider.request({ method: "eth_requestAccounts" });
      const res = await proposeSafeTransaction({ functionName, provider, signerAddress: address });
      setTxHash(res.safeTxHash);
      await loadQueue();
      issue.refetch();
    } catch (e: unknown) {
      console.error("Safe SDK error:", e);
      setErrorMsg(getErrorMessage(e));
    } finally {
      setLoadingStep(null);
    }
  }

  const proposeButton = (fn: "closeSubscription" | "openRedemption", ready: boolean, key: "close" | "open") =>
    !isConnected ? (
      <WalletConnect />
    ) : (
      <Press className="w-full">
        <button
          type="button"
          onClick={() => handlePropose(fn)}
          disabled={!ready || loadingStep !== null}
          className="btn btn-primary w-full"
        >
          {loadingStep === key ? "Signing the Safe proposal…" : `Propose ${fn}()`}
        </button>
      </Press>
    );

  return (
    <PageTransition>
      <div className="container pb-24">
        <PageHeader
          kicker="Auditor portal"
          title="The two gates the Safe controls"
          description="Proposals are signed here and sent to the Safe Transaction Service. They execute once enough Safe owners confirm them."
          aside={
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              <span className="chip bg-pistachio text-forest-deep">
                {safePolicy.isLoading ? "Reading policy…" : policy ? `${policy} signatures` : "Policy unavailable"}
              </span>
              <a
                href={`https://app.safe.global/home?safe=sep:${ADDRESSES.auditorMultisig}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-muted-foreground hover:text-forest"
              >
                {compactAddress(ADDRESSES.auditorMultisig)} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          }
          actions={
            <Press>
              <a href={safeQueueUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                Open Safe queue
                <span className="btn-icon">
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </a>
            </Press>
          }
        />

        <Reveal delay={0.05}>
          <KeyFigures
            figures={[
              {
                label: "Phase",
                lead: true,
                value: issue.isLoading ? <Skeleton className="h-6 w-28" /> : <PhaseBadge phase={phase} />,
                note: canClose
                  ? "Ready for closeSubscription()"
                  : canOpen
                    ? "Ready for openRedemption()"
                    : "No gate is open for the Safe",
              },
              {
                label: "Subscribed",
                value: <AnimatedNumber value={toDisplayNumber(issue.principal)} suffix=" IDRX" />,
                note: `${formatIDRX(issue.supply)} certificates issued`,
              },
              {
                label: "At the project",
                value: <AnimatedNumber value={toDisplayNumber(issue.deployedToTreasury)} suffix=" IDRX" />,
                note: issue.deployedToTreasury === 0n ? "Nothing outstanding" : "Must return before redemption",
              },
              {
                label: "Maturity",
                value: issue.maturityDate > 0n ? untilLabel(Number(issue.maturityDate), now) : "Not started",
                note: `${issue.couponsPaid} profit period${issue.couponsPaid === 1n ? "" : "s"} paid`,
              },
            ]}
          />
        </Reveal>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <StepAction
            step="03"
            title="Close the subscription"
            call="closeSubscription()"
            description="Ends the offer, starts the tenor and fixes the maturity date. From here the principal can be sent to the project."
            requires="Subscription"
            currentLabel={issue.isLoading ? "…" : undefined}
            phase={phase}
            ready={canClose}
            checks={[
              { label: "Issue is in subscription", ok: phase === PHASE.Subscription },
              { label: `Certificates issued (${formatIDRX(issue.supply)})`, ok: issue.supply > 0n },
              { label: `Raised ${formatIDRX(issue.principal)} of ${formatIDRX(terms.quota)} IDRX`, ok: issue.principal > 0n },
            ]}
            delay={0.05}
          >
            {proposeButton("closeSubscription", canClose, "close")}
          </StepAction>

          <StepAction
            step="06"
            title="Open redemption"
            call="openRedemption()"
            description="Confirms the principal is back from the project and lets every holder request their money."
            requires="Matured"
            phase={phase}
            ready={canOpen}
            checks={[
              { label: "Tenor has elapsed and the issue is matured", ok: phase >= PHASE.Matured },
              { label: "Project has returned the principal", ok: issue.deployedToTreasury === 0n },
              {
                label: `Treasury Safe holds ${formatIDRX(treasury.data ?? 0n)} IDRX`,
                ok: (treasury.data ?? 0n) >= 0n,
              },
            ]}
            delay={0.1}
          >
            {proposeButton("openRedemption", canOpen, "open")}
          </StepAction>
        </div>

        <AnimatePresence>
          {(txHash || errorMsg) && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: EASE }}
              role="status"
              className={`mt-8 rounded-[24px] px-7 py-6 ${txHash ? "bg-mint text-forest-deep" : "bg-danger-soft text-danger"}`}
            >
              {txHash ? (
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      <Check className="h-4 w-4" aria-hidden="true" /> Proposal signed and sent to the Safe
                    </p>
                    <p className="mt-1 text-[13px]">
                      It executes after {threshold ?? "the required number of"} owner
                      {threshold === 1 ? "" : "s"} confirm it in the Safe queue.
                    </p>
                    <p className="mt-2 break-all font-mono text-xs">Safe tx {txHash}</p>
                  </div>
                  <a href={safeQueueUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm shrink-0">
                    Confirm in Safe <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold">The proposal was not sent</p>
                    <p className="mt-1 break-words font-mono text-xs">{errorMsg}</p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <Panel
          title="Pending in the Safe queue"
          description="Proposals waiting for owner confirmations."
          className="mt-8"
          bodyClassName="p-0"
          delay={0.05}
          action={
            <button type="button" onClick={loadQueue} disabled={loadingPending} className="btn btn-soft btn-sm">
              <RefreshCw className={`h-3.5 w-3.5 ${loadingPending ? "animate-spin" : ""}`} aria-hidden="true" />
              {loadingPending ? "Loading…" : hasLoadedQueue ? "Reload" : "Load queue"}
            </button>
          }
        >
          {!hasLoadedQueue ? (
            <p className="px-6 py-10 text-center text-[13px] text-muted-foreground">
              The queue is fetched from the Safe Transaction Service when you ask for it.
            </p>
          ) : pendingTxs.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13px] text-muted-foreground">Nothing is waiting for signatures.</p>
          ) : (
            <ul className="hairline">
              {pendingTxs.map((tx) => {
                const confirmed = tx.confirmations?.length ?? 0;
                const need = threshold ?? confirmed;
                return (
                  <li key={tx.safeTxHash} className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-[13px] font-medium">{compactAddress(tx.safeTxHash)}</p>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-mint">
                          <div
                            className="h-full rounded-full bg-forest"
                            style={{ width: `${need > 0 ? Math.min(100, (confirmed / need) * 100) : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {confirmed} of {need} confirmations
                        </span>
                      </div>
                    </div>
                    <a href={safeQueueUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                      Review in Safe <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Reveal className="mt-8 rounded-[24px] bg-amber-soft px-7 py-6 text-[13px] leading-relaxed text-amber">
          <p className="font-semibold">What the contract does not check</p>
          <p className="mt-1 max-w-[80ch]">
            The contract cannot tell whether a real asset backs the issue, or whether a funded profit period matches what
            the project actually earned. Those checks belong to the Safe owners before they sign. The expected figure is
            published as <code className="font-mono">expectedCouponAmount()</code> for comparison.
          </p>
        </Reveal>
      </div>
    </PageTransition>
  );
}
