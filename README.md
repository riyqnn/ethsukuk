<div align="center">

# Sukuk

**Tokenized Islamic bonds on Ethereum: KYC-gated, Safe-audited, profit-sharing, redeemable.**

[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](rwa-sukuk-contracts/contracts)
[![Hardhat](https://img.shields.io/badge/Hardhat-tests%20passing-FFF100?logo=hardhat&logoColor=black)](rwa-sukuk-contracts/test)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)](frontend)
[![Network](https://img.shields.io/badge/network-Sepolia-627EEA?logo=ethereum)](#deployed-contracts-sepolia)

</div>

---

## Overview

A **Sukuk** is a Shariah-compliant certificate of ownership in a real-world asset or project. Holders
earn a share of the project's profit, not interest. Sukuk puts the full lifecycle of one Sukuk
issue on-chain:

1. Investors pass a **KYC gate** and subscribe with **IDRX** (Rupiah stablecoin).
2. They receive an on-chain **bond certificate**.
3. The principal funds a real-world project through a **Gnosis Safe** treasury.
4. **Profit is shared** every period and claimed per holder.
5. After maturity, the **principal is redeemed** asynchronously.

Every state change is public, every gate is enforced by role, and the critical transitions are
controlled by an independent auditor multisig.

## Features

- **Compliant by construction:** only KYC-registered wallets can hold or receive the certificate.
  Investors complete KYC themselves right after connecting a wallet; the agent role can still
  remove, freeze, force-transfer, and recover wallets.
- **Real bond semantics:** ISIN, denomination, issue volume, profit rate, issue and maturity dates
  are all readable on-chain.
- **Donation-proof accounting:** principal is tracked internally, so sending tokens directly
  to the contract cannot move the price.
- **Pull-based profit:** profit sits in a separate coupon pool and is claimed per holder. A
  transfer never carries someone else's unclaimed profit.
- **Two-key governance:** the issuer cannot close the subscription or open redemption alone.
  Those gates belong to an auditor Safe that administers its own role.
- **Role-based dashboard:** separate views for investors, the issuer, the auditor, and the
  compliance desk.

## Standards

| Standard | Role in Sukuk |
|---|---|
| **ERC-7092** | The certificate *is* the bond: ISIN, denomination, profit rate, maturity, `principalOf`. |
| **ERC-4626** | Accounting. 1 certificate = 1 unit of principal, held at 1:1 for the life of the issue. |
| **ERC-7540** | Asynchronous redemption: request → issuer settles → holder claims. |
| **ERC-3643** | Transfer rules and identity registry (reduced T-REX), with freeze and recovery. |
| **Gnosis Safe** | Auditor multisig gates the lifecycle; treasury Safe custodies deployed principal. |

## Architecture

```mermaid
flowchart LR
    Investor([Investor]) -- deposit IDRX --> Cert[SukukCertificate]
    Cert -- checks every transfer --> Reg[InvestorRegistry]
    Investor -- self-KYC --> Reg
    Agent([Compliance Agent]) -- remove / freeze --> Reg
    Protocol([Protocol Admin]) -- open issue / fund profit / settle --> Cert
    Auditor([Auditor Safe]) -- close subscription / open redemption --> Cert
    Cert -- allocate principal --> Treasury[(Treasury Safe)]
    Treasury -- real-world project --> Project[Project]
    Treasury -- return principal --> Cert
    Cert -- profit + principal --> Investor
```

### Lifecycle

```
Subscription ──▶ Active ──▶ Matured ──▶ Redeeming ──▶ Closed
```

| # | Who | Action |
|---|---|---|
| 1 | Investor (or agent) | `selfRegister(country)` · agent: `registerIdentity(investor, onchainId, country)` |
| 2 | Protocol | `openIssue(quota, denomination, tenor, couponRate, couponInterval)` |
| 3 | Investor | `deposit(assets, receiver)` |
| 4 | **Auditor Safe** | `closeSubscription()` → **Active**, tenor starts |
| 5 | Protocol | `allocateToTreasury(amount)` → funds the project |
| 6 | Protocol / Investor | `fundCoupon(amount)` each period, then `claimCoupon()` |
| 7 | Protocol | `returnFromTreasury(amount)`, `markMatured()` → **Matured** |
| 8 | **Auditor Safe** | `openRedemption()` → **Redeeming** |
| 9 | Investor | `requestRedeem(shares, controller, owner)` |
| 10 | Protocol | `fulfillRedeem(controllers)` |
| 11 | Investor | `redeem(shares, receiver, controller)` |

## Repository Structure

```
.
├── rwa-sukuk-contracts/        # Hardhat (TypeScript) smart contracts
│   ├── contracts/
│   │   ├── SukukCertificate.sol        # The bond certificate (7092 + 4626 + 7540 + 3643)
│   │   ├── compliance/InvestorRegistry.sol  # KYC identity registry
│   │   ├── MockIDRX.sol                # Testnet-only IDRX mock
│   │   ├── interfaces/                 # Standard interfaces
│   │   └── SukukVault.sol              # Earlier ERC-4626 vault, kept for reference
│   ├── scripts/                # Deploy + seed scripts
│   └── test/                   # Lifecycle, math, access control, security tests
└── frontend/                   # Next.js dApp (wagmi, viem, RainbowKit, Safe SDK)
    ├── app/                    # Vault, Portfolio, Ledger, Protocol, Auditor, Compliance, Admin
    ├── contracts/              # ABIs + deployed addresses
    └── lib/                    # Contract reads, formatters, Safe integration
```

## Dashboard

| Page | For | What it does |
|---|---|---|
| `/sukuk` | Investors | Self-KYC, issue terms, current phase, subscribe, claim profit, redeem |
| `/portfolio` | Investors | Your position and allocation |
| `/transactions` | Everyone | Full on-chain event ledger, filterable by wallet |
| `/protocol` | Everyone | How the contracts are wired, every call in order, deployed addresses |
| `/auditor` | Auditor Safe | Propose `closeSubscription` / `openRedemption` through the Safe |
| `/compliance` | Agent | KYC register and wallet lookup |
| `/admin` | Protocol | Run the issue: treasury, profit funding, settlement |

## Getting Started

### Prerequisites

- Node.js 20+
- A wallet with Sepolia ETH (for deployment and on-chain testing)

### 1. Smart contracts

```bash
cd rwa-sukuk-contracts
npm install
cp .env.example .env        # fill PRIVATE_KEY, RPC URLs, AUDITOR_MULTISIG, issue terms

npx hardhat compile
npx hardhat test            # full suite
```

Deploy to Sepolia and onboard demo investors (KYC + MockIDRX):

```bash
npm run deploy:certificate:sepolia
SEED_INVESTORS=0xabc...,0xdef... npm run seed:certificate:sepolia
```

> Production terms are a 3-year tenor with profit every 90 days. On a testnet, shorten
> `TENOR_SECONDS` and `COUPON_INTERVAL_SECONDS` in `.env` to walk the full lifecycle in one session.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local  # NEXT_PUBLIC_SEPOLIA_RPC_URL, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). After a fresh deployment, update
`frontend/contracts/addresses.ts` with the new addresses.

## Deployed Contracts (Sepolia)

| Contract | Address |
|---|---|
| SukukCertificate | [`0x23649979067622de18B47bcE250864865fFb7296`](https://sepolia.etherscan.io/address/0x23649979067622de18B47bcE250864865fFb7296) |
| InvestorRegistry | [`0x27739678f24307Cf9fD47EE1239A5A3fEd9381f3`](https://sepolia.etherscan.io/address/0x27739678f24307Cf9fD47EE1239A5A3fEd9381f3) |
| MockIDRX | [`0x26071A9337090447C167A68A6a28057Eb1eDD570`](https://sepolia.etherscan.io/address/0x26071A9337090447C167A68A6a28057Eb1eDD570) |
| Auditor / Treasury Safe | [`0x411E4A576d3cA579e8795559875D1F0684452801`](https://sepolia.etherscan.io/address/0x411E4A576d3cA579e8795559875D1F0684452801) |

## Security

- Role separation: `PROTOCOL_ROLE`, `AGENT_ROLE`, and a self-administered `AUDITOR_ROLE`.
- Reentrancy and malicious-token attacks are tested in `test/SukukVault.security.test.ts`;
  role checks in `test/SukukVault.accessControl.test.ts`.
- `expectedCouponAmount()` publishes what each period *should* pay. The contract cannot know what
  the project actually earned, so the auditor Safe reconciles the two off-chain, with both
  figures public on-chain.
- `MockIDRX` is for testnet only. Set `IDRX_ADDRESS` to use the real token.

> ⚠️ This code has not been professionally audited. Do not use it with real funds.

## Tech Stack

**Contracts:** Solidity, Hardhat, OpenZeppelin Contracts v5, TypeScript
**Frontend:** Next.js 16, React 19, wagmi, viem, RainbowKit, Safe Protocol Kit, Tailwind CSS v4

---

<div align="center">
Built by <a href="https://github.com/riyqnn">@riyqnn</a>
</div>
