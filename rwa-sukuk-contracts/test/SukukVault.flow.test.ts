import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture, DURATION } from "./helpers";

const E = ethers.parseEther;

describe("SukukVault — end-to-end multi-investor flow", function () {
  it("2 investors + protocol fill, 10% yield, redeem/withdraw/close, no value lost or created", async function () {
    const { vault, idrx, admin, auditor, investor1, investor2 } = await loadFixture(deployFixture);
    const v = await vault.getAddress();

    await vault.createVault(E("1000"), DURATION, 1000);
    for (const [s, amt] of [[investor1, "600"], [investor2, "300"], [admin, "100"]] as const) {
      await idrx.mint(s.address, E(amt));
      await idrx.connect(s).approve(v, E(amt));
    }
    await vault.connect(investor1).deposit(E("600"), investor1.address);
    await vault.connect(investor2).deposit(E("300"), investor2.address);
    await vault.protocolFill(E("100")); // quota now exactly full
    expect(await vault.totalAssets()).to.equal(E("1000"));
    expect(await vault.maxDeposit(investor1.address)).to.equal(0);
    await expect(vault.connect(investor1).deposit(1, investor1.address)).to.be.reverted;

    await vault.connect(auditor).approveVault();
    await expect(vault.connect(investor1).redeem(1, investor1.address, investor1.address)).to.be.reverted;

    await time.increase(DURATION);
    await idrx.mint(admin.address, E("100"));
    await idrx.approve(v, E("100"));
    await vault.sendPayout(E("100"));
    await expect(vault.connect(investor1).redeem(1, investor1.address, investor1.address)).to.be.reverted; // not approved yet
    await vault.connect(auditor).approvePayout();

    // investor1 redeems via allowance-delegated operator (investor2) to a third party
    await vault.connect(investor1).approve(investor2.address, E("600"));
    await vault.connect(investor2).redeem(E("600"), investor1.address, investor1.address);
    expect(await idrx.balanceOf(investor1.address)).to.be.closeTo(E("660"), 3n);

    // pause blocks redeem
    await vault.pause();
    await expect(vault.connect(investor2).withdraw(E("330"), investor2.address, investor2.address)).to.be.reverted;
    await vault.unpause();

    // investor2 uses withdraw(), protocol redeems the rest after close
    await vault.connect(investor2).withdraw(E("300"), investor2.address, investor2.address);
    await vault.closeVault();
    const rest = await vault.balanceOf(investor2.address);
    await vault.connect(investor2).redeem(rest, investor2.address, investor2.address);
    await vault.redeem(E("100"), admin.address, admin.address);

    expect(await idrx.balanceOf(admin.address)).to.be.closeTo(E("110"), 3n);
    expect(await vault.totalSupply()).to.equal(0);
    // only rounding dust (wei) left; nothing over-paid
    expect(await idrx.balanceOf(v)).to.be.lte(10n);
    expect(await vault.totalAssets()).to.equal(await idrx.balanceOf(v));
  });
});
