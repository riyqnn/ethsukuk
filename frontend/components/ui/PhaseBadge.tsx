import { phaseLabel, phaseTone } from "@/lib/formatters";

/** The issue's current lifecycle phase, read from the contract. */
export function PhaseBadge({ phase }: { phase: number }) {
  return (
    <span className={`chip ${phaseTone(phase)}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {phaseLabel(phase)}
    </span>
  );
}
