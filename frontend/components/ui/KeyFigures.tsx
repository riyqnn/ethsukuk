import { Skeleton } from "./Skeleton";

export interface Figure {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  loading?: boolean;
  /** The figure the page is about. Set larger so the row has a reading order. */
  lead?: boolean;
}

export function KeyFigures({ figures }: { figures: Figure[] }) {
  return (
    <dl className="panel grid grid-cols-1 overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
      {figures.map((f, i) => (
        <div
          key={f.label}
          className={`relative px-6 py-6 ${i > 0 ? "border-t border-line sm:border-t-0" : ""} ${
            i % 2 === 1 ? "sm:border-l sm:border-line" : ""
          } ${i >= 2 ? "sm:border-t sm:border-line lg:border-t-0" : ""} ${
            i === 2 ? "lg:border-l lg:border-line" : ""
          } ${f.lead ? "bg-mist" : ""}`}
        >
          <dt className="label">{f.label}</dt>
          <dd className={`figure mt-3 flex min-h-8 items-center font-medium text-ink ${f.lead ? "text-[1.75rem] leading-none" : "text-xl leading-none"}`}>
            {f.loading ? <Skeleton className="h-7 w-32" /> : f.value}
          </dd>
          {f.note && <dd className="mt-3 text-[13px] leading-snug text-muted-foreground">{f.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
