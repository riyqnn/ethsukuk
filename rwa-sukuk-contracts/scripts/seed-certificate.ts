import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Prepares wallets for a demo of the certificate suite:
 *   1. Registers each wallet in the InvestorRegistry, which is what lets it hold the certificate.
 *   2. Mints MockIDRX to it, when the underlying is the mock.
 *
 * Env:
 *   SEED_INVESTORS=0x...,0x...     wallets to onboard (defaults to the deployer)
 *   SEED_AMOUNT=10000              IDRX per wallet, in whole tokens
 *   SEED_COUNTRY=360               ISO-3166 numeric country code (360 = Indonesia)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const file = `./deployments/${network.name}-certificate.json`;
  if (!fs.existsSync(file)) throw new Error(`${file} not found. Deploy the suite first.`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));

  const registry = await ethers.getContractAt("InvestorRegistry", d.investorRegistry);
  const idrx = await ethers.getContractAt("MockIDRX", d.idrx);
  const cert = await ethers.getContractAt("SukukCertificate", d.sukukCertificate);

  const investors = (process.env.SEED_INVESTORS ?? deployer.address)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const amount = ethers.parseEther(process.env.SEED_AMOUNT ?? "10000");
  const country = Number(process.env.SEED_COUNTRY ?? 360);

  console.log(`\n=== Seeding ${network.name} ===`);
  console.log(`Registry:    ${d.investorRegistry}`);
  console.log(`Certificate: ${d.sukukCertificate}`);
  console.log(`Underlying:  ${d.idrx}${d.idrxIsMock ? " (MockIDRX)" : ""}\n`);

  for (const investor of investors) {
    if (await registry.contains(investor)) {
      console.log(`${investor}  already registered`);
    } else {
      const tx = await registry.registerIdentity(investor, ethers.ZeroAddress, country);
      await tx.wait();
      console.log(`${investor}  registered (country ${country})`);
    }

    if (d.idrxIsMock) {
      const tx = await idrx.mint(investor, amount);
      await tx.wait();
      console.log(`${investor}  +${ethers.formatEther(amount)} IDRX`);
    }
  }

  console.log(`\nPhase: ${await cert.phase()} · subscribed ${ethers.formatEther(await cert.totalAssets())} IDRX`);
  console.log(`Investors registered: ${await registry.investorCount()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
