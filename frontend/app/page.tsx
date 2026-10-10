"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ADDRESSES, CONTRACTS, PHASE } from "@/contracts/addresses";
import { useIssue, useSafePolicy } from "@/lib/contracts";
import { useNowSeconds } from "@/lib/useNow";
import {
  basisPointsToPercent,
  compactAddress,
  formatDuration,
  formatIDRX,
  phaseLabel,
  toDisplayNumber,
  untilLabel,
} from "@/lib/formatters";
import { VaultRing } from "@/components/ui/VaultRing";
import { PhaseBadge } from "@/components/ui/PhaseBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  AnimatedNumber,
  EASE,
  LineReveal,
  Mark,
  PageTransition,
  Parallax,
  Press,
  Reveal,
  Stagger,
  StaggerItem,
} from "@/components/ui/motion";

const STEPS = [
  {
    name: "KYC gate",
    standard: "ERC-3643",
    actor: "Compliance agent",
    call: "registerIdentity()",
    text: "An agent records the wallet in the investor registry. Only registered, unfrozen wallets can ever hold the certificate, so every later step inherits the check.",
  },
  {
    name: "Certificate issued",
    standard: "ERC-7092 · ERC-4626",
    actor: "Investor",
    call: "deposit()",
    text: "The investor subscribes with IDRX and receives a bond certificate carrying the tenor, the denomination and the profit rate. One certificate is minted per unit of principal.",
  },
  {
    name: "Treasury custody",
    standard: "Gnosis Safe",
    actor: "Protocol",
    call: "allocateToTreasury()",
    text: "The principal moves to a Safe and out to the real-world project. It is recorded as deployed rather than spent, so the certificate keeps its full principal value.",
  },
  {
    name: "Profit shared",
    standard: "ERC-4626",
    actor: "Protocol",
    call: "fundCoupon()",
    text: "Each period the project's profit is paid into the contract and split by share of the issue. Holders pull their part whenever they like, and a transfer carries no unclaimed profit with it.",
  },
  {
    name: "Redemption",
    standard: "ERC-7540",
    actor: "Investor and issuer",
    call: "requestRedeem() → redeem()",
    text: "After maturity the treasury repays, the auditor Safe opens redemption, and the principal comes back through a request the issuer settles before the investor claims.",
  },
];

/** What a visitor can do at each phase, so the page answers "now what?". */
const NOW: Record<number, { line: string; cta: string; href: string }> = {
  [PHASE.Subscription]: { line: "Subscription is open. Certificates are being issued.", cta: "Subscribe", href: "/sukuk" },
  [PHASE.Active]: { line: "The issue is running. Profit is shared each period.", cta: "Claim your profit", href: "/sukuk" },
  [PHASE.Matured]: {
    line: "The tenor is over and the principal is back. Waiting on the auditor Safe.",
    cta: "See the auditor gate",
    href: "/auditor",
  },
  [PHASE.Redeeming]: { line: "Redemption is open. Request, then claim your principal.", cta: "Redeem", href: "/sukuk" },
  [PHASE.Closed]: { line: "The issue is settled. Remaining holders can still claim.", cta: "Redeem", href: "/sukuk" },
};

export default function HomePage() {
  const issue = useIssue();
  const safe = useSafePolicy();
  const now = useNowSeconds();
  const reduce = useReducedMotion();

  const { phase, terms } = issue;
  const configured = terms.quota > 0n;
  const quota = toDisplayNumber(terms.quota);
  const raised = toDisplayNumber(issue.principal);
  const filledPct = quota > 0 ? Math.min(100, (raised / quota) * 100) : 0;

  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroScroll = useSpring(heroProgress, { stiffness: 110, damping: 24, mass: 0.4 });
  const copyY = useTransform(heroScroll, [0, 1], [0, -80]);
  const copyFade = useTransform(heroScroll, [0, 0.8], [1, 0]);
  const cardNear = useTransform(heroScroll, [0, 1], [0, -140]);
  const cardFar = useTransform(heroScroll, [0, 1], [0, -40]);

  const nowLine = NOW[phase];

  return (
    <PageTransition>
      {/* Hero: the promise on the left, the live issue on the right. */}
      <section ref={heroRef} className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[linear-gradient(180deg,#f5faf7_0%,#ffffff_100%)]"
        />
        <div className="container grid items-center gap-14 pb-20 pt-14 md:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:pb-28 lg:pt-24">
          <motion.div style={reduce ? undefined : { y: copyY, opacity: copyFade }}>
            <Reveal>
              <p className="kicker">Tokenized Sukuk on Ethereum Sepolia</p>
            </Reveal>
            <h1 className="display display-xl mt-6">
              <span className="sr-only">A Sukuk you can verify, block by block.</span>
              <span aria-hidden="true">
                <LineReveal
                  delay={0.1}
                  lines={[
                    "A Sukuk you",
                    <>
                      can <Mark>verify,</Mark>
                    </>,
                    "block by block.",
                  ]}
                />
              </span>
            </h1>
            <Reveal delay={0.35}>
              <p className="lede mt-7 max-w-[47ch]">
                KYC at the gate, a bond certificate on-chain, the principal held in a Safe while it funds the project,
                and the profit shared every period. Five standards, one flow you can read on Sepolia.
              </p>
            </Reveal>
            <Reveal delay={0.45} className="mt-9 flex flex-wrap items-center gap-3">
              <Press>
                <Link href="/sukuk" className="btn btn-primary">
                  Open the terminal
                  <span className="btn-icon">
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </Press>
              <Press>
                <a href="#lifecycle" className="btn btn-ghost">
                  How an issue works
                </a>
              </Press>
            </Reveal>
            <Reveal delay={0.5}>
              <ul className="mt-9 flex flex-wrap gap-2">
                {["ERC-3643", "ERC-7092", "ERC-4626", "ERC-7540", "Gnosis Safe"].map((s) => (
                  <li key={s} className="chip bg-mist text-muted-foreground">
                    {s}
                  </li>
                ))}
              </ul>
            </Reveal>
          </motion.div>

          <Reveal delay={0.2} className="relative mx-auto w-full max-w-[540px]">
            <div className="relative aspect-square">
              <VaultRing filledPct={filledPct} state={phase} configured={configured} scroll={heroScroll} />

              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="label">Profit rate</p>
                  <p className="figure mt-1.5 text-[clamp(1.6rem,3.4vw,2.25rem)] font-medium leading-none">
                    {issue.isLoading ? <Skeleton className="h-8 w-28" /> : basisPointsToPercent(Number(terms.couponRate))}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    every {formatDuration(Number(terms.couponInterval))}
                  </p>
                </div>
              </div>

              <motion.div
                style={reduce ? undefined : { y: cardNear }}
                className="absolute -left-6 top-[9%] hidden w-[210px] sm:block"
              >
                <div className="rounded-2xl border border-line bg-white/95 p-4 shadow-[0_20px_40px_-28px_#16603f66]">
                  <p className="label">Subscribed</p>
                  <p className="figure mt-1.5 text-lg font-medium leading-none">
                    {issue.isLoading ? <Skeleton className="h-5 w-20" /> : <AnimatedNumber value={raised} />}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    of {configured ? formatIDRX(terms.quota) : "no"} IDRX quota
                  </p>
                </div>
              </motion.div>

              <motion.div
                style={reduce ? undefined : { y: cardFar }}
                className="absolute -right-6 bottom-[10%] hidden w-[220px] sm:block"
              >
                <div className="rounded-2xl border border-line bg-white/95 p-4 shadow-[0_20px_40px_-28px_#16603f66]">
                  <p className="label">Phase</p>
                  <div className="mt-2">
                    {issue.isLoading ? <Skeleton className="h-6 w-24" /> : <PhaseBadge phase={phase} />}
                  </div>
                  <p className="mt-2.5 text-xs text-muted-foreground">
                    {issue.couponsPaid.toString()} profit period{issue.couponsPaid === 1n ? "" : "s"} paid
                  </p>
                </div>
              </motion.div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 sm:hidden">
              <div className="rounded-2xl border border-line bg-white p-4">
                <dt className="label">Subscribed</dt>
                <dd className="figure mt-1.5 text-lg font-medium leading-none">{formatIDRX(issue.principal)}</dd>
                <dd className="mt-1 text-xs text-muted-foreground">
                  of {configured ? formatIDRX(terms.quota) : "no"} IDRX
                </dd>
              </div>
              <div className="rounded-2xl border border-line bg-white p-4">
                <dt className="label">Profit rate</dt>
                <dd className="figure mt-1.5 text-lg font-medium leading-none">
                  {basisPointsToPercent(Number(terms.couponRate))}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">
                  every {formatDuration(Number(terms.couponInterval))}
                </dd>
              </div>
            </dl>
          </Reveal>
        </div>
      </section>

      {/* Right-now band: the one action this phase allows. */}
      <section className="border-y border-line bg-mist">
        <div className="container flex flex-col gap-5 py-7 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <span className="label">Right now</span>
            {issue.isLoading ? <Skeleton className="h-6 w-28" /> : <PhaseBadge phase={phase} />}
            <p className="text-[15px] font-medium">
              {configured ? nowLine.line : "No issue has been configured on this deployment yet."}
            </p>
          </div>
          {configured && (
            <Link
              href={nowLine.href}
              className="inline-flex items-center gap-2 text-sm font-semibold text-forest hover:text-forest-deep"
            >
              {nowLine.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>

      <Lifecycle phase={phase} configured={configured} />

      {/* Roles: who can move the issue, and what each key is allowed to call. */}
      <section className="container py-24 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <Reveal>
            <p className="kicker">Roles and keys</p>
            <h2 className="display display-lg mt-5">
              Four roles. <Mark>No shortcuts</Mark> between them.
            </h2>
            <p className="lede mt-7 max-w-[42ch]">
              AUDITOR_ROLE administers itself, so the protocol admin cannot grant it to its own key. The gates that lock
              the money and release it belong to the Safe.
            </p>
          </Reveal>

          <Stagger className="grid gap-4 sm:grid-cols-2" gap={0.1}>
            <StaggerItem className="sm:col-span-2">
              <div className="panel lift p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="label">Auditor Safe · AUDITOR_ROLE</p>
                    <p className="title mt-2 text-2xl">Closes the issue and releases the principal</p>
                  </div>
                  <span className="chip bg-pistachio text-forest-deep">
                    {safe.isLoading
                      ? "Reading policy…"
                      : safe.threshold !== undefined && safe.owners
                        ? `${safe.threshold}-of-${safe.owners.length} signatures`
                        : "Policy unavailable"}
                  </span>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
                  <code className="font-mono text-[13px] text-muted-foreground">
                    closeSubscription() · openRedemption()
                  </code>
                  <a
                    href={`https://app.safe.global/home?safe=sep:${ADDRESSES.auditorMultisig}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-mono text-[13px] font-medium text-forest hover:underline"
                  >
                    {compactAddress(ADDRESSES.auditorMultisig)}{" "}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              </div>
            </StaggerItem>

            {[
              {
                label: "Protocol · PROTOCOL_ROLE",
                title: "Runs the issue",
                text: "Opens it, moves principal to and from the treasury, funds each profit period, settles redemptions.",
                href: `https://sepolia.etherscan.io/address/${ADDRESSES.protocolAdmin}`,
                value: compactAddress(ADDRESSES.protocolAdmin),
              },
              {
                label: "Compliance · AGENT_ROLE",
                title: "Keeps the register",
                text: "Registers verified investors, freezes wallets or balances, forces a transfer and recovers a lost wallet.",
                href: `https://sepolia.etherscan.io/address/${CONTRACTS.registry}`,
                value: compactAddress(CONTRACTS.registry),
              },
            ].map((r) => (
              <StaggerItem key={r.label}>
                <div className="panel-mist lift h-full p-7">
                  <p className="label">{r.label}</p>
                  <p className="title mt-2 text-xl">{r.title}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{r.text}</p>
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex items-center gap-1.5 font-mono text-[13px] font-medium text-forest hover:underline"
                  >
                    {r.value} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Closing band: the contracts, and the way in. */}
      <section className="container pb-24 lg:pb-32">
        <Reveal className="relative overflow-hidden rounded-[28px] bg-mint px-7 py-14 sm:px-12 lg:px-16 lg:py-20">
          <Parallax distance={40} className="pointer-events-none absolute -right-24 -top-24 hidden w-[420px] opacity-70 md:block">
            <svg viewBox="0 0 400 400" aria-hidden="true">
              {[180, 150, 120, 90].map((r) => (
                <circle
                  key={r}
                  cx="200"
                  cy="200"
                  r={r}
                  fill="none"
                  stroke="#8fc4a6"
                  strokeWidth="1"
                  strokeDasharray={r === 150 ? "2 6" : undefined}
                />
              ))}
            </svg>
          </Parallax>

          <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <h2 className="display display-lg max-w-[16ch]">Every figure here is read from Sepolia.</h2>
              <p className="mt-5 max-w-[44ch] text-[15px] leading-relaxed text-forest-deep">
                Nothing on this site is typed in by hand. Check the contracts yourself, then connect a wallet once the
                compliance agent has registered it.
              </p>
              <Press className="mt-8">
                <Link href="/sukuk" className="btn btn-primary">
                  Open the terminal
                  <span className="btn-icon">
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </Link>
              </Press>
            </div>

            <ul className="space-y-3">
              {[
                { name: "SukukCertificate", spec: "ERC-7092 bond · ERC-4626 · ERC-7540", address: CONTRACTS.certificate },
                { name: "InvestorRegistry", spec: "ERC-3643 KYC gate", address: CONTRACTS.registry },
                { name: "MockIDRX", spec: "Testnet underlying, 18 decimals", address: CONTRACTS.idrx },
              ].map((c) => (
                <li key={c.address}>
                  <a
                    href={`https://sepolia.etherscan.io/address/${c.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center justify-between gap-4 rounded-2xl bg-white px-5 py-4 transition-transform duration-500 [transition-timing-function:var(--ease)] hover:-translate-y-0.5"
                  >
                    <span>
                      <span className="block text-[15px] font-semibold">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.spec}</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground group-hover:text-forest">
                      {compactAddress(c.address)}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        {issue.maturityDate > 0n && (
          <p className="mt-8 text-center text-[13px] text-muted-foreground">
            This issue matures {untilLabel(Number(issue.maturityDate), now)}. Testnet timings are shortened so the whole
            lifecycle can be walked through in one session.
          </p>
        )}
      </section>
    </PageTransition>
  );
}

/**
 * Pinned walkthrough of the five stages. The left column stays put while the cards scroll past;
 * the card nearest the middle of the screen becomes the active one.
 */
function Lifecycle({ phase, configured }: { phase: number; configured: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end center"] });
  const rail = useSpring(scrollYProgress, { stiffness: 140, damping: 28 });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(p * STEPS.length))));
  });

  // The KYC gate is stage 0 and sits outside the contract phases, which start at "certificate issued".
  const liveIndex = configured ? phase + 1 : -1;

  return (
    <section id="lifecycle" className="scroll-mt-24 border-b border-line">
      <div ref={ref} className="container grid gap-12 py-24 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20 lg:py-32">
        <div className="lg:sticky lg:top-28 lg:h-fit">
          <Reveal>
            <p className="kicker">How an issue works</p>
            <h2 className="display display-lg mt-5">
              Five stages, <Mark>one direction.</Mark>
            </h2>
            <p className="lede mt-7 max-w-[40ch]">
              Each stage is a separate transaction from a separate role, and the contract only ever moves forward.
            </p>
          </Reveal>

          <div className="relative mt-10 hidden lg:block">
            <div className="absolute bottom-3 left-[9px] top-3 w-px bg-line" aria-hidden="true" />
            <motion.div
              className="absolute left-[9px] top-3 w-px origin-top bg-forest"
              style={{ scaleY: rail, height: "calc(100% - 24px)" }}
              aria-hidden="true"
            />
            <ol className="relative space-y-4">
              {STEPS.map((s, i) => (
                <li key={s.name} className="flex items-center gap-4">
                  <span
                    className={`grid h-[19px] w-[19px] place-items-center rounded-full border transition-colors duration-500 ${
                      i <= active ? "border-forest bg-forest" : "border-line-strong bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${i <= active ? "bg-white" : "bg-transparent"}`} />
                  </span>
                  <span
                    className={`text-sm transition-colors duration-500 ${
                      i === active ? "font-semibold text-ink" : "text-muted-foreground"
                    }`}
                  >
                    {s.name}
                  </span>
                  {i === liveIndex && <span className="chip bg-pistachio text-forest-deep">Live now</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <ol className="space-y-5 lg:space-y-[18vh] lg:py-[8vh]">
          {STEPS.map((s, i) => (
            <li key={s.name}>
              <StepCard step={s} index={i} active={i === active} live={i === liveIndex} phase={phase} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function StepCard({
  step,
  index,
  active,
  live,
  phase,
}: {
  step: (typeof STEPS)[number];
  index: number;
  active: boolean;
  live: boolean;
  phase: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, ease: EASE }}
      className={`rounded-[24px] border p-7 transition-[border-color,background-color,box-shadow] duration-500 sm:p-9 ${
        active ? "border-mint-3 bg-white shadow-[0_28px_60px_-40px_#16603f80]" : "border-line bg-mist lg:bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="figure text-sm text-muted-foreground">{String(index + 1).padStart(2, "0")} / 05</span>
        <div className="flex items-center gap-2">
          <span className="chip bg-mist text-muted-foreground">{step.standard}</span>
          <AnimatePresence>
            {live && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="chip bg-pistachio text-forest-deep"
              >
                Live · {phaseLabel(phase)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <h3 className="title mt-5 text-[1.75rem] leading-tight">{step.name}</h3>
      <p className="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-muted-foreground">{step.text}</p>
      <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-5 text-[13px]">
        <span>
          <span className="text-muted-foreground">Called by </span>
          <span className="font-semibold">{step.actor}</span>
        </span>
        <code className="font-mono text-forest">{step.call}</code>
      </div>
    </motion.article>
  );
}
