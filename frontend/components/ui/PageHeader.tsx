import { Reveal } from "./motion";

/** Title block shared by every inner page, so each one opens the same way. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
  aside,
}: {
  kicker: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-8 pb-10 pt-14 md:flex-row md:items-end md:justify-between md:pt-20">
      <Reveal className="max-w-2xl">
        <p className="kicker">{kicker}</p>
        <h1 className="display display-lg mt-5">{title}</h1>
        {description && <p className="lede mt-7 max-w-[52ch]">{description}</p>}
        {aside && <div className="mt-6">{aside}</div>}
      </Reveal>
      {actions && (
        <Reveal delay={0.1} className="flex shrink-0 flex-wrap gap-3">
          {actions}
        </Reveal>
      )}
    </header>
  );
}
