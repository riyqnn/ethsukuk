import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, DURATION, near } from "./helpers";

describe("SukukVault — ERC-4626 exchange rate math", function () {
  async function setup() {
    const f = await loadFixture(deployFixture);
    await f.vault.createVault(ethers.parseEther("1000"), DURATION, 500);

    // Single investor deposits 1000 IDRX -> 1000 sSUKUK.
    await f.idrx.mint(f.investor1.address, ethers.parseEther("1000"));
    await f.idrx.connect(f.investor1).approve(await f.vault.getAddress(), ethers.parseEther("1000"));
    await f.vault.connect(f.investor1).deposit(ethers.parseEther("1000"), f.investor1.address);

    return f;
  }

  it("starts at a 1:1 exchange rate", async function () {
    const { vault } = await setup();

    expect(await vault.totalAssets()).to.equal(ethers.parseEther("1000"));
    expect(await vault.totalSupply()).to.equal(ethers.parseEther("1000"));
    expect(await vault.convertToAssets(ethers.parseEther("1000"))).to.equal(ethers.parseEther("1000"));
    expect(await vault.convertToShares(ethers.parseEther("1000"))).to.equal(ethers.parseEther("1000"));
    expect(await vault.previewRedeem(ethers.parseEther("1000"))).to.equal(ethers.parseEther("1000"));
    expect(await vault.previewDeposit(ethers.parseEther("1000"))).to.equal(ethers.parseEther("1000"));
  });

  it("raises the exchange rate proportionally after sendPayout (1000 -> 1050)", async function () {
    const { vault, auditor, admin, idrx } = await setup();

    await vault.connect(auditor).approveVault();
    await time.increase(DURATION);

    // 5% yield on 1000 principal.
    await idrx.mint(admin.address, ethers.parseEther("50"));
    await idrx.approve(await vault.getAddress(), ethers.parseEther("50"));
    await vault.sendPayout(ethers.parseEther("50"));

    expect(await vault.totalAssets()).to.equal(ethers.parseEther("1050"));
    expect(await vault.totalSupply()).to.equal(ethers.parseEther("1000"));

    // 1000 sSUKUK now redeem for 1050 IDRX (within dust-level virtual-offset rounding).
    near(await vault.convertToAssets(ethers.parseEther("1000")), ethers.parseEther("1050"));
    near(await vault.previewRedeem(ethers.parseEther("1000")), ethers.parseEther("1050"));
    // 1050 IDRX is backed by (exactly) 1000 shares.
    expect(await vault.convertToShares(ethers.parseEther("1050"))).to.equal(ethers.parseEther("1000"));
    // Per-share rate is now ~1.05 (1 sSUKUK -> 1.05 IDRX).
    near(await vault.convertToAssets(ethers.parseEther("1")), ethers.parseEther("1.05"));
  });

  it("reports the correct maxRedeem / maxWithdraw for an investor", async function () {
    const { vault, auditor, admin, idrx, investor1 } = await setup();

    await vault.connect(auditor).approveVault();
    await time.increase(DURATION);
    await idrx.mint(admin.address, ethers.parseEther("50"));
    await idrx.approve(await vault.getAddress(), ethers.parseEther("50"));
    await vault.sendPayout(ethers.parseEther("50"));
    await vault.connect(auditor).approvePayout();

    expect(await vault.maxRedeem(investor1.address)).to.equal(ethers.parseEther("1000"));
    near(await vault.maxWithdraw(investor1.address), ethers.parseEther("1050"));
  });
});
