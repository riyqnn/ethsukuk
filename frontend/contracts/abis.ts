import certificateAbiJson from "@/contracts/abis/SukukCertificate.json";
import registryAbiJson from "@/contracts/abis/InvestorRegistry.json";
import idrxAbiJson from "@/contracts/abis/MockIDRX.json";
import type { Abi } from "viem";

export const CERTIFICATE_ABI = (certificateAbiJson as { abi: Abi }).abi;
export const REGISTRY_ABI = (registryAbiJson as { abi: Abi }).abi;
export const IDRX_ABI = (idrxAbiJson as { abi: Abi }).abi;

/** Minimum Safe surface the UI reads: who signs, and how many signatures are required. */
export const SAFE_ABI = [
  { type: "function", name: "getThreshold", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getOwners", stateMutability: "view", inputs: [], outputs: [{ type: "address[]" }] },
] as const satisfies Abi;
