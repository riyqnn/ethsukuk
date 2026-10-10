import Safe from "@safe-global/protocol-kit";
import SafeApiKit from "@safe-global/api-kit";
import { encodeFunctionData, getAddress } from "viem";
import { CERTIFICATE_ABI } from "@/contracts/abis";
import { CONTRACTS, ADDRESSES } from "@/contracts/addresses";

const SEPOLIA_CHAIN_ID = 11155111n;
const SEPOLIA_SAFE_TX_SERVICE_URL = "https://safe-transaction-sepolia.safe.global/api";

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  providers?: Eip1193Provider[];
}

export interface WindowWithEthereum {
  ethereum?: Eip1193Provider;
}

export interface SafePendingTransaction {
  safeTxHash: string;
  to: string;
  value: string;
  data?: string | null;
  operation: number;
  confirmations?: Array<{
    owner: string;
    submissionDate: string;
    signature: string;
  }>;
}

export interface SafeInfo {
  address: string;
  owners: string[];
  threshold: number;
  nonce: number;
}

export function getEvmProvider(passedProvider?: Eip1193Provider): Eip1193Provider | undefined {
  if (passedProvider && passedProvider.isMetaMask && !passedProvider.isPhantom) {
    return passedProvider;
  }
  if (typeof window !== "undefined") {
    const win = window as unknown as WindowWithEthereum;
    if (win.ethereum) {
      const eth = win.ethereum;
      if (Array.isArray(eth.providers)) {
        const metaMask = eth.providers.find((p) => p.isMetaMask && !p.isPhantom);
        if (metaMask) return metaMask;
      }
      return eth;
    }
  }
  return passedProvider;
}

export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const errObj = e as Record<string, unknown>;
    if (typeof errObj.shortMessage === "string") return errObj.shortMessage;
    if (typeof errObj.message === "string") return errObj.message;
  }
  return "An unexpected error occurred.";
}

export async function fetchSafeInfo(): Promise<SafeInfo | null> {
  try {
    const apiKit = new SafeApiKit({
      chainId: SEPOLIA_CHAIN_ID,
      txServiceUrl: SEPOLIA_SAFE_TX_SERVICE_URL,
    });
    const info = await apiKit.getSafeInfo(getAddress(ADDRESSES.auditorMultisig));
    return {
      address: info.address,
      owners: info.owners,
      threshold: info.threshold,
      nonce: Number(info.nonce),
    };
  } catch {
    return null;
  }
}

export async function proposeSafeTransaction({
  functionName,
  provider: initialProvider,
  signerAddress,
}: {
  functionName: "closeSubscription" | "openRedemption";
  provider?: Eip1193Provider;
  signerAddress: string;
}): Promise<{ safeTxHash: string; signature: string }> {
  const provider = getEvmProvider(initialProvider);
  let activeSigner = signerAddress;

  // 0. Ensure provider account authorization and retrieve authorized account address
  if (provider && typeof provider.request === "function") {
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (Array.isArray(accounts) && accounts.length > 0 && accounts[0]) {
        activeSigner = accounts[0];
      }
    } catch (err) {
      console.warn("eth_requestAccounts notice:", err);
    }
  }

  const checksummedSafe = getAddress(ADDRESSES.auditorMultisig);
  const checksummedSigner = getAddress(activeSigner);
  const checksummedTarget = getAddress(CONTRACTS.certificate);

  // 1. Encode contract function call
  const callData = encodeFunctionData({
    abi: CERTIFICATE_ABI,
    functionName,
    args: [],
  });

  // 2. Initialize Safe Protocol Kit with EVM provider and active signer
  const safeSdk = await Safe.init({
    provider: provider as unknown as string,
    signer: checksummedSigner,
    safeAddress: checksummedSafe,
  });

  // 3. Create Safe Transaction
  const safeTransaction = await safeSdk.createTransaction({
    transactions: [
      {
        to: checksummedTarget,
        data: callData,
        value: "0",
      },
    ],
  });

  // 4. Sign the safeTransaction using signTransaction (Official Safe Protocol Kit method)
  const signedSafeTransaction = await safeSdk.signTransaction(safeTransaction);
  const safeTxHash = await safeSdk.getTransactionHash(signedSafeTransaction);

  // 5. Extract encoded signatures string formatted for Safe API Service
  const encodedSignature = signedSafeTransaction.encodedSignatures();

  // 6. Propose transaction to Sepolia Safe Transaction Service via Safe API Kit
  const apiKit = new SafeApiKit({
    chainId: SEPOLIA_CHAIN_ID,
    txServiceUrl: SEPOLIA_SAFE_TX_SERVICE_URL,
  });

  await apiKit.proposeTransaction({
    safeAddress: checksummedSafe,
    safeTransactionData: signedSafeTransaction.data,
    safeTxHash,
    senderAddress: checksummedSigner,
    senderSignature: encodedSignature,
  });

  return {
    safeTxHash,
    signature: encodedSignature,
  };
}

export async function fetchPendingSafeTransactions(): Promise<SafePendingTransaction[]> {
  try {
    const apiKit = new SafeApiKit({
      chainId: SEPOLIA_CHAIN_ID,
      txServiceUrl: SEPOLIA_SAFE_TX_SERVICE_URL,
    });
    const pendingTxs = await apiKit.getPendingTransactions(getAddress(ADDRESSES.auditorMultisig));
    return (pendingTxs?.results as unknown as SafePendingTransaction[]) || [];
  } catch {
    return [];
  }
}
