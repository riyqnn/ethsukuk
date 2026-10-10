import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, DURATION, near } from "./helpers";

describe("SukukVault — full lifecycle", function () {
  /**
   * Sets up a vault at quota (1000 IDRX) via two investors + protocol fill:
   *   investor1: 400, investor2: 300, protocol fill: 300  => total 1000.
   */
  async function setup() {
    const f = await loadFixture(deployFixture);
    const vaultAddr = await f.vault.getAddress();

    await f.vault.createVault(ethers.parseEther("1000"), DURATION, 500);

    await f.idrx.mint(f.investor1.address, ethers.parseEther("400"));
    await f.idrx.mint(f.investor2.address, ethers.parseEther("300"));
    await f.idrx.connect(f.investor1).approve(vaultAddr, ethers.parseEther("400"));
    await f.idrx.connect(f.investor2).approve(vaultAddr, ethers.parseEther("300"));

    await f.vault.connect(f.investor1).deposit(ethers.parseEther("400"), f.investor1.address);
    await f.vault.connect(f.investor2).deposit(ethers.parseEther("300"), f.investor2.address);

    await f.idrx.mint(f.admin.address, ethers.parseEther("300"));
    await f.idrx.approve(vaultAddr, ethers.parseEther("300"));
    await f.vault.protocolFill(ethers.parseEther("300"));

    return f;
  }

  it("funds to quota with a 1:1 exchange rate before maturity", async function () {
    const { vault, investor1 } = await setup();

    expect(await vault.totalAssets()).to.equal(ethers.parseEther("1000"));
    expect(await vault.totalSupply()).to.equal(ethers.parseEther("1000"));
    // 1:1 before any yield is funded
    expect(await vault.convertToAssets(ethers.parseEther("1"))).to.equal(ethers.parseEther("1"));
    expect(await vault.balanceOf(investor1.address)).to.equal(ethers.parseEther("400"));
  });

  it("completes createVault -> deposit -> fill -> lock -> maturity -> payout -> redeem", async function () {
    const { vault, auditor, admin, investor1, investor2, idrx } = await setup();

    // Phase 3 — auditor locks the vault
    await expect(vault.connect(auditor).approveVault()).to.emit(vault, "VaultLocked");
    expect(await vault.state()).to.equal(1); // LOCKED

    // Phase 4 — fast-forward past the lock period, protocol funds the yield (5% of 1000)
    await time.increase(DURATION);

    await idrx.mint(admin.address, ethers.parseEther("50"));
    await idrx.approve(await vault.getAddress(), ethers.parseEther("50"));
    await expect(vault.sendPayout(ethers.parseEther("50")))
      .to.emit(vault, "PayoutFunded")
      .withArgs(ethers.parseEther("50"));

    expect(await vault.state()).to.equal(2); // MATURED
    expect(await vault.totalAssets()).to.equal(ethers.parseEther("1050"));
    expect(await vault.totalSupply()).to.equal(ethers.parseEther("1000"));

    // Phase 5 — auditor approves payout, investors redeem principal + yield
    await expect(vault.connect(auditor).approvePayout()).to.emit(vault, "PayoutApproved");
    expect(await vault.state()).to.equal(3); // APPROVED_FOR_PAYOUT

    await vault
      .connect(investor1)
      .redeem(ethers.parseEther("400"), investor1.address, investor1.address);
    near(await idrx.balanceOf(investor1.address), ethers.parseEther("420"));

    await vault
      .connect(investor2)
      .redeem(ethers.parseEther("300"), investor2.address, investor2.address);
    near(await idrx.balanceOf(investor2.address), ethers.parseEther("315"));

    await vault.redeem(ethers.parseEther("300"), admin.address, admin.address);
    near(await idrx.balanceOf(admin.address), ethers.parseEther("315"));

    // All shares burned; only dust-level rounding (virtual offset) remains.
    expect(await vault.totalSupply()).to.equal(0);
    expect(await vault.totalAssets()).to.be.lessThan(10);

    // Optional terminal step
    await expect(vault.closeVault()).to.emit(vault, "VaultClosed");
    expect(await vault.state()).to.equal(4); // CLOSED
  });

  it("prevents a second createVault call", async function () {
    const { vault } = await setup();
    await expect(vault.createVault(1, 1, 1)).to.be.revertedWithCustomError(vault, "VaultAlreadyCreated");
  });
});
