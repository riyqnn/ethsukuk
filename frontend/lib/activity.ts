"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { sepolia } from "wagmi/chains";
import { CONTRACTS, DEPLOY_BLOCK } from "@/contracts/addresses";
import { CERTIFICATE_ABI } from "@/contracts/abis";

export type ActivityKind =
  | "IssueOpened"
  | "Deposit"
  | "SubscriptionClosed"
  | "AllocatedToTreasury"
  | "ReturnedFromTreasury"
  | "CouponFunded"
  | "CouponClaimed"
  | "Matured"
  | "RedemptionOpened"
  | "RedeemRequest"
  | "RedeemFulfilled"
  | "Withdraw"
  | "IssueClosed"
  | "AddressFrozen"
  | "RecoverySuccess"
  | "Paused"
  | "Unpaused";

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  txHash: `0x${string}`;
  blockNumber: bigint;
  timestamp: number;
  /** The investor or role the entry is about, when there is one. */
  account?: `0x${string}`;
  /** IDRX moved, where the event moves IDRX. */
  amount?: bigint;
  /** Certificates moved, where the event moves certificates. */
  shares?: bigint;
}

const KINDS: readonly string[] = [
  "IssueOpened",
  "Deposit",
  "SubscriptionClosed",
  "AllocatedToTreasury",
  "ReturnedFromTreasury",
  "CouponFunded",
  "CouponClaimed",
  "Matured",
  "RedemptionOpened",
  "RedeemRequest",
  "RedeemFulfilled",
  "Withdraw",
  "IssueClosed",
  "AddressFrozen",
  "RecoverySuccess",
  "Paused",
  "Unpaused",
];

const LOG_RANGE = 50_000n; // stay under public-RPC getLogs limits
const KEY = ["certificate-activity", CONTRACTS.certificate] as const;

type Args = Record<string, unknown>;

function toItem(
  log: {
    eventName?: string;
    args?: unknown;
    transactionHash: `0x${string}`;
    blockNumber: bigint;
    logIndex: number;
  },
  timestamps: Map<bigint, number>,
): ActivityItem | null {
  const kind = log.eventName;
  if (!kind || !KINDS.includes(kind)) return null;

  const a = (log.args ?? {}) as Args;
  const base = {
    id: `${log.transactionHash}-${log.logIndex}`,
    kind: kind as ActivityKind,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    timestamp: timestamps.get(log.blockNumber) ?? 0,
  };

  switch (kind) {
    case "Deposit":
      return { ...base, account: a.owner as `0x${string}`, amount: a.assets as bigint, shares: a.shares as bigint };
    case "Withdraw":
      return { ...base, account: a.owner as `0x${string}`, amount: a.assets as bigint, shares: a.shares as bigint };
    case "RedeemRequest":
      return { ...base, account: a.controller as `0x${string}`, shares: a.shares as bigint };
    case "RedeemFulfilled":
      return {
        ...base,
        account: a.controller as `0x${string}`,
        amount: a.assets as bigint,
        shares: a.shares as bigint,
      };
    case "CouponClaimed":
      return { ...base, account: a.holder as `0x${string}`, amount: a.amount as bigint };
    case "CouponFunded":
      return { ...base, amount: a.amount as bigint };
    case "AllocatedToTreasury":
      return { ...base, account: a.treasury as `0x${string}`, amount: a.amount as bigint };
    case "ReturnedFromTreasury":
      return { ...base, account: a.from as `0x${string}`, amount: a.amount as bigint };
    case "SubscriptionClosed":
      return { ...base, amount: a.issueVolume as bigint };
    case "IssueOpened":
      return { ...base, amount: a.quota as bigint };
    case "AddressFrozen":
      return { ...base, account: a.holder as `0x${string}` };
    case "RecoverySuccess":
      return { ...base, account: a.lostWallet as `0x${string}` };
    default:
      return base;
  }
}

/** Every certificate event, newest first, read straight from Sepolia logs. */
export function useVaultActivity() {
  const client = usePublicClient({ chainId: sepolia.id });
  const queryClient = useQueryClient();

  // A new event on the certificate refetches at once; the interval is the fallback.
  useWatchContractEvent({
    address: CONTRACTS.certificate,
    abi: CERTIFICATE_ABI,
    chainId: sepolia.id,
    onLogs: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  return useQuery({
    queryKey: KEY,
    enabled: !!client,
    refetchInterval: 30_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!client) return [];
      const latest = await client.getBlockNumber();
      const logs = [];
      for (let from = DEPLOY_BLOCK; from <= latest; from += LOG_RANGE) {
        const to = from + LOG_RANGE - 1n < latest ? from + LOG_RANGE - 1n : latest;
        logs.push(
          ...(await client.getContractEvents({
            address: CONTRACTS.certificate,
            abi: CERTIFICATE_ABI,
            fromBlock: from,
            toBlock: to,
          })),
        );
      }

      const blocks = [...new Set(logs.map((l) => l.blockNumber))];
      const timestamps = new Map<bigint, number>();
      await Promise.all(
        blocks.map(async (blockNumber) => {
          const block = await client.getBlock({ blockNumber });
          timestamps.set(blockNumber, Number(block.timestamp));
        }),
      );

      return logs
        .map((l) => toItem(l, timestamps))
        .filter((i): i is ActivityItem => i !== null)
        .sort((x, y) => (y.blockNumber === x.blockNumber ? 0 : y.blockNumber > x.blockNumber ? 1 : -1));
    },
  });
}
