import { Skeleton } from "./Skeleton";

export function StatBlock({
  numeral,
  label,
  value,
  loading,
  mono,
  color,
}: {
  numeral: string;
  label: string;
  value: string;
  loading?: boolean;
  mono?: boolean;
  color?: string;
}) {
  return (
    <div className="space-y-1.5 p-4 rounded-lg bg-surface border">
      <span className="numeral">{numeral}</span>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      {loading ? (
        <Skeleton className="h-7 w-28" />
      ) : (
        <p className={`text-xl md:text-2xl font-bold tracking-tight text-foreground ${mono ? "font-mono" : ""} ${color ?? ""}`}>
          {value}
        </p>
      )}
    </div>
  );
}