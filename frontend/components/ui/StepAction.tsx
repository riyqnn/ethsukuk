import { Check, Minus } from "lucide-react";
import { phaseLabel } from "@/lib/formatters";
import { Reveal } from "./motion";

/**
 * One role-gated contract call. `ready` is whether the issue's current phase allows it, so the card
 * that can act right now is the one that stands out.
 */
export function StepAction({
  step,
  title,
  call,
  description,
  requires,
  phase,
  currentLabel,
  ready,
  checks,
  children,
  delay = 0,
}: {
  step: string;
  title: string;
  call: string;
  description: string;
  requires: string;
  phase: number;
  /** Overrides the phase name, for the moment before it has loaded. */
  currentLabel?: string;
  ready: boolean;
  checks?: { label: string; ok: boolean }[];
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Reveal
      delay={delay}
      className={`flex h-full flex-col rounded-[24px] border p-7 transition-colors duration-500 ${
        ready ? "border-mint-3 bg-white shadow-[0_28px_60px_-44px_#16603f80]" : "border-line bg-mist"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="figure text-xs text-muted-foreground">Step {step}</span>
        <span className={`chip ${ready ? "bg-pistachio text-forest-deep" : "bg-white text-muted-foreground ring-1 ring-line"}`}>
          {ready ? "Callable now" : `Needs ${requires}`}
        </span>
      </div>
      <h2 className="title mt-4 text-2xl">{title}</h2>
      <code className="mt-1 font-mono text-[13px] text-forest">{call}</code>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>

      {checks && (
        <ul
          className={`mt-5 space-y-2 rounded-2xl p-4 text-[13px] ${ready ? "bg-mist" : "bg-white"}`}
          aria-label="On-chain preconditions"
        >
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                  c.ok ? "bg-forest text-white" : "bg-white text-muted-foreground ring-1 ring-line"
                }`}
                aria-hidden="true"
              >
                {c.ok ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              </span>
              <span className={c.ok ? "text-ink" : "text-muted-foreground"}>{c.label}</span>
              <span className="sr-only">{c.ok ? "met" : "not met"}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-6">
        <p className="mb-4 text-xs text-muted-foreground">
          Issue is <span className="font-medium text-ink">{currentLabel ?? phaseLabel(phase)}</span>
        </p>
        {children}
      </div>
    </Reveal>
  );
}
