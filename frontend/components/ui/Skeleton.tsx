export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton inline-block ${className}`} aria-hidden="true" />;
}
