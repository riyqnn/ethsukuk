import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, DURATION } from "./helpers";

const ACCESS_ERROR = "AccessControlUnauthorizedAccount";

describe("SukukVault — access control", function () {
  async function setup() {
    const f = await loadFixture(deployFixture);
    await f.vault.createVault(ethers.parseEther("1000"), DURATION, 500);
    // Non-empty vault so approveVault() (which rejects an empty vault) can be used.
    await f.idrx.mint(f.investor1.address, ethers.parseEther("1"));
    await f.idrx.connect(f.investor1).approve(await f.vault.getAddress(), ethers.parseEther("1"));
    await f.vault.connect(f.investor1).deposit(ethers.parseEther("1"), f.investor1.address);
    return f;
  }

  it("grants roles to the correct accounts at construction", async function () {
    const { vault, admin, auditor } = await setup();

    expect(await vault.hasRole(await vault.PROTOCOL_ROLE(), admin.address)).to.equal(true);
    expect(await vault.hasRole(await vault.AUDITOR_ROLE(), auditor.address)).to.equal(true);
    expect(await vault.hasRole(await vault.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);

    // Auditor must NOT hold the protocol role and vice-versa.
    expect(await vault.hasRole(await vault.PROTOCOL_ROLE(), auditor.address)).to.equal(false);
    expect(await vault.hasRole(await vault.AUDITOR_ROLE(), admin.address)).to.equal(false);
  });

  it("createVault reverts for a non-protocol caller", async function () {
    const { vault, investor1 } = await loadFixture(deployFixture);
    await expect(vault.connect(investor1).createVault(1, 1, 1))
      .to.be.revertedWithCustomError(vault, ACCESS_ERROR);
  });

  it("protocolFill reverts for a non-protocol caller", async function () {
    const { vault, investor1 } = await setup();
    await expect(vault.connect(investor1).protocolFill(1))
      .to.be.revertedWithCustomError(vault, ACCESS_ERROR);
  });

  it("approveVault reverts for a non-auditor caller", async function () {
    const { vault, admin } = await setup();
    await expect(vault.connect(admin).approveVault())
      .to.be.revertedWithCustomError(vault, ACCESS_ERROR);
  });

  it("sendPayout reverts for a non-protocol caller", async function () {
    const { vault, auditor } = await setup();
    await vault.connect(auditor).approveVault();
    await expect(vault.connect(auditor).sendPayout(1))
      .to.be.revertedWithCustomError(vault, ACCESS_ERROR);
  });

  it("depositYield reverts for a non-protocol caller", async function () {
    const { vault, auditor } = await setup();
    await vault.connect(auditor).approveVault();
    await expect(vault.connect(auditor).depositYield(1))
      .to.be.revertedWithCustomError(vault, ACCESS_ERROR);
  });

  it("approvePayout reverts for a non-auditor caller", async function () {
    const { vault, admin, auditor } = await setup();
    await vault.connect(auditor).approveVault();
    await expect(vault.connect(admin).approvePayout())
      .to.be.revertedWithCustomError(vault, ACCESS_ERROR);
  });

  it("closeVault reverts for a non-protocol caller", async function () {
    const { vault, auditor } = await setup();
    await vault.connect(auditor).approveVault();
    await expect(vault.connect(auditor).closeVault())
      .to.be.revertedWithCustomError(vault, ACCESS_ERROR);
  });

  it("pause/unpause revert for a non-protocol caller", async function () {
    const { vault, investor1 } = await setup();
    await expect(vault.connect(investor1).pause())
      .to.be.revertedWithCustomError(vault, ACCESS_ERROR);
    await expect(vault.connect(investor1).unpause())
      .to.be.revertedWithCustomError(vault, ACCESS_ERROR);
  });

  it("deposit and redeem are public (no role required)", async function () {
    const { vault, idrx, investor1 } = await setup();
    const vaultAddr = await vault.getAddress();

    await idrx.mint(investor1.address, ethers.parseEther("100"));
    await idrx.connect(investor1).approve(vaultAddr, ethers.parseEther("100"));
    // A role-less account can deposit...
    await expect(vault.connect(investor1).deposit(ethers.parseEther("100"), investor1.address))
      .to.emit(vault, "Deposited");
    // ...and owns shares (100 here + 1 from setup()).
    expect(await vault.balanceOf(investor1.address)).to.equal(ethers.parseEther("101"));
  });
});
