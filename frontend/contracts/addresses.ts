export const SEPOLIA_CHAIN_ID = 11155111;

/** Block the certificate was deployed in; lower bound for event queries. */
export const DEPLOY_BLOCK = 11884017n;

export const CONTRACTS = {
  idrx: "0x6D5f64e820Dd2342F1D08aF439A2902793869e74" as const,
  certificate: "0x185e3524Ea9A638122a7d3A6104aCD9112Fce3F7" as const,
  registry: "0x016160DE3042C61Db79f1A8af9b317689289fD5b" as const,
} as const;

export const ADDRESSES = {
  protocolAdmin: "0x1cEdC27fc1351141c0231BFeD3E7caFA9bbb2238" as const,
  /** Wallets granted PROTOCOL_ROLE. The UI still checks hasRole() on-chain. */
  protocolAdmins: [
    "0x1cEdC27fc1351141c0231BFeD3E7caFA9bbb2238",
    "0xa189Be51cb780f0C26e3e161d73F69484d37de85",
  ] as const,
  /** Holds AUDITOR_ROLE: closes subscription and opens redemption. */
  auditorMultisig: "0x411E4A576d3cA579e8795559875D1F0684452801" as const,
  /** Custodies the principal deployed to the real-world project. */
  treasurySafe: "0x411E4A576d3cA579e8795559875D1F0684452801" as const,
} as const;

/** Lifecycle phases of SukukCertificate, in contract order. */
export const PHASE = {
  Subscription: 0,
  Active: 1,
  Matured: 2,
  Redeeming: 3,
  Closed: 4,
} as const;
