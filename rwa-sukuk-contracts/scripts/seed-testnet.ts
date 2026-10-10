import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Testnet faucet / seed script.
 *
 * Loads the last deployment from deployments/<network>.json, mints a fixed amount of
 * IDRX to a list of demo investor addresses (read from SEED_INVESTORS, comma separated),
 * and optionally opens the vault with a demo quota via createVault().
 *
 * Usage:
 *   npx hardhat run scripts/seed-testnet.ts --network sepolia
 *
 * Env (see .env.example):
 *   SEED_INVESTORS=0x...,0x...
 *   SEED_AMOUNT=10000              (amount of IDRX per investor, in whole tokens)
 *   VAULT_MAX_QUOTA=100000         (optional: call createVault)
 *   VAULT_DURATION=2592000         (optional: lock period in seconds, default 30 days)
 *   VAULT_APY=500                  (optional: basis points, default 5%)
 */
async function main() {
  const [owner] = await ethers.getSigners();

  const deployment = JSON.parse(
    await import("fs").then((fs) =>
      fs.readFileSync(`./deployments/${network.name}.json`, "utf8")
    )
  );

  const idrx = await ethers.getContractAt("MockIDRX", deployment.idrx);

  const seedInvestors = (process.env.SEED_INVESTORS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const seedAmount = ethers.parseEther(process.env.SEED_AMOUNT ?? "10000");

  console.log(`=== Seeding network: ${network.name} ===`);
  console.log(`IDRX: ${deployment.idrx}`);

  for (const investor of seedInvestors) {
    const tx = await idrx.mint(investor, seedAmount);
    await tx.wait();
    console.log(`Minted ${ethers.formatEther(seedAmount)} IDRX -> ${investor}`);
  }

  if (process.env.VAULT_MAX_QUOTA) {
    const vault = await ethers.getContractAt("SukukVault", deployment.sukukVault);
    const alreadyCreated = await vault.vaultCreated();
    if (!alreadyCreated) {
      const maxQuota = ethers.parseEther(process.env.VAULT_MAX_QUOTA);
      const duration = Number(process.env.VAULT_DURATION ?? 2592000);
      const apy = Number(process.env.VAULT_APY ?? 500);
      const tx = await vault.createVault(maxQuota, duration, apy);
      await tx.wait();
      console.log(
        `createVault(maxQuota=${ethers.formatEther(maxQuota)}, duration=${duration}, apy=${apy})`
      );
    } else {
      console.log("Vault already configured, skipping createVault().");
    }
  }

  console.log(`\nOwner IDRX balance: ${ethers.formatEther(await idrx.balanceOf(owner.address))}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
