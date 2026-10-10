import { Reveal } from "./motion";

/** White card with a titled header row. Content decides the height. */
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "p-6",
  delay = 0,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className={`panel overflow-hidden ${className}`}>
      {title && (
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="title text-lg">{title}</h2>
            {description && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </Reveal>
  );
}
