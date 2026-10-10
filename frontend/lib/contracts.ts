"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { ADDRESSES, CONTRACTS } from "@/contracts/addresses";
import { CERTIFICATE_ABI, IDRX_ABI, REGISTRY_ABI, SAFE_ABI } from "@/contracts/abis";

const chainId = sepolia.id;
const certificate = { address: CONTRACTS.certificate, abi: CERTIFICATE_ABI, chainId } as const;
const registry = { address: CONTRACTS.registry, abi: REGISTRY_ABI, chainId } as const;
const idrx = { address: CONTRACTS.idrx, abi: IDRX_ABI, chainId } as const;

/* -------------------------------------------------------------------------- */
/*  Mined writes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Like wagmi's `writeContractAsync`, but resolves only once the transaction is mined, and rejects
 * if it reverted. Needed so `approve` -> `deposit` sequences do not race the allowance, and so the
 * UI never reports success early. Every on-chain read is refreshed afterwards.
 */
function useMinedWrite() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId });
  const queryClient = useQueryClient();

  const write = useCallback(
    async (...args: Parameters<typeof writeContractAsync>): Promise<`0x${string}`> => {
      const hash = await writeContractAsync(...args);
      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      if (receipt?.status === "reverted") throw new Error("Transaction reverted on-chain.");
      await queryClient.invalidateQueries();
      return hash;
    },
    [writeContractAsync, publicClient, queryClient],
  );

  return write;
}

/* -------------------------------------------------------------------------- */
/*  Issue state                                                               */
/* -------------------------------------------------------------------------- */

export interface IssueTerms {
  quota: bigint;
  denomination: bigint;
  tenor: bigint;
  couponRate: bigint;
  couponInterval: bigint;
}

/** Everything about the issue itself, in one multicall. */
export function useIssue() {
  const result = useReadContracts({
    contracts: [
      { ...certificate, functionName: "phase" },
      { ...certificate, functionName: "terms" },
      { ...certificate, functionName: "totalAssets" },
      { ...certificate, functionName: "totalSupply" },
      { ...certificate, functionName: "issueDate" },
      { ...certificate, functionName: "maturityDate" },
      { ...certificate, functionName: "nextCouponDate" },
      { ...certificate, functionName: "couponsPaid" },
      { ...certificate, functionName: "deployedToTreasury" },
      { ...certificate, functionName: "couponPool" },
      { ...certificate, functionName: "expectedCouponAmount" },
      { ...certificate, functionName: "paused" },
      { ...certificate, functionName: "isin" },
      { ...certificate, functionName: "pendingRedemptionAssets" },
    ],
    query: { refetchInterval: 20_000 },
  });

  const d = result.data;
  const raw = d?.[1]?.result as readonly bigint[] | undefined;
  const terms: IssueTerms = {
    quota: raw?.[0] ?? 0n,
    denomination: raw?.[1] ?? 0n,
    tenor: raw?.[2] ?? 0n,
    couponRate: raw?.[3] ?? 0n,
    couponInterval: raw?.[4] ?? 0n,
  };

  const num = (i: number) => (d?.[i]?.result as bigint | undefined) ?? 0n;

  return {
    phase: Number((d?.[0]?.result as number | undefined) ?? 0),
    terms,
    principal: num(2),
    supply: num(3),
    issueDate: num(4),
    maturityDate: num(5),
    nextCouponDate: num(6),
    couponsPaid: num(7),
    deployedToTreasury: num(8),
    couponPool: num(9),
    expectedCoupon: num(10),
    paused: (d?.[11]?.result as boolean | undefined) ?? false,
    isin: (d?.[12]?.result as string | undefined) ?? "",
    pendingRedemption: num(13),
    isLoading: result.isLoading,
    isError: result.isError,
    refetch: result.refetch,
  };
}

/** Everything about one wallet's position, in one multicall. */
export function usePosition(account?: `0x${string}`) {
  const enabled = !!account;
  const result = useReadContracts({
    contracts: [
      { ...certificate, functionName: "balanceOf", args: [account ?? "0x0"] },
      { ...certificate, functionName: "claimableCoupon", args: [account ?? "0x0"] },
      { ...certificate, functionName: "couponClaimed", args: [account ?? "0x0"] },
      { ...certificate, functionName: "principalOf", args: [account ?? "0x0"] },
      { ...certificate, functionName: "pendingRedeemRequest", args: [0n, account ?? "0x0"] },
      { ...certificate, functionName: "claimableRedeemRequest", args: [0n, account ?? "0x0"] },
      { ...certificate, functionName: "maxWithdraw", args: [account ?? "0x0"] },
      { ...certificate, functionName: "getFrozenTokens", args: [account ?? "0x0"] },
      { ...certificate, functionName: "isFrozen", args: [account ?? "0x0"] },
      { ...idrx, functionName: "balanceOf", args: [account ?? "0x0"] },
      { ...registry, functionName: "isVerified", args: [account ?? "0x0"] },
      { ...registry, functionName: "investorCountry", args: [account ?? "0x0"] },
    ],
    query: { enabled, refetchInterval: 20_000 },
  });

  const d = result.data;
  const num = (i: number) => (d?.[i]?.result as bigint | undefined) ?? 0n;

  return {
    shares: num(0),
    claimableCoupon: num(1),
    couponClaimed: num(2),
    principal: num(3),
    pendingRedeem: num(4),
    claimableRedeem: num(5),
    claimableAssets: num(6),
    frozenTokens: num(7),
    walletFrozen: (d?.[8]?.result as boolean | undefined) ?? false,
    idrxBalance: num(9),
    isVerified: (d?.[10]?.result as boolean | undefined) ?? false,
    country: Number((d?.[11]?.result as number | undefined) ?? 0),
    isLoading: enabled && result.isLoading,
    refetch: result.refetch,
  };
}

/** True when `account` holds `role` on the certificate. */
export function useHasRole(role: "PROTOCOL_ROLE" | "AUDITOR_ROLE" | "AGENT_ROLE", account?: `0x${string}`) {
  const hash = useReadContract({ ...certificate, functionName: role });
  const result = useReadContract({
    ...certificate,
    functionName: "hasRole",
    args: hash.data && account ? [hash.data as `0x${string}`, account] : undefined,
    query: { enabled: !!hash.data && !!account },
  });
  return { ...result, data: result.data as boolean | undefined };
}

/** Owners and signature threshold read from the auditor Safe itself. */
export function useSafePolicy() {
  const threshold = useReadContract({
    address: ADDRESSES.auditorMultisig,
    abi: SAFE_ABI,
    functionName: "getThreshold",
    chainId,
  });
  const owners = useReadContract({
    address: ADDRESSES.auditorMultisig,
    abi: SAFE_ABI,
    functionName: "getOwners",
    chainId,
  });
  return {
    threshold: threshold.data as bigint | undefined,
    owners: owners.data as readonly `0x${string}`[] | undefined,
    isLoading: threshold.isLoading || owners.isLoading,
    isError: threshold.isError || owners.isError,
  };
}

/** IDRX held by the treasury Safe, i.e. what is currently funding the project. */
export function useTreasuryBalance() {
  const result = useReadContract({
    ...idrx,
    functionName: "balanceOf",
    args: [ADDRESSES.treasurySafe],
    query: { refetchInterval: 20_000 },
  });
  return { ...result, data: result.data as bigint | undefined };
}

export function useInvestorCount() {
  const result = useReadContract({ ...registry, functionName: "investorCount" });
  return { ...result, data: result.data as bigint | undefined };
}

/* -------------------------------------------------------------------------- */
/*  Writes                                                                    */
/* -------------------------------------------------------------------------- */

/** Investor actions: subscribe, claim profit, request and claim redemption. */
export function useInvestorActions() {
  const write = useMinedWrite();
  return {
    approveIDRX: (amount: bigint) =>
      write({ ...idrx, functionName: "approve", args: [CONTRACTS.certificate, amount] }),
    deposit: (assets: bigint, receiver: `0x${string}`) =>
      write({ ...certificate, functionName: "deposit", args: [assets, receiver] }),
    claimCoupon: (receiver: `0x${string}`) =>
      write({ ...certificate, functionName: "claimCoupon", args: [receiver] }),
    requestRedeem: (shares: bigint, owner: `0x${string}`) =>
      write({ ...certificate, functionName: "requestRedeem", args: [shares, owner, owner] }),
    redeem: (shares: bigint, receiver: `0x${string}`, controller: `0x${string}`) =>
      write({ ...certificate, functionName: "redeem", args: [shares, receiver, controller] }),
    transfer: (to: `0x${string}`, amount: bigint) =>
      write({ ...certificate, functionName: "transfer", args: [to, amount] }),
  };
}

/** PROTOCOL_ROLE actions. */
export function useProtocolActions() {
  const write = useMinedWrite();
  return {
    openIssue: (quota: bigint, denomination: bigint, tenor: bigint, rateBps: bigint, interval: bigint) =>
      write({ ...certificate, functionName: "openIssue", args: [quota, denomination, tenor, rateBps, interval] }),
    allocateToTreasury: (amount: bigint) =>
      write({ ...certificate, functionName: "allocateToTreasury", args: [amount] }),
    returnFromTreasury: (amount: bigint) =>
      write({ ...certificate, functionName: "returnFromTreasury", args: [amount] }),
    approveIDRX: (amount: bigint) =>
      write({ ...idrx, functionName: "approve", args: [CONTRACTS.certificate, amount] }),
    fundCoupon: (amount: bigint) => write({ ...certificate, functionName: "fundCoupon", args: [amount] }),
    markMatured: () => write({ ...certificate, functionName: "markMatured", args: [] }),
    fulfillRedeem: (controllers: readonly `0x${string}`[]) =>
      write({ ...certificate, functionName: "fulfillRedeem", args: [controllers] }),
    closeIssue: () => write({ ...certificate, functionName: "closeIssue", args: [] }),
    pause: () => write({ ...certificate, functionName: "pause", args: [] }),
    unpause: () => write({ ...certificate, functionName: "unpause", args: [] }),
  };
}

/** AGENT_ROLE actions: the ERC-3643 compliance desk. */
export function useAgentActions() {
  const write = useMinedWrite();
  return {
    registerIdentity: (investor: `0x${string}`, country: number) =>
      write({
        ...registry,
        functionName: "registerIdentity",
        args: [investor, "0x0000000000000000000000000000000000000000", country],
      }),
    deleteIdentity: (investor: `0x${string}`) =>
      write({ ...registry, functionName: "deleteIdentity", args: [investor] }),
    setAddressFrozen: (investor: `0x${string}`, frozen: boolean) =>
      write({ ...certificate, functionName: "setAddressFrozen", args: [investor, frozen] }),
    freezePartialTokens: (investor: `0x${string}`, amount: bigint) =>
      write({ ...certificate, functionName: "freezePartialTokens", args: [investor, amount] }),
    unfreezePartialTokens: (investor: `0x${string}`, amount: bigint) =>
      write({ ...certificate, functionName: "unfreezePartialTokens", args: [investor, amount] }),
    forcedTransfer: (from: `0x${string}`, to: `0x${string}`, amount: bigint) =>
      write({ ...certificate, functionName: "forcedTransfer", args: [from, to, amount] }),
    recoveryAddress: (lost: `0x${string}`, next: `0x${string}`) =>
      write({ ...certificate, functionName: "recoveryAddress", args: [lost, next] }),
  };
}

/** Reads one arbitrary wallet's compliance state, for the agent desk. */
export function useComplianceLookup(account?: `0x${string}`) {
  const valid = !!account && /^0x[0-9a-fA-F]{40}$/.test(account);
  const result = useReadContracts({
    contracts: [
      { ...registry, functionName: "isVerified", args: [account ?? "0x0"] },
      { ...registry, functionName: "contains", args: [account ?? "0x0"] },
      { ...registry, functionName: "investorCountry", args: [account ?? "0x0"] },
      { ...certificate, functionName: "balanceOf", args: [account ?? "0x0"] },
      { ...certificate, functionName: "isFrozen", args: [account ?? "0x0"] },
      { ...certificate, functionName: "getFrozenTokens", args: [account ?? "0x0"] },
    ],
    query: { enabled: valid },
  });

  const d = result.data;
  return {
    valid,
    isVerified: (d?.[0]?.result as boolean | undefined) ?? false,
    registered: (d?.[1]?.result as boolean | undefined) ?? false,
    country: Number((d?.[2]?.result as number | undefined) ?? 0),
    balance: (d?.[3]?.result as bigint | undefined) ?? 0n,
    walletFrozen: (d?.[4]?.result as boolean | undefined) ?? false,
    frozenTokens: (d?.[5]?.result as bigint | undefined) ?? 0n,
    isLoading: valid && result.isLoading,
    refetch: result.refetch,
  };
}

/* -------------------------------------------------------------------------- */
/*  Transaction lifecycle helper                                               */
/* -------------------------------------------------------------------------- */

export type TxStatus = "idle" | "approving" | "awaiting_signature" | "pending" | "confirmed" | "failed";

export function useTxState() {
  const [status, setStatus] = useState<TxStatus>("idle");
  const [hash, setHash] = useState<string>("");
  const [error, setError] = useState<string>("");
  return {
    status,
    setStatus,
    hash,
    setHash,
    error,
    setError,
    reset: () => {
      setStatus("idle");
      setHash("");
      setError("");
    },
  };
}
