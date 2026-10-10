import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Deploys the Sukuk certificate suite:
 *   1. MockIDRX, or the token at IDRX_ADDRESS if one is given.
 *   2. InvestorRegistry, the ERC-3643 KYC gate.
 *   3. SukukCertificate, the ERC-7092 bond / ERC-4626 vault / ERC-7540 async redemption.
 *   4. Opens the issue with the terms from .env.
 *
 * Production terms are a 3-year tenor with profit shared every 90 days. On a testnet those are
 * unusable, so TENOR_SECONDS and COUPON_INTERVAL_SECONDS default to minutes instead. Both are
 * plain constructor-style parameters, so the same contract takes the real values on mainnet.
 */
const DAY = 86400;

async function main() {
  const [deployer] = await ethers.getSigners();

  const auditorSafe = process.env.AUDITOR_MULTISIG;
  if (!auditorSafe) throw new Error("AUDITOR_MULTISIG is not set in .env");
  const treasurySafe = process.env.TREASURY_SAFE ?? auditorSafe;
  const admin = process.env.PROTOCOL_ADMIN ?? deployer.address;

  const quota = ethers.parseEther(process.env.ISSUE_QUOTA ?? "20000");
  const denomination = ethers.parseEther(process.env.ISSUE_DENOMINATION ?? "100");
  const tenor = Number(process.env.TENOR_SECONDS ?? 3 * 365 * DAY);
  const couponRate = Number(process.env.COUPON_RATE_BPS ?? 1200);
  const couponInterval = Number(process.env.COUPON_INTERVAL_SECONDS ?? 90 * DAY);
  const isin = process.env.ISSUE_ISIN ?? "";

  console.log(`\n=== Sukuk certificate suite -> ${network.name} ===`);
  console.log(`Deployer:      ${deployer.address}`);
  console.log(`Protocol admin:${admin}`);
  console.log(`Auditor Safe:  ${auditorSafe}`);
  console.log(`Treasury Safe: ${treasurySafe}`);
  console.log(
    `Terms:         quota ${ethers.formatEther(quota)} / denom ${ethers.formatEther(denomination)} / ` +
      `tenor ${tenor}s / ${couponRate}bps / coupon every ${couponInterval}s\n`,
  );

  // 1. Underlying token
  let idrxAddress = process.env.IDRX_ADDRESS;
  if (idrxAddress) {
    const token = await ethers.getContractAt("IERC20Metadata", idrxAddress);
    const decimals = await token.decimals();
    if (decimals !== 18n) throw new Error(`IDRX decimals=${decimals}, expected 18`);
    console.log(`Using token at ${idrxAddress} (decimals ${decimals})`);
  } else {
    const MockIDRX = await ethers.getContractFactory("MockIDRX");
    const mock = await MockIDRX.deploy(deployer.address);
    await mock.waitForDeployment();
    idrxAddress = await mock.getAddress();
    console.log(`MockIDRX (NOT official IDRX):  ${idrxAddress}`);
  }

  // 2. KYC registry
  const Registry = await ethers.getContractFactory("InvestorRegistry");
  const registry = await Registry.deploy(admin);
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`InvestorRegistry (ERC-3643):   ${registryAddress}`);

  // 3. Certificate
  const Cert = await ethers.getContractFactory("SukukCertificate");
  const cert = await Cert.deploy(
    idrxAddress,
    process.env.ISSUE_NAME ?? "Sukuk Certificate Series I",
    process.env.ISSUE_SYMBOL ?? "SUKUK1",
    isin,
    admin,
    auditorSafe,
    treasurySafe,
    registryAddress,
  );
  await cert.waitForDeployment();
  const certAddress = await cert.getAddress();
  console.log(`SukukCertificate:              ${certAddress}`);

  // 4. Open the issue
  const tx = await cert.openIssue(quota, denomination, tenor, couponRate, couponInterval);
  await tx.wait();
  console.log(`openIssue() confirmed in ${tx.hash}`);

  const deployment = {
    network: network.name,
    chainId: network.config.chainId,
    idrx: idrxAddress,
    idrxIsMock: !process.env.IDRX_ADDRESS,
    investorRegistry: registryAddress,
    sukukCertificate: certAddress,
    protocolAdmin: admin,
    auditorSafe,
    treasurySafe,
    deployBlock: cert.deploymentTransaction()?.blockNumber ?? null,
    terms: {
      quota: quota.toString(),
      denomination: denomination.toString(),
      tenorSeconds: tenor,
      couponRateBps: couponRate,
      couponIntervalSeconds: couponInterval,
    },
  };

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${network.name}-certificate.json`), JSON.stringify(deployment, null, 2));
  console.log(`\nSaved deployments/${network.name}-certificate.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
