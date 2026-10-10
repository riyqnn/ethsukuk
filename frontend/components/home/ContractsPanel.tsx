"use client";

import { Copy } from "lucide-react";

export function ContractsMonoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-divider text-xs">
      <span className="text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
      <div className="flex items-center gap-3">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="font-mono text-primary font-medium hover:underline">
            {value}
          </a>
        ) : (
          <span className="font-mono text-primary font-medium">{value}</span>
        )}
        <button
          onClick={() => navigator.clipboard.writeText(value.length > 10 ? value : "")}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-divider"
          title="Copy Address"
          aria-label={`Copy ${label} address`}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}