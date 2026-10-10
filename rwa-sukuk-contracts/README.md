# Tokenized Sukuk — smart contracts

Hardhat (TypeScript) project for a tokenized Sukuk: investors pass a KYC gate, subscribe with
IDRX, receive an on-chain bond certificate, the principal funds a real-world project through a
Gnosis Safe, profit is shared every period, and the principal is redeemed after maturity.

## The suite

| File | Purpose |
|---|---|
| `contracts/SukukCertificate.sol` | The certificate. ERC-7092 bond, ERC-4626 accounting, ERC-7540 asynchronous redemption, ERC-3643 transfer rules. |
| `contracts/compliance/InvestorRegistry.sol` | The KYC gate. Reduced ERC-3643 identity registry. |
| `contracts/MockIDRX.sol` | DEV/TESTNET ONLY mock, 18dp, owner-only `mint()`. Set `IDRX_ADDRESS` to use a real token. |
| `contracts/interfaces/*` | The standard surfaces the certificate implements. |
| `contracts/SukukVault.sol` | The earlier ERC-4626-only vault, kept for reference. Not part of the certificate suite. |

## How the standards divide the work

- **ERC-3643** — only wallets registered in `InvestorRegistry` can hold the certificate. The
  certificate adds wallet freeze, partial freeze, forced transfer and wallet recovery.
  A full T-REX stack derives verification from ONCHAINID claims; here an agent asserts the
  off-chain KYC result directly, behind the same interface.
- **ERC-7092** — the certificate is the bond: ISIN, denomination, issue volume, profit rate,
  issue date, maturity date, `principalOf`, and transfers carrying a `bytes` payload.
- **ERC-4626** — the accounting. One certificate per unit of principal, and the rate is held at
  1:1 for the life of the issue, so the profit share is computed from the balance rather than
  from a rising price. Profit is never compounded into the certificate.
- **ERC-7540** — redemption is asynchronous: request, the issuer settles, then the holder claims.
  `previewRedeem` and `previewWithdraw` revert, as the standard requires.
- **Gnosis Safe** — one Safe holds `AUDITOR_ROLE` and gates the issue; one Safe custodies the
  principal while it funds the project. They may be the same Safe.

## Roles

- `PROTOCOL_ROLE` — opens the issue, moves principal to and from the treasury, funds each profit
  period, settles redemption requests, closes the issue, pauses.
- `AUDITOR_ROLE` — a Gnosis Safe: `closeSubscription()` and `openRedemption()`. The role
  administers itself, so `PROTOCOL_ROLE` cannot grant it to its own key.
- `AGENT_ROLE` — the compliance desk: registers investors, freezes, forces transfers, recovers.
- Investors need no role beyond being registered: `deposit`, `claimCoupon`, `requestRedeem`, `redeem`.

## Lifecycle (forward only)

```
Subscription → Active → Matured → Redeeming → Closed
```

| Step | Caller | Call |
|---|---|---|
| 1 | Agent | `registerIdentity(investor, onchainId, country)` |
| 2 | Protocol | `openIssue(quota, denomination, tenor, couponRate, couponInterval)` |
| 3 | Investor | `deposit(assets, receiver)` |
| 4 | Auditor Safe | `closeSubscription()` → Active, starts the tenor |
| 5 | Protocol | `allocateToTreasury(amount)` → the project |
| 6 | Protocol | `fundCoupon(amount)` each period; investors `claimCoupon()` |
| 7 | Protocol | `returnFromTreasury(amount)`, then `markMatured()` → Matured |
| 8 | Auditor Safe | `openRedemption()` → Redeeming |
| 9 | Investor | `requestRedeem(shares, controller, owner)` |
| 10 | Protocol | `fulfillRedeem(controllers)` |
| 11 | Investor | `redeem(shares, receiver, controller)` |

## Money, and where it sits

`totalAssets()` is the principal backing outstanding certificates, tracked internally rather than
read from the token balance, so a donation cannot move the price. The principal stays counted
while it is deployed to the treasury, which is why the certificate holds its value during the
project. Profit lives in a separate `couponPool` and is pulled per holder, so a transfer never
carries someone else's unclaimed profit.

`expectedCouponAmount()` publishes what one period should pay at the stated rate. The contract
does not enforce it: it cannot know what the project earned. The auditor Safe compares the two
off-chain, and both figures are on-chain for anyone to check.

## Setup

```bash
npm install
cp .env.example .env   # PRIVATE_KEY, RPC URLs, AUDITOR_MULTISIG, issue terms
```

## Compile and test

```bash
npx hardhat compile
npx hardhat test                # 72 tests
npm run test:certificate        # the certificate suite only
```

## Deploy

```bash
npm run deploy:certificate:sepolia
```

Then onboard demo wallets (registers them for KYC and mints MockIDRX):

```bash
SEED_INVESTORS=0xabc...,0xdef... npm run seed:certificate:sepolia
```

Deployment writes `deployments/<network>-certificate.json`. Production terms are a three-year tenor with
profit every 90 days; `TENOR_SECONDS` and `COUPON_INTERVAL_SECONDS` in `.env` shorten both on a
testnet so the whole lifecycle can be walked through in one session.

### Constructor arguments

`SukukCertificate(underlying, name, symbol, isin, admin, auditorSafe, treasurySafe, registry)`

- `admin` receives `DEFAULT_ADMIN_ROLE`, `PROTOCOL_ROLE` and `AGENT_ROLE`.
- `auditorSafe` receives `AUDITOR_ROLE`, which only it can hand on.
- `treasurySafe` custodies the deployed principal.
- `registry` is the `InvestorRegistry` consulted on every transfer.

## Networks

`hardhat` (local), `sepolia`, `arbitrumSepolia`, `polygonAmoy`. RPC URLs and `PRIVATE_KEY` come
from `.env` and are never hardcoded.
