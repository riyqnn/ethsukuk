"use client";

import { useQuery } from "@tanstack/react-query";
import { parseEventLogs, type Hex } from "viem";
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

/**
 * Blockscout indexes Sepolia, so the whole history is one request with timestamps included,
 * instead of chunked eth_getLogs plus a getBlock per event against a public RPC that prunes old logs.
 * No API key, CORS open.
 */
const INDEXER = "https://eth-sepolia.blockscout.com/api";
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
  timestamp: number,
): ActivityItem | null {
  const kind = log.eventName;
  if (!kind || !KINDS.includes(kind)) return null;

  const a = (log.args ?? {}) as Args;
  const base = {
    id: `${log.transactionHash}-${log.logIndex}`,
    kind: kind as ActivityKind,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    timestamp,
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

interface IndexedLog {
  topics: (Hex | null)[];
  data: Hex;
  blockNumber: Hex;
  timeStamp: Hex;
  logIndex: Hex;
  transactionHash: Hex;
  transactionIndex: Hex;
}

/** Every certificate event, newest first, from the Blockscout indexer. */
export function useVaultActivity() {
  return useQuery({
    queryKey: KEY,
    refetchInterval: 15_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      // ponytail: one page caps at 1,000 logs; paginate with `page`/`offset` if the issue outgrows it.
      const url = `${INDEXER}?module=logs&action=getLogs&address=${CONTRACTS.certificate}&fromBlock=${DEPLOY_BLOCK}&toBlock=latest`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Indexer responded ${res.status}`);
      const body: { status: string; message: string; result: IndexedLog[] | string } = await res.json();
      // "No logs found" comes back as status 0 with an empty result.
      if (!Array.isArray(body.result)) throw new Error(`Indexer: ${body.message}`);

      const raw = body.result.map((l) => ({
        address: CONTRACTS.certificate,
        topics: l.topics.filter((t): t is Hex => t !== null) as [Hex, ...Hex[]],
        data: l.data,
        blockNumber: BigInt(l.blockNumber),
        logIndex: Number(l.logIndex),
        transactionHash: l.transactionHash,
        transactionIndex: Number(l.transactionIndex),
        blockHash: null,
        removed: false,
        timestamp: Number(l.timeStamp),
      }));
      const time = new Map(raw.map((l) => [`${l.transactionHash}-${l.logIndex}`, l.timestamp]));

      return parseEventLogs({ abi: CERTIFICATE_ABI, logs: raw })
        .map((l) => toItem(l, time.get(`${l.transactionHash}-${l.logIndex}`) ?? 0))
        .filter((i): i is ActivityItem => i !== null)
        .sort((x, y) => (y.blockNumber === x.blockNumber ? 0 : y.blockNumber > x.blockNumber ? 1 : -1));
    },
  });
}
