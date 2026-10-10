import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, DURATION } from "./helpers";

const E = ethers.parseEther;

describe("SukukVault — hardening", function () {
  async function setup() {
    const f = await loadFixture(deployFixture);
    await f.vault.createVault(E("1000"), DURATION, 500);
    await f.idrx.mint(f.investor1.address, E("1000"));
    await f.idrx.connect(f.investor1).approve(await f.vault.getAddress(), E("1000"));
    return f;
  }

  it("protocol admin cannot grant itself AUDITOR_ROLE", async function () {
    const { vault, admin } = await setup();
    await expect(vault.grantRole(await vault.AUDITOR_ROLE(), admin.address))
      .to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
  });

  it("redeem still works after closeVault", async function () {
    const { vault, auditor, admin, idrx, investor1 } = await setup();
    await vault.connect(investor1).deposit(E("100"), investor1.address);
    await vault.connect(auditor).approveVault();
    await time.increase(DURATION);
    await idrx.mint(admin.address, E("10"));
    await idrx.approve(await vault.getAddress(), E("10"));
    await vault.sendPayout(E("10"));
    await vault.connect(auditor).approvePayout();
    await vault.closeVault();
    await expect(vault.connect(investor1).redeem(E("100"), investor1.address, investor1.address)).to.not.be.reverted;
  });

  it("max* follow state, quota and pause (EIP-4626)", async function () {
    const { vault, auditor, investor1 } = await setup();
    expect(await vault.maxDeposit(investor1.address)).to.equal(E("1000"));
    expect(await vault.maxMint(investor1.address)).to.equal(E("1000"));
    await vault.connect(investor1).deposit(E("400"), investor1.address);
    expect(await vault.maxDeposit(investor1.address)).to.equal(E("600"));
    expect(await vault.maxRedeem(investor1.address)).to.equal(0);
    await vault.pause();
    expect(await vault.maxDeposit(investor1.address)).to.equal(0);
    await vault.unpause();
    await vault.connect(auditor).approveVault();
    expect(await vault.maxDeposit(investor1.address)).to.equal(0);
    expect(await vault.maxWithdraw(investor1.address)).to.equal(0);
  });

  it("donation cannot move share price or block deposits", async function () {
    const { vault, idrx, investor1, attacker } = await setup();
    await vault.connect(investor1).deposit(E("1"), investor1.address);
    await idrx.mint(attacker.address, E("5000"));
    await idrx.connect(attacker).transfer(await vault.getAddress(), E("5000")); // > maxQuota
    expect(await vault.totalAssets()).to.equal(E("1"));
    expect(await vault.previewDeposit(E("10"))).to.equal(E("10"));
    await expect(vault.connect(investor1).deposit(E("10"), investor1.address)).to.not.be.reverted;
  });

  it("approveVault reverts when nothing was raised", async function () {
    const { vault, auditor } = await setup();
    await expect(vault.connect(auditor).approveVault()).to.be.revertedWithCustomError(vault, "VaultEmpty");
  });

  it("zero-amount deposit / mint / protocolFill revert", async function () {
    const { vault, investor1 } = await setup();
    await expect(vault.connect(investor1).deposit(0, investor1.address)).to.be.revertedWithCustomError(vault, "ZeroAmount");
    await expect(vault.connect(investor1).mint(0, investor1.address)).to.be.revertedWithCustomError(vault, "ZeroAmount");
    await expect(vault.protocolFill(0)).to.be.revertedWithCustomError(vault, "ZeroAmount");
  });

  it("protocolFill emits ERC-4626 Deposit", async function () {
    const { vault, idrx, admin } = await setup();
    await idrx.mint(admin.address, E("5"));
    await idrx.approve(await vault.getAddress(), E("5"));
    await expect(vault.protocolFill(E("5"))).to.emit(vault, "Deposit");
  });
});
