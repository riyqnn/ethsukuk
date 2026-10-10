"use client";

import { useQuery } from "@tanstack/react-query";
import { parseEventLogs, type Hex } from "viem";
import { usePublicClient } from "wagmi";
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

/**
 * Blockscout indexes Sepolia, so the whole history is one request with timestamps included,
 * instead of chunked eth_getLogs against a public RPC that prunes old logs. No API key, CORS open.
 * The indexer can trail the chain head by tens of minutes, so the most recent blocks are read
 * from the RPC as well and the two are merged.
 */
const INDEXER = "https://eth-sepolia.blockscout.com/api";
/** ~3 hours of Sepolia blocks: past the indexer's usual lag, and the most the default RPC serves per call. */
const RPC_TAIL = 1_000n;
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

type RawLog = {
  address: `0x${string}`;
  topics: [Hex, ...Hex[]];
  data: Hex;
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hex;
  transactionIndex: number;
  blockHash: null;
  removed: false;
  timestamp?: number;
};

const logId = (l: { transactionHash: Hex; logIndex: number }) => `${l.transactionHash}-${l.logIndex}`;

async function fromIndexer(): Promise<RawLog[]> {
  // ponytail: one page caps at 1,000 logs; paginate with `page`/`offset` if the issue outgrows it.
  const url = `${INDEXER}?module=logs&action=getLogs&address=${CONTRACTS.certificate}&fromBlock=${DEPLOY_BLOCK}&toBlock=latest`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Indexer responded ${res.status}`);
  const body: { message: string; result: IndexedLog[] | string } = await res.json();
  // "No logs found" comes back as status 0 with an empty result.
  if (!Array.isArray(body.result)) throw new Error(`Indexer: ${body.message}`);
  return body.result.map((l) => ({
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
}

/** Every certificate event, newest first: indexer history plus the latest blocks from the RPC. */
export function useVaultActivity() {
  const client = usePublicClient({ chainId: sepolia.id });

  return useQuery({
    queryKey: KEY,
    refetchInterval: 15_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      const fromRpc = async (): Promise<RawLog[]> => {
        if (!client) return [];
        const latest = await client.getBlockNumber();
        const from = latest - RPC_TAIL > DEPLOY_BLOCK ? latest - RPC_TAIL : DEPLOY_BLOCK;
        const logs = await client.getLogs({ address: CONTRACTS.certificate, fromBlock: from, toBlock: latest });
        return logs.map((l) => ({
          address: CONTRACTS.certificate,
          topics: l.topics as [Hex, ...Hex[]],
          data: l.data,
          blockNumber: l.blockNumber,
          logIndex: l.logIndex,
          transactionHash: l.transactionHash,
          transactionIndex: l.transactionIndex,
          blockHash: null,
          removed: false,
        }));
      };

      const [indexed, recent] = await Promise.allSettled([fromIndexer(), fromRpc()]);
      if (indexed.status === "rejected" && recent.status === "rejected") throw indexed.reason;

      const byId = new Map<string, RawLog>();
      for (const l of indexed.status === "fulfilled" ? indexed.value : []) byId.set(logId(l), l);
      for (const l of recent.status === "fulfilled" ? recent.value : []) if (!byId.has(logId(l))) byId.set(logId(l), l);

      // Only logs the indexer has not seen yet need their block's timestamp.
      const untimed = [...new Set([...byId.values()].filter((l) => l.timestamp === undefined).map((l) => l.blockNumber))];
      const times = new Map<bigint, number>();
      if (client) {
        await Promise.all(
          untimed.map(async (n) => times.set(n, Number((await client.getBlock({ blockNumber: n })).timestamp))),
        );
      }

      const raw = [...byId.values()];
      const time = new Map(raw.map((l) => [logId(l), l.timestamp ?? times.get(l.blockNumber) ?? 0]));

      return parseEventLogs({ abi: CERTIFICATE_ABI, logs: raw })
        .map((l) => toItem(l, time.get(logId(l)) ?? 0))
        .filter((i): i is ActivityItem => i !== null)
        .sort((x, y) => (y.blockNumber === x.blockNumber ? 0 : y.blockNumber > x.blockNumber ? 1 : -1));
    },
  });
}
