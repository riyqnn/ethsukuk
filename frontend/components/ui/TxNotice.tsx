"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ExternalLink, Loader2 } from "lucide-react";
import type { TxStatus } from "@/lib/contracts";

const COPY: Partial<Record<TxStatus, string>> = {
  approving: "Approve the IDRX allowance in your wallet (step 1 of 2)",
  awaiting_signature: "Confirm the transaction in your wallet",
  pending: "Waiting for the block to be mined",
  confirmed: "Confirmed on Sepolia",
};

/** Live status of one wallet transaction, including the reverted case. */
export function TxNotice({ status, hash, error }: { status: TxStatus; hash: string; error: string }) {
  return (
    <AnimatePresence mode="wait">
      {status !== "idle" && (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          role="status"
          className={`rounded-[10px] px-4 py-3 text-[13px] ${
            status === "failed"
              ? "bg-danger-soft text-danger"
              : status === "confirmed"
                ? "bg-mint text-forest-deep"
                : "bg-mist text-ink"
          }`}
        >
          <p className="flex items-start gap-2 font-medium">
            {status === "failed" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : status === "confirmed" ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            )}
            <span className="break-words">{status === "failed" ? error || "Transaction failed." : COPY[status]}</span>
          </p>
          {hash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${hash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-mono text-xs underline-offset-4 hover:underline"
            >
              View on Etherscan <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
