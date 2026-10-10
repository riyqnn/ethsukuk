"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { AlertTriangle, ExternalLink, Search, ShieldCheck, ShieldX } from "lucide-react";
import { CONTRACTS } from "@/contracts/addresses";
import {
  useAgentActions,
  useComplianceLookup,
  useHasRole,
  useInvestorCount,
  useIssue,
  useTxState,
} from "@/lib/contracts";
import { getErrorMessage } from "@/lib/safe";
import { compactAddress, formatIDRX, formatTokenAmount, parseTokenAmount } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/PageHeader";
import { KeyFigures } from "@/components/ui/KeyFigures";
import { Panel } from "@/components/ui/Panel";
import { ConnectGate } from "@/components/ui/ConnectGate";
import { Field } from "@/components/ui/Field";
import { TxNotice } from "@/components/ui/TxNotice";
import { PageTransition, Press, Reveal } from "@/components/ui/motion";

/** A few ISO-3166 numeric codes, the same identifier ERC-3643 uses. */
const COUNTRIES = [
  { code: 360, name: "Indonesia" },
  { code: 458, name: "Malaysia" },
  { code: 702, name: "Singapore" },
  { code: 784, name: "United Arab Emirates" },
  { code: 682, name: "Saudi Arabia" },
];

const countryName = (code: number) => COUNTRIES.find((c) => c.code === code)?.name ?? `Code ${code}`;

export default function CompliancePage() {
  const { address, isConnected } = useAccount();
  const { data: isAgent, isLoading: roleLoading } = useHasRole("AGENT_ROLE", address);
  const investors = useInvestorCount();
  const issue = useIssue();
  const actions = useAgentActions();

  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(360);
  const [freezeAmount, setFreezeAmount] = useState("");
  const tx = useTxState();

  const target = query.trim() as `0x${string}`;
  const lookup = useComplianceLookup(target);
  const busy = tx.status === "awaiting_signature";

  async function run(fn: () => Promise<`0x${string}`>) {
    try {
      tx.setError("");
      tx.setHash("");
      tx.setStatus("awaiting_signature");
      tx.setHash(await fn());
      tx.setStatus("confirmed");
      lookup.refetch();
      investors.refetch();
    } catch (e: unknown) {
      tx.setStatus("failed");
      tx.setError(getErrorMessage(e));
    }
  }

  if (!isConnected) {
    return (
      <PageTransition>
        <ConnectGate
          kicker="Compliance"
          title="The KYC register"
          description="Controls for the wallet that holds AGENT_ROLE. Registered wallets are the only ones that can hold the certificate."
        />
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="container pb-24">
        <PageHeader
          kicker="Compliance"
          title="The KYC register"
          description="The certificate follows ERC-3643: every mint and every transfer checks this register first. An agent records the result of the off-chain KYC here."
          aside={
            <a
              href={`https://sepolia.etherscan.io/address/${CONTRACTS.registry}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[13px] text-muted-foreground hover:text-forest"
            >
              {compactAddress(CONTRACTS.registry)} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          }
        />

        {!roleLoading && !isAgent && (
          <Reveal className="mb-8 flex items-start gap-3 rounded-[20px] bg-amber-soft px-6 py-5 text-[13px] text-amber">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-semibold">This wallet does not hold AGENT_ROLE.</span> You can look wallets up, but
              the contract will reject any change from it.
            </p>
          </Reveal>
        )}

        <Reveal delay={0.05}>
          <KeyFigures
            figures={[
              {
                label: "Registered investors",
                lead: true,
                value: `${investors.data ?? 0n}`,
                note: "Wallets allowed to hold the certificate",
              },
              { label: "Certificates issued", value: formatIDRX(issue.supply), note: "SUKUK1 in circulation" },
              { label: "Principal", value: `${formatIDRX(issue.principal)} IDRX`, note: "Backing those certificates" },
              {
                label: "Your role",
                value: isAgent ? "Agent" : "Read only",
                note: isAgent ? "You can register and freeze" : "Ask an admin for AGENT_ROLE",
              },
            ]}
          />
        </Reveal>

        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <Panel title="Look up a wallet" description="Check its KYC status, balance and freezes." className="lg:col-span-5" delay={0.05}>
            <div>
              <label htmlFor="wallet" className="text-[13px] font-medium text-ink">
                Wallet address
              </label>
              <div className="relative mt-2">
                <input
                  id="wallet"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="0x…"
                  spellCheck={false}
                  className="field pr-11 font-mono text-[15px]"
                />
                <Search className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              </div>
            </div>

            {!lookup.valid ? (
              <p className="mt-5 rounded-xl bg-mist px-4 py-3 text-[13px] text-muted-foreground">
                Paste a full address to see its status.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                <div
                  className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px] font-semibold ${
                    lookup.isVerified ? "bg-mint text-forest-deep" : "bg-amber-soft text-amber"
                  }`}
                >
                  {lookup.isVerified ? (
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ShieldX className="h-4 w-4" aria-hidden="true" />
                  )}
                  {lookup.isVerified ? "Verified and able to hold" : lookup.registered ? "Registered but restricted" : "Not registered"}
                </div>
                <dl className="space-y-2 text-[13px]">
                  {[
                    ["Country", lookup.registered ? countryName(lookup.country) : "Not set"],
                    ["Certificates", formatIDRX(lookup.balance)],
                    ["Wallet frozen", lookup.walletFrozen ? "Yes" : "No"],
                    ["Tokens frozen", formatIDRX(lookup.frozenTokens)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="figure text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </Panel>

          <div className="space-y-8 lg:col-span-7">
            <Panel title="Register or remove" description="Records the off-chain KYC result on-chain." delay={0.1}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="country" className="text-[13px] font-medium text-ink">
                    Country
                  </label>
                  <select
                    id="country"
                    value={country}
                    onChange={(e) => setCountry(Number(e.target.value))}
                    className="field mt-2 font-sans"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Press>
                    <button
                      type="button"
                      disabled={!lookup.valid || !isAgent || lookup.registered || busy}
                      onClick={() => run(() => actions.registerIdentity(target, country))}
                      className="btn btn-primary"
                    >
                      Register wallet
                    </button>
                  </Press>
                  <Press>
                    <button
                      type="button"
                      disabled={!lookup.valid || !isAgent || !lookup.registered || busy}
                      onClick={() => run(() => actions.deleteIdentity(target))}
                      className="btn btn-ghost"
                    >
                      Remove
                    </button>
                  </Press>
                </div>
              </div>
            </Panel>

            <Panel title="Freeze controls" description="Block a whole wallet, or lock part of a balance in place." delay={0.15}>
              <div className="space-y-5">
                <div className="flex flex-wrap gap-3">
                  <Press>
                    <button
                      type="button"
                      disabled={!lookup.valid || !isAgent || busy}
                      onClick={() => run(() => actions.setAddressFrozen(target, !lookup.walletFrozen))}
                      className="btn btn-soft"
                    >
                      {lookup.walletFrozen ? "Unfreeze wallet" : "Freeze wallet"}
                    </button>
                  </Press>
                </div>

                <div className="border-t border-line pt-5">
                  <Field
                    id="freeze"
                    label="Partial freeze"
                    unit="SUKUK1"
                    value={freezeAmount}
                    onChange={setFreezeAmount}
                    hint={`Holds ${formatIDRX(lookup.balance)}, ${formatIDRX(lookup.frozenTokens)} frozen`}
                    onFill={lookup.balance > 0n ? () => setFreezeAmount(formatTokenAmount(lookup.balance)) : undefined}
                    fillLabel="All"
                  />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <Press>
                      <button
                        type="button"
                        disabled={!lookup.valid || !isAgent || parseTokenAmount(freezeAmount) <= 0n || busy}
                        onClick={() => run(() => actions.freezePartialTokens(target, parseTokenAmount(freezeAmount)))}
                        className="btn btn-ghost"
                      >
                        Freeze tokens
                      </button>
                    </Press>
                    <Press>
                      <button
                        type="button"
                        disabled={!lookup.valid || !isAgent || parseTokenAmount(freezeAmount) <= 0n || busy}
                        onClick={() => run(() => actions.unfreezePartialTokens(target, parseTokenAmount(freezeAmount)))}
                        className="btn btn-ghost"
                      >
                        Unfreeze tokens
                      </button>
                    </Press>
                  </div>
                </div>

                <TxNotice status={tx.status} hash={tx.hash} error={tx.error} />
              </div>
            </Panel>
          </div>
        </div>

        <Reveal delay={0.05} className="mt-8 rounded-[24px] bg-mist px-7 py-6 text-[13px] leading-relaxed text-muted-foreground">
          <p className="font-semibold text-ink">How this differs from a full ERC-3643 deployment</p>
          <p className="mt-1.5 max-w-[86ch]">
            A full T-REX stack derives verification from claims held on an ONCHAINID and signed by a trusted issuer. Here
            the agent asserts the KYC result directly. The interface matches the standard, so a full registry can replace
            this one later without touching the certificate.
          </p>
        </Reveal>
      </div>
    </PageTransition>
  );
}
