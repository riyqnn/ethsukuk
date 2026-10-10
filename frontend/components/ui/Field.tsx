/** Numeric amount input with a unit and an optional one-tap fill. */
export function Field({
  id,
  label,
  value,
  onChange,
  placeholder = "0.00",
  unit,
  hint,
  onFill,
  fillLabel = "Max",
  step = "any",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
  hint?: React.ReactNode;
  onFill?: () => void;
  fillLabel?: string;
  step?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {hint && <span className="text-right text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`field ${unit ? "pr-28" : ""}`}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-2">
          {unit && <span className="font-mono text-xs text-muted-foreground">{unit}</span>}
          {onFill && (
            <button
              type="button"
              onClick={onFill}
              className="rounded-full bg-mint px-2.5 py-1 text-xs font-semibold text-forest-deep transition-colors hover:bg-mint-2"
            >
              {fillLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
