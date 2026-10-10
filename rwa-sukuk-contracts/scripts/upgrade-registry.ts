import { ethers, network } from "hardhat";
import type { LogDescription } from "ethers";
import * as fs from "fs";
import * as path from "path";

/**
 * Swaps the certificate's InvestorRegistry for a fresh deployment of the current contract
 * (e.g. to add `selfRegister`), carrying over every registered investor, every extra agent
 * and every country restriction, then points the certificate at it.
 *
 *   npx hardhat run scripts/upgrade-registry.ts --network sepolia
 *
 * The deployer must hold DEFAULT_ADMIN_ROLE on the certificate and the old registry, and
 * ETHERSCAN_API_KEY must be set.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const file = path.join(__dirname, "..", "deployments", `${network.name}-certificate.json`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));

  const cert = await ethers.getContractAt("SukukCertificate", d.sukukCertificate);
  const old = await ethers.getContractAt("InvestorRegistry", await cert.registry());
  const ADMIN = await cert.DEFAULT_ADMIN_ROLE();
  if (!(await cert.hasRole(ADMIN, deployer.address))) throw new Error(`${deployer.address} is not certificate admin`);

  // Public RPCs prune old logs, so the registry's history comes from Etherscan instead.
  const url =
    `https://api.etherscan.io/v2/api?chainid=${network.config.chainId}&module=logs&action=getLogs` +
    `&address=${await old.getAddress()}&fromBlock=0&toBlock=latest&apikey=${process.env.ETHERSCAN_API_KEY}`;
  const res = await (await fetch(url)).json();
  if (!Array.isArray(res.result)) throw new Error(`Etherscan: ${res.message} ${res.result}`);
  const events: LogDescription[] = res.result.map((l: { topics: string[]; data: string }) => old.interface.parseLog(l));
  const logs = (name: string) => events.filter((e) => e.name === name);

  // Current state, read back from the old registry rather than replayed from events.
  const seen = new Set(logs("IdentityRegistered").map((e) => e.args.investor as string));
  const investors: string[] = [];
  const onchainIds: string[] = [];
  const countries: bigint[] = [];
  for (const who of seen) {
    if (!(await old.contains(who))) continue;
    investors.push(who);
    onchainIds.push(await old.identity(who));
    countries.push(await old.investorCountry(who));
  }

  const AGENT = await old.AGENT_ROLE();
  const agents = new Set<string>();
  for (const e of logs("RoleGranted")) {
    const who: string = e.args.account;
    if (e.args.role === AGENT && who !== deployer.address && (await old.hasRole(AGENT, who))) agents.add(who);
  }

  const blocked = new Set<bigint>();
  for (const e of logs("CountryRestriction")) {
    if (await old.blockedCountry(e.args.country)) blocked.add(e.args.country);
  }

  console.log(`Old registry ${await old.getAddress()}: ${investors.length} investors, ${agents.size} extra agents, ${blocked.size} blocked countries`);

  const Registry = await ethers.getContractFactory("InvestorRegistry");
  const next = await Registry.deploy(deployer.address);
  await next.waitForDeployment();
  const nextAddress = await next.getAddress();
  const deployBlock = next.deploymentTransaction()?.blockNumber ?? null;
  console.log(`New registry ${nextAddress}`);

  for (let i = 0; i < investors.length; i += 50) {
    await (await next.batchRegisterIdentity(investors.slice(i, i + 50), onchainIds.slice(i, i + 50), countries.slice(i, i + 50))).wait();
  }
  for (const a of agents) await (await next.grantRole(AGENT, a)).wait();
  for (const c of blocked) await (await next.setCountryRestriction(c, true)).wait();

  await (await cert.setRegistry(nextAddress)).wait();
  console.log(`certificate.setRegistry(${nextAddress}) confirmed`);

  fs.writeFileSync(file, JSON.stringify({ ...d, investorRegistry: nextAddress, registryDeployBlock: deployBlock }, null, 2));
  console.log(`Updated deployments/${network.name}-certificate.json`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
