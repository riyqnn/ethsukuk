import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, DURATION, near } from "./helpers";

const INVALID_STATE = "InvalidState";

describe("SukukVault — state machine guards", function () {
  async function setup() {
    const f = await loadFixture(deployFixture);
    await f.vault.createVault(ethers.parseEther("1000"), DURATION, 500);

    await f.idrx.mint(f.investor1.address, ethers.parseEther("500"));
    await f.idrx.connect(f.investor1).approve(await f.vault.getAddress(), ethers.parseEther("500"));
    await f.vault.connect(f.investor1).deposit(ethers.parseEther("500"), f.investor1.address);

    return f;
  }

  it("deposit reverts when LOCKED and when MATURED", async function () {
    const { vault, auditor, admin, idrx, investor1 } = await setup();

    await vault.connect(auditor).approveVault(); // -> LOCKED
    await expect(vault.connect(investor1).deposit(1, investor1.address))
      .to.be.revertedWithCustomError(vault, INVALID_STATE);

    // Advance to MATURED
    await time.increase(DURATION);
    await idrx.mint(admin.address, ethers.parseEther("50"));
    await idrx.approve(await vault.getAddress(), ethers.parseEther("50"));
    await vault.sendPayout(ethers.parseEther("50")); // -> MATURED

    await expect(vault.connect(investor1).deposit(1, investor1.address))
      .to.be.revertedWithCustomError(vault, INVALID_STATE);
  });

  it("mint reverts when LOCKED", async function () {
    const { vault, auditor, investor1 } = await setup();
    await vault.connect(auditor).approveVault();
    await expect(vault.connect(investor1).mint(1, investor1.address))
      .to.be.revertedWithCustomError(vault, INVALID_STATE);
  });

  it("redeem reverts until APPROVED_FOR_PAYOUT, then succeeds", async function () {
    const { vault, auditor, admin, idrx, investor1 } = await setup();

    await expect(vault.connect(investor1).redeem(1, investor1.address, investor1.address))
      .to.be.revertedWithCustomError(vault, INVALID_STATE); // OPEN

    await vault.connect(auditor).approveVault(); // LOCKED
    await expect(vault.connect(investor1).redeem(1, investor1.address, investor1.address))
      .to.be.revertedWithCustomError(vault, INVALID_STATE);

    await time.increase(DURATION);
    await idrx.mint(admin.address, ethers.parseEther("50"));
    await idrx.approve(await vault.getAddress(), ethers.parseEther("50"));
    await vault.sendPayout(ethers.parseEther("50")); // MATURED
    await expect(vault.connect(investor1).redeem(1, investor1.address, investor1.address))
      .to.be.revertedWithCustomError(vault, INVALID_STATE);

    await vault.connect(auditor).approvePayout(); // APPROVED_FOR_PAYOUT
    await expect(vault.connect(investor1).redeem(1, investor1.address, investor1.address))
      .to.emit(vault, "Redeemed");
  });

  it("withdraw reverts when not yet APPROVED_FOR_PAYOUT", async function () {
    const { vault, investor1 } = await setup();
    await expect(vault.connect(investor1).withdraw(1, investor1.address, investor1.address))
      .to.be.revertedWithCustomError(vault, INVALID_STATE);
  });

  it("sendPayout reverts before the lock period has elapsed", async function () {
    const { vault, auditor, admin, idrx } = await setup();
    await vault.connect(auditor).approveVault(); // lockStartTime = now
    const lockStart = await vault.lockStartTime();

    await idrx.mint(admin.address, ethers.parseEther("50"));
    await idrx.approve(await vault.getAddress(), ethers.parseEther("50"));

    // Right after locking, the lock period has not elapsed.
    await expect(vault.sendPayout(ethers.parseEther("50")))
      .to.be.revertedWithCustomError(vault, "LockPeriodNotEnded");

    // One second before unlock still reverts. (hardhat auto-advances the block
    // timestamp by 1s per tx, so set the clock to unlockTime - 2 and the payout
    // tx lands on unlockTime - 1.)
    await time.increaseTo(Number(lockStart) + DURATION - 2);
    await expect(vault.sendPayout(ethers.parseEther("50")))
      .to.be.revertedWithCustomError(vault, "LockPeriodNotEnded");

    // At/after unlock time the payout succeeds.
    await time.increase(DURATION);
    await expect(vault.sendPayout(ethers.parseEther("50"))).to.emit(vault, "PayoutFunded");
  });

  it("sendPayout reverts when vault is not LOCKED", async function () {
    const { vault, admin, idrx } = await setup(); // still OPEN

    await idrx.mint(admin.address, ethers.parseEther("50"));
    await idrx.approve(await vault.getAddress(), ethers.parseEther("50"));
    await expect(vault.sendPayout(ethers.parseEther("50")))
      .to.be.revertedWithCustomError(vault, INVALID_STATE);
  });

  it("approveVault reverts if called twice", async function () {
    const { vault, auditor } = await setup();
    await vault.connect(auditor).approveVault();
    await expect(vault.connect(auditor).approveVault())
      .to.be.revertedWithCustomError(vault, INVALID_STATE);
  });

  it("approvePayout reverts if not MATURED", async function () {
    const { vault, auditor } = await setup();
    await expect(vault.connect(auditor).approvePayout())
      .to.be.revertedWithCustomError(vault, INVALID_STATE);
  });

  it("pause blocks deposits while unpause re-enables them", async function () {
    const { vault, idrx, investor1 } = await setup();

    await vault.pause();
    await idrx.mint(investor1.address, ethers.parseEther("10"));
    await idrx.connect(investor1).approve(await vault.getAddress(), ethers.parseEther("10"));
    await expect(vault.connect(investor1).deposit(ethers.parseEther("10"), investor1.address))
      .to.be.revertedWithCustomError(vault, "EnforcedPause");

    await vault.unpause();
    await expect(vault.connect(investor1).deposit(ethers.parseEther("10"), investor1.address))
      .to.emit(vault, "Deposited");
  });
});

describe("SukukVault — quota enforcement", function () {
  it("reverts when a deposit would exceed maxQuota", async function () {
    const { vault, idrx, investor1 } = await loadFixture(deployFixture);
    await vault.createVault(ethers.parseEther("1000"), DURATION, 500);

    await idrx.mint(investor1.address, ethers.parseEther("2000"));
    await idrx.connect(investor1).approve(await vault.getAddress(), ethers.parseEther("2000"));

    await expect(vault.connect(investor1).deposit(ethers.parseEther("1001"), investor1.address))
      .to.be.revertedWithCustomError(vault, "QuotaExceeded");

    // Filling to exactly 1000 succeeds...
    await vault.connect(investor1).deposit(ethers.parseEther("1000"), investor1.address);
    // ...but a single extra wei over the quota reverts.
    await expect(vault.connect(investor1).deposit(1, investor1.address))
      .to.be.revertedWithCustomError(vault, "QuotaExceeded");
  });

  it("reverts when protocolFill would exceed maxQuota", async function () {
    const { vault, admin, idrx } = await loadFixture(deployFixture);
    await vault.createVault(ethers.parseEther("1000"), DURATION, 500);

    await idrx.mint(admin.address, ethers.parseEther("2000"));
    await idrx.approve(await vault.getAddress(), ethers.parseEther("2000"));

    await expect(vault.protocolFill(ethers.parseEther("1001")))
      .to.be.revertedWithCustomError(vault, "QuotaExceeded");
  });
});

describe("SukukVault — reentrancy protection", function () {
  /**
   * Deploys a vault whose underlying is a hostile ERC-20 that re-enters during
   * transfers. Proves `nonReentrant` blocks a second `redeem` inside the same call.
   */
  async function reentrancyFixture() {
    const [admin, auditor] = await ethers.getSigners();

    const MaliciousToken = await ethers.getContractFactory("MaliciousToken");
    const token = await MaliciousToken.deploy();
    await token.waitForDeployment();

    const SukukVault = await ethers.getContractFactory("SukukVault");
    const vault = await SukukVault.deploy(
      await token.getAddress(),
      "Sukuk Share Token",
      "sSUKUK",
      admin.address,
      auditor.address
    );
    await vault.waitForDeployment();

    await vault.createVault(ethers.parseEther("100000"), DURATION, 500);

    const AttackerFactory = await ethers.getContractFactory("ReentrancyAttacker");
    const attacker = await AttackerFactory.deploy(
      await vault.getAddress(),
      await token.getAddress()
    );
    await attacker.waitForDeployment();

    return { admin, auditor, token, vault, attacker, AttackerFactory };
  }

  it("blocks a reentrant redeem and completes the legitimate redemption", async function () {
    const { admin, auditor, token, vault, attacker, AttackerFactory } =
      await loadFixture(reentrancyFixture);
    const SHARES = ethers.parseEther("1000");
    const attackerAddress = await attacker.getAddress();

    // Attacker funds itself and deposits via the malicious token.
    await token.transfer(attackerAddress, SHARES);
    await attacker.deposit(SHARES);

    // Move the vault to APPROVED_FOR_PAYOUT.
    await vault.connect(auditor).approveVault();
    await time.increase(DURATION);
    await token.approve(await vault.getAddress(), ethers.parseEther("50"));
    await vault.sendPayout(ethers.parseEther("50"));
    await vault.connect(auditor).approvePayout();

    // Arm the malicious token: on the next transfer *to* the attacker it will
    // re-enter the attacker's tryReenter(), which calls redeem() a second time.
    const reenterData = AttackerFactory.interface.encodeFunctionData("tryReenter", [SHARES]);
    await token.arm(attackerAddress, reenterData);

    // The outer redemption succeeds (shares burned + assets paid out)...
    await attacker.attack(SHARES);

    // ...while the inner reentrant redeem was blocked by the nonReentrant guard.
    expect(await token.lastReenterSucceeded()).to.equal(false);
    near(await token.balanceOf(attackerAddress), ethers.parseEther("1050"));
  });
});
