import { ethers } from "hardhat";
import { expect } from "chai";

export const DURATION = 30 * 24 * 60 * 60; // 30 days
export const APY_BPS = 500; // 5.00%

/**
 * Asserts that `actual` (a BigInt wei amount) is within `tolerance` wei of `expected`.
 *
 * OpenZeppelin v5 ERC-4626 protects against the first-depositor inflation attack by
 * adding a small virtual asset/share offset (`+1`) to the conversion math. As a result,
 * idealized amounts (e.g. "1000 shares redeem for 1050 IDRX") come out off by 1–2 wei.
 * This helper lets tests assert the documented business value while tolerating that
 * dust-level rounding.
 */
export function near(actual: bigint, expected: bigint, tolerance = 3n): void {
  expect(
    actual >= expected - tolerance && actual <= expected + tolerance,
    `expected ${actual.toString()} to be within ${tolerance.toString()} wei of ${expected.toString()}`
  ).to.equal(true);
}

/**
 * Deploys a fresh IDRX + SukukVault with fixed signers.
 * Roles: admin = PROTOCOL_ROLE + DEFAULT_ADMIN_ROLE, auditor = AUDITOR_ROLE.
 */
export async function deployFixture() {
  const [admin, auditor, investor1, investor2, attacker] = await ethers.getSigners();

  const IDRX = await ethers.getContractFactory("MockIDRX");
  const idrx = await IDRX.deploy(admin.address);
  await idrx.waitForDeployment();

  const SukukVault = await ethers.getContractFactory("SukukVault");
  const vault = await SukukVault.deploy(
    await idrx.getAddress(),
    "Sukuk Share Token",
    "sSUKUK",
    admin.address,
    auditor.address
  );
  await vault.waitForDeployment();

  return { admin, auditor, investor1, investor2, attacker, idrx, vault };
}
