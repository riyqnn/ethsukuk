"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { PHASE } from "@/contracts/addresses";
import {
  useHasRole,
  useIssue,
  usePosition,
  useProtocolActions,
  useTreasuryBalance,
  useTxState,
} from "@/lib/contracts";
import { useNowSeconds } from "@/lib/useNow";
import { useVaultActivity } from "@/lib/activity";
import { getErrorMessage } from "@/lib/safe";
import {
  basisPointsToPercent,
  compactAddress,
  formatDate,
  formatDuration,
  formatIDRX,
  formatTokenAmount,
  parseTokenAmount,
  toDisplayNumber,
  untilLabel,
} from "@/lib/formatters";
import { PageHeader } from "@/components/ui/PageHeader";
import { KeyFigures } from "@/components/ui/KeyFigures";
import { ConnectGate } from "@/components/ui/ConnectGate";
import { StepAction } from "@/components/ui/StepAction";
import { Field } from "@/components/ui/Field";
import { TxNotice } from "@/components/ui/TxNotice";
import { PhaseBadge } from "@/components/ui/PhaseBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { AnimatedNumber, PageTransition, Press, Reveal } from "@/components/ui/motion";

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const issue = useIssue();
  const me = usePosition(address);
  const treasury = useTreasuryBalance();
  const now = useNowSeconds();
  const actions = useProtocolActions();
  const { data: hasProtocolRole, isLoading: roleLoading } = useHasRole("PROTOCOL_ROLE", address);
  const activity = useVaultActivity();

  const [allocAmount, setAllocAmount] = useState("");
  const [returnAmount, setReturnAmount] = useState("");
  const [couponAmount, setCouponAmount] = useState("");

  const allocTx = useTxState();
  const returnTx = useTxState();
  const couponTx = useTxState();
  const stepTx = useTxState();

  const { phase, terms } = issue;
  const deployed = issue.deployedToTreasury;
  const idle = issue.principal - deployed;
  const couponDue = issue.nextCouponDate > 0n && now >= Number(issue.nextCouponDate);
  const maturityReached = issue.maturityDate > 0n && now >= Number(issue.maturityDate);

  /** Controllers with a redemption request that has not been settled yet. */
  const pendingControllers = [
    ...new Set(
      (activity.data ?? [])
        .filter((a) => a.kind === "RedeemRequest" && a.account)
        .map((a) => a.account as `0x${string}`),
    ),
  ];

  const busy = (tx: ReturnType<typeof useTxState>) =>
    tx.status === "approving" || tx.status === "awaiting_signature";

  async function run(tx: ReturnType<typeof useTxState>, fn: () => Promise<`0x${string}`>, approveFirst?: bigint) {
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
      issue.refetch();
    } catch (e: unknown) {
      tx.setStatus("failed");
      tx.setError(getErrorMessage(e));
    }
  }

  if (!isConnected) {
    return (
      <PageTransition>
        <ConnectGate
          kicker="Protocol admin"
          title="Run the issue"
          description="Controls for the wallet that holds PROTOCOL_ROLE. The role is checked on-chain before anything is shown as callable."
        />
      </PageTransition>
    );
  }

  const allocParsed = parseTokenAmount(allocAmount);
  const returnParsed = parseTokenAmount(returnAmount);
  const couponParsed = parseTokenAmount(couponAmount);

  return (
    <PageTransition>
      <div className="container pb-24">
        <PageHeader
          kicker="Protocol admin"
          title="Run the issue"
          description="Every call below is gated by PROTOCOL_ROLE and by the phase the issue is in. The card that can act now is highlighted."
          actions={
            <Press>
              <button type="button" onClick={() => issue.refetch()} className="btn btn-ghost">
                <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
              </button>
            </Press>
          }
        />

        {!roleLoading && !hasProtocolRole && (
          <Reveal className="mb-8 flex items-start gap-3 rounded-[20px] bg-amber-soft px-6 py-5 text-[13px] text-amber">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-semibold">This wallet does not hold PROTOCOL_ROLE.</span> The contract will reject
              every call on this page from it.
            </p>
          </Reveal>
        )}

        <Reveal delay={0.05}>
          <KeyFigures
            figures={[
              {
                label: "Phase",
                lead: true,
                value: issue.isLoading ? <Skeleton className="h-6 w-28" /> : <PhaseBadge phase={phase} />,
                note: issue.paused ? "Paused: nothing can move" : "Decides which step is callable",
              },
              {
                label: "At the project",
                value: <AnimatedNumber value={toDisplayNumber(deployed)} suffix=" IDRX" />,
                note: `${formatIDRX(idle)} IDRX still in the contract`,
              },
              {
                label: "Next profit period",
                value: phase === PHASE.Active ? untilLabel(Number(issue.nextCouponDate), now) : "Not running",
                note: `${issue.couponsPaid} paid · rate ${basisPointsToPercent(Number(terms.couponRate))}`,
              },
              {
                label: "Your IDRX",
                value: <AnimatedNumber value={toDisplayNumber(me.idrxBalance)} suffix=" IDRX" />,
                note: "Funds each profit period",
              },
            ]}
          />
        </Reveal>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <StepAction
            step="04"
            title="Send principal to the project"
            call="allocateToTreasury(amount)"
            description="Moves subscribed IDRX to the treasury Safe, which funds the real-world project. It stays recorded as principal, so the certificate keeps its value."
            requires="Active"
            phase={phase}
            ready={phase === PHASE.Active && idle > 0n}
            checks={[
              { label: "Issue is active", ok: phase === PHASE.Active },
              { label: `Available to deploy ${formatIDRX(idle)} IDRX`, ok: idle > 0n },
              { label: `Treasury Safe holds ${formatIDRX(treasury.data ?? 0n)} IDRX`, ok: (treasury.data ?? 0n) > 0n },
            ]}
            delay={0.05}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(allocTx, () => actions.allocateToTreasury(allocParsed));
              }}
              className="space-y-4"
            >
              <Field
                id="alloc"
                label="Amount"
                unit="IDRX"
                value={allocAmount}
                onChange={setAllocAmount}
                hint={`${formatIDRX(idle)} available`}
                onFill={idle > 0n ? () => setAllocAmount(formatTokenAmount(idle)) : undefined}
                fillLabel="All"
              />
              <button
                type="submit"
                disabled={phase !== PHASE.Active || allocParsed <= 0n || busy(allocTx)}
                className="btn btn-primary w-full"
              >
                {busy(allocTx) ? "Waiting for wallet…" : "Send to the project"}
              </button>
              <TxNotice status={allocTx.status} hash={allocTx.hash} error={allocTx.error} />
            </form>
          </StepAction>

          <StepAction
            step="05"
            title="Fund a profit period"
            call="fundCoupon(amount)"
            description="Pays the period's profit in and splits it across every holder by share of the issue. Two prompts: approve, then fund."
            requires="Active"
            phase={phase}
            ready={phase === PHASE.Active && couponDue}
            checks={[
              { label: "Issue is active", ok: phase === PHASE.Active },
              {
                label:
                  issue.nextCouponDate > 0n
                    ? `Period due ${untilLabel(Number(issue.nextCouponDate), now)}`
                    : "Period schedule starts once active",
                ok: couponDue,
              },
              { label: `Expected at the stated rate: ${formatIDRX(issue.expectedCoupon)} IDRX`, ok: true },
            ]}
            delay={0.1}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(couponTx, () => actions.fundCoupon(couponParsed), couponParsed);
              }}
              className="space-y-4"
            >
              <Field
                id="coupon"
                label="Profit for this period"
                unit="IDRX"
                value={couponAmount}
                onChange={setCouponAmount}
                hint={`Expected ${formatIDRX(issue.expectedCoupon)}`}
                onFill={
                  issue.expectedCoupon > 0n ? () => setCouponAmount(formatTokenAmount(issue.expectedCoupon)) : undefined
                }
                fillLabel="Expected"
              />
              <button
                type="submit"
                disabled={phase !== PHASE.Active || couponParsed <= 0n || busy(couponTx)}
                className="btn btn-primary w-full"
              >
                {busy(couponTx) ? "Waiting for wallet…" : "Fund the period"}
              </button>
              <TxNotice status={couponTx.status} hash={couponTx.hash} error={couponTx.error} />
            </form>
          </StepAction>

          <StepAction
            step="07"
            title="Return the principal"
            call="returnFromTreasury(amount)"
            description="Brings the principal back from the project at maturity. The treasury wallet must approve this contract first, then the whole amount has to be back before the issue can mature."
            requires="principal outstanding"
            phase={phase}
            ready={deployed > 0n}
            checks={[
              { label: `Outstanding ${formatIDRX(deployed)} IDRX`, ok: deployed > 0n },
              {
                label: maturityReached ? "Maturity reached" : `Matures ${untilLabel(Number(issue.maturityDate), now)}`,
                ok: maturityReached,
              },
            ]}
            delay={0.05}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(returnTx, () => actions.returnFromTreasury(returnParsed), returnParsed);
              }}
              className="space-y-4"
            >
              <Field
                id="return"
                label="Amount to return"
                unit="IDRX"
                value={returnAmount}
                onChange={setReturnAmount}
                hint={`${formatIDRX(deployed)} outstanding`}
                onFill={deployed > 0n ? () => setReturnAmount(formatTokenAmount(deployed)) : undefined}
                fillLabel="All"
              />
              <p className="rounded-xl bg-mist px-4 py-3 text-[13px] text-muted-foreground">
                Sent from the connected wallet. To repay from the Safe, propose the transfer there instead.
              </p>
              <button
                type="submit"
                disabled={returnParsed <= 0n || busy(returnTx)}
                className="btn btn-primary w-full"
              >
                {busy(returnTx) ? "Waiting for wallet…" : "Return principal"}
              </button>
              <TxNotice status={returnTx.status} hash={returnTx.hash} error={returnTx.error} />
            </form>
          </StepAction>

          <StepAction
            step="08"
            title="Mature, settle and close"
            call="markMatured() · fulfillRedeem() · closeIssue()"
            description="Mark the tenor over, settle the redemption requests investors have opened, and close the issue once everyone has been served."
            requires="Active or Redeeming"
            phase={phase}
            ready={
              (phase === PHASE.Active && maturityReached && deployed === 0n) ||
              (phase === PHASE.Redeeming && pendingControllers.length > 0) ||
              phase === PHASE.Redeeming
            }
            checks={[
              { label: "Maturity reached", ok: maturityReached },
              { label: "Principal fully returned", ok: deployed === 0n },
              {
                label: `${pendingControllers.length} wallet${pendingControllers.length === 1 ? "" : "s"} requested redemption`,
                ok: pendingControllers.length > 0,
              },
            ]}
            delay={0.1}
          >
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => run(stepTx, actions.markMatured)}
                disabled={phase !== PHASE.Active || !maturityReached || deployed !== 0n || busy(stepTx)}
                className="btn btn-soft w-full"
              >
                Mark matured
              </button>
              <button
                type="button"
                onClick={() => run(stepTx, () => actions.fulfillRedeem(pendingControllers))}
                disabled={pendingControllers.length === 0 || busy(stepTx)}
                className="btn btn-primary w-full"
              >
                Settle {pendingControllers.length} request{pendingControllers.length === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                onClick={() => run(stepTx, actions.closeIssue)}
                disabled={phase !== PHASE.Redeeming || busy(stepTx)}
                className="btn btn-ghost w-full"
              >
                Close the issue
              </button>
              <TxNotice status={stepTx.status} hash={stepTx.hash} error={stepTx.error} />
            </div>
          </StepAction>
        </div>

        <Reveal className="mt-8 flex flex-col gap-5 rounded-[24px] border border-line bg-amber-soft/60 p-7 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="label">Circuit breaker · pause() / unpause()</p>
            <p className="title mt-2 text-xl">{issue.paused ? "The contract is paused" : "The contract is running"}</p>
            <p className="mt-1.5 max-w-[56ch] text-[13px] leading-relaxed text-muted-foreground">
              Pausing halts subscriptions, transfers, profit claims and redemptions until it is lifted. Use it only for an
              incident.
            </p>
          </div>
          <div className="w-full space-y-3 md:w-72">
            <button
              type="button"
              onClick={() => run(stepTx, () => (issue.paused ? actions.unpause() : actions.pause()))}
              disabled={busy(stepTx)}
              className={`btn w-full ${issue.paused ? "btn-primary" : "border-amber bg-white text-amber hover:bg-amber hover:text-white"}`}
            >
              {issue.paused ? "Unpause" : "Pause everything"}
            </button>
          </div>
        </Reveal>

        <Reveal delay={0.05} className="panel mt-8 p-7">
          <p className="label">Issue terms, as deployed</p>
          <dl className="mt-4 grid gap-x-8 gap-y-4 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Quota", `${formatIDRX(terms.quota)} IDRX`],
              ["Denomination", `${formatIDRX(terms.denomination)} IDRX`],
              ["Tenor", formatDuration(Number(terms.tenor))],
              ["Profit rate", `${basisPointsToPercent(Number(terms.couponRate))} a year`],
              ["Profit period", formatDuration(Number(terms.couponInterval))],
              ["Issued on", issue.issueDate > 0n ? formatDate(Number(issue.issueDate)) : "Not started"],
              ["Matures on", issue.maturityDate > 0n ? formatDate(Number(issue.maturityDate)) : "Not started"],
              ["Profit pool", `${formatIDRX(issue.couponPool)} IDRX`],
              ["Awaiting claim", `${formatIDRX(issue.pendingRedemption)} IDRX`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="figure text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {pendingControllers.length > 0 && (
            <p className="mt-5 text-[13px] text-muted-foreground">
              Requests open from{" "}
              {pendingControllers.map((c) => (
                <span key={c} className="font-mono text-ink">
                  {compactAddress(c)}{" "}
                </span>
              ))}
            </p>
          )}
        </Reveal>
      </div>
    </PageTransition>
  );
}
