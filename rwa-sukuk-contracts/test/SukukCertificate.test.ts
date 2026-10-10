import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

const E = ethers.parseEther;
const DENOM = E("100"); // 100 IDRX minimum subscription
const QUOTA = E("10000");
const TENOR = 360; // stands in for 3 years
const INTERVAL = 90; // stands in for 90 days
const RATE = 1200; // 12.00% a year
const ID = 360; // ISO country code for Indonesia

/** Deploys the registry, the mock token and the certificate, and KYCs the two investors. */
async function deployFixture() {
  const [admin, auditor, treasury, alice, bob, outsider] = await ethers.getSigners();

  const MockIDRX = await ethers.getContractFactory("MockIDRX");
  const idrx = await MockIDRX.deploy(admin.address);

  const Registry = await ethers.getContractFactory("InvestorRegistry");
  const registry = await Registry.deploy(admin.address);

  const Cert = await ethers.getContractFactory("SukukCertificate");
  const cert = await Cert.deploy(
    await idrx.getAddress(),
    "Sukuk Ritel Series I",
    "SUKUK1",
    "IDX0000SUKUK1",
    admin.address,
    auditor.address,
    treasury.address,
    await registry.getAddress(),
  );

  for (const who of [alice, bob]) {
    await registry.registerIdentity(who.address, ethers.ZeroAddress, ID);
    await idrx.mint(who.address, E("20000"));
    await idrx.connect(who).approve(await cert.getAddress(), ethers.MaxUint256);
  }
  await idrx.mint(admin.address, E("50000"));
  await idrx.approve(await cert.getAddress(), ethers.MaxUint256);
  await idrx.connect(treasury).approve(await cert.getAddress(), ethers.MaxUint256);

  return { admin, auditor, treasury, alice, bob, outsider, idrx, registry, cert };
}

/** Opens the issue and subscribes Alice 6,000 and Bob 4,000. */
async function subscribed() {
  const f = await loadFixture(deployFixture);
  await f.cert.openIssue(QUOTA, DENOM, TENOR, RATE, INTERVAL);
  await f.cert.connect(f.alice).deposit(E("6000"), f.alice.address);
  await f.cert.connect(f.bob).deposit(E("4000"), f.bob.address);
  return f;
}

/** Subscription closed, principal sent to the treasury Safe. */
async function active() {
  const f = await subscribed();
  await f.cert.connect(f.auditor).closeSubscription();
  await f.cert.allocateToTreasury(E("10000"));
  return f;
}

describe("SukukCertificate — KYC gate (ERC-3643)", () => {
  it("blocks an unverified wallet from subscribing or receiving", async () => {
    const { cert, idrx, alice, outsider } = await subscribed();

    await idrx.mint(outsider.address, E("1000"));
    await idrx.connect(outsider).approve(await cert.getAddress(), ethers.MaxUint256);

    await expect(cert.connect(outsider).deposit(E("100"), outsider.address))
      .to.be.revertedWithCustomError(cert, "NotVerified")
      .withArgs(outsider.address);

    await expect(cert.connect(alice).transfer(outsider.address, E("1")))
      .to.be.revertedWithCustomError(cert, "NotVerified")
      .withArgs(outsider.address);
  });

  it("lets a verified wallet in and out again once the agent removes it", async () => {
    const { cert, registry, alice, bob } = await subscribed();

    await cert.connect(alice).transfer(bob.address, E("100"));
    expect(await cert.balanceOf(bob.address)).to.equal(E("4100"));

    await registry.deleteIdentity(bob.address);
    await expect(cert.connect(alice).transfer(bob.address, E("1"))).to.be.revertedWithCustomError(cert, "NotVerified");
  });

  it("blocks a restricted country", async () => {
    const { cert, registry, alice, bob } = await subscribed();

    await registry.setCountryRestriction(ID, true);
    expect(await registry.isVerified(bob.address)).to.equal(false);
    await expect(cert.connect(alice).transfer(bob.address, E("1"))).to.be.revertedWithCustomError(cert, "NotVerified");

    await registry.setCountryRestriction(ID, false);
    await expect(cert.connect(alice).transfer(bob.address, E("1"))).to.not.be.reverted;
  });

  it("freezes a wallet and a partial balance", async () => {
    const { cert, alice, bob } = await subscribed();

    await cert.setAddressFrozen(alice.address, true);
    await expect(cert.connect(alice).transfer(bob.address, E("1")))
      .to.be.revertedWithCustomError(cert, "WalletFrozen")
      .withArgs(alice.address);

    await cert.setAddressFrozen(alice.address, false);
    await cert.freezePartialTokens(alice.address, E("5900"));
    expect(await cert.getFrozenTokens(alice.address)).to.equal(E("5900"));

    await expect(cert.connect(alice).transfer(bob.address, E("200"))).to.be.revertedWithCustomError(
      cert,
      "InsufficientUnfrozen",
    );
    await expect(cert.connect(alice).transfer(bob.address, E("100"))).to.not.be.reverted;

    await cert.unfreezePartialTokens(alice.address, E("5900"));
    await expect(cert.connect(alice).transfer(bob.address, E("200"))).to.not.be.reverted;
  });

  it("forces a transfer past a freeze and recovers a lost wallet", async () => {
    const { cert, alice, bob } = await subscribed();

    await cert.freezePartialTokens(alice.address, E("6000"));
    await cert.forcedTransfer(alice.address, bob.address, E("1000"));
    expect(await cert.balanceOf(bob.address)).to.equal(E("5000"));
    expect(await cert.getFrozenTokens(alice.address)).to.equal(E("5000"));

    await cert.recoveryAddress(alice.address, bob.address);
    expect(await cert.balanceOf(alice.address)).to.equal(0);
    expect(await cert.balanceOf(bob.address)).to.equal(E("10000"));
    expect(await cert.getFrozenTokens(bob.address)).to.equal(E("5000"));
  });

  it("only the agent can freeze or force", async () => {
    const { cert, alice, bob } = await subscribed();
    await expect(cert.connect(alice).setAddressFrozen(bob.address, true)).to.be.revertedWithCustomError(
      cert,
      "AccessControlUnauthorizedAccount",
    );
    await expect(
      cert.connect(alice).forcedTransfer(bob.address, alice.address, E("1")),
    ).to.be.revertedWithCustomError(cert, "AccessControlUnauthorizedAccount");
  });
});

describe("SukukCertificate — issue terms (ERC-7092)", () => {
  it("reports the bond terms", async () => {
    const { cert, idrx } = await subscribed();

    expect(await cert.isin()).to.equal("IDX0000SUKUK1");
    expect(await cert.currency()).to.equal(await idrx.getAddress());
    expect(await cert.denomination()).to.equal(DENOM);
    expect(await cert.issueVolume()).to.equal(E("10000"));
    expect(await cert.couponRate()).to.equal(RATE);
    expect(await cert.couponType()).to.equal(1);
    expect(await cert.couponFrequency()).to.equal(Math.floor((365 * 24 * 3600) / INTERVAL));
    expect(await cert.issueDate()).to.equal(0);
  });

  it("sets issue and maturity dates when subscription closes", async () => {
    const { cert, auditor } = await subscribed();

    await cert.connect(auditor).closeSubscription();
    const issued = await cert.issueDate();
    expect(issued).to.be.greaterThan(0);
    expect(await cert.maturityDate()).to.equal(issued + BigInt(TENOR));
  });

  it("tracks principalOf per holder", async () => {
    const { cert, alice, bob } = await subscribed();
    expect(await cert.principalOf(alice.address)).to.equal(E("6000"));
    expect(await cert.principalOf(bob.address)).to.equal(E("4000"));
  });

  it("enforces the denomination and the quota", async () => {
    const f = await loadFixture(deployFixture);
    await f.cert.openIssue(QUOTA, DENOM, TENOR, RATE, INTERVAL);

    await expect(f.cert.connect(f.alice).deposit(E("150"), f.alice.address))
      .to.be.revertedWithCustomError(f.cert, "NotDenominationMultiple")
      .withArgs(DENOM);

    await expect(f.cert.connect(f.alice).deposit(E("100"), f.alice.address)).to.not.be.reverted;
    await expect(f.cert.connect(f.alice).deposit(QUOTA, f.alice.address))
      .to.be.revertedWithCustomError(f.cert, "QuotaExceeded")
      .withArgs(QUOTA - E("100"));
  });

  it("transfers with the ERC-7092 data payload", async () => {
    const { cert, alice, bob } = await subscribed();

    await expect(
      cert
        .connect(alice)
        ["transfer(address,uint256,bytes)"](bob.address, E("500"), ethers.toUtf8Bytes("settlement-ref-1")),
    ).to.emit(cert, "Transfer");
    expect(await cert.balanceOf(bob.address)).to.equal(E("4500"));

    await cert.connect(alice).approve(bob.address, E("300"));
    await cert
      .connect(bob)
      ["transferFrom(address,address,uint256,bytes)"](alice.address, bob.address, E("300"), "0x");
    expect(await cert.balanceOf(bob.address)).to.equal(E("4800"));

    await cert.connect(alice).approve(bob.address, E("100"));
    await cert.connect(alice).decreaseAllowance(bob.address, E("40"));
    expect(await cert.allowance(alice.address, bob.address)).to.equal(E("60"));
  });
});

describe("SukukCertificate — treasury (Gnosis Safe)", () => {
  it("moves principal to the Safe and back", async () => {
    const { cert, idrx, treasury, auditor } = await subscribed();

    await cert.connect(auditor).closeSubscription();
    await expect(cert.allocateToTreasury(E("8000")))
      .to.emit(cert, "AllocatedToTreasury")
      .withArgs(treasury.address, E("8000"));

    expect(await idrx.balanceOf(treasury.address)).to.equal(E("8000"));
    expect(await cert.deployedToTreasury()).to.equal(E("8000"));
    // The share price is unchanged: the principal is deployed, not spent.
    expect(await cert.totalAssets()).to.equal(E("10000"));
    expect(await cert.convertToAssets(E("1"))).to.equal(E("1"));

    await cert.connect(treasury).returnFromTreasury(E("8000"));
    expect(await cert.deployedToTreasury()).to.equal(0);
  });

  it("cannot deploy more than the principal", async () => {
    const { cert } = await active();
    await expect(cert.allocateToTreasury(E("1"))).to.be.revertedWithCustomError(
      cert,
      "InsufficientTreasuryBalance",
    );
  });

  it("only PROTOCOL_ROLE can allocate", async () => {
    const { cert, alice } = await active();
    await expect(cert.connect(alice).allocateToTreasury(E("1"))).to.be.revertedWithCustomError(
      cert,
      "AccessControlUnauthorizedAccount",
    );
  });
});

describe("SukukCertificate — profit sharing every period", () => {
  it("splits each period pro rata and pays on claim", async () => {
    const { cert, idrx, alice, bob } = await active();

    expect(await cert.expectedCouponAmount()).to.equal((E("10000") * BigInt(RATE * INTERVAL)) / BigInt(10000 * 365 * 24 * 3600));

    await time.increase(INTERVAL);
    await expect(cert.fundCoupon(E("300"))).to.emit(cert, "CouponFunded");

    // Alice holds 60%, Bob 40%.
    expect(await cert.claimableCoupon(alice.address)).to.equal(E("180"));
    expect(await cert.claimableCoupon(bob.address)).to.equal(E("120"));

    const before = await idrx.balanceOf(alice.address);
    await expect(cert.connect(alice)["claimCoupon()"]()).to.emit(cert, "CouponClaimed");
    expect(await idrx.balanceOf(alice.address)).to.equal(before + E("180"));
    expect(await cert.claimableCoupon(alice.address)).to.equal(0);
    expect(await cert.couponClaimed(alice.address)).to.equal(E("180"));
  });

  it("accumulates across periods and keeps the share price at 1", async () => {
    const { cert, alice } = await active();

    for (let i = 0; i < 3; i++) {
      await time.increase(INTERVAL);
      await cert.fundCoupon(E("300"));
    }

    expect(await cert.couponsPaid()).to.equal(3);
    expect(await cert.claimableCoupon(alice.address)).to.equal(E("540"));
    // Profit never inflates the certificate: principal is still 1:1.
    expect(await cert.convertToAssets(E("1"))).to.equal(E("1"));
    expect(await cert.totalAssets()).to.equal(E("10000"));
  });

  it("splits profit correctly when shares change hands mid-life", async () => {
    const { cert, alice, bob } = await active();

    await time.increase(INTERVAL);
    await cert.fundCoupon(E("300")); // Alice 180, Bob 120

    await cert.connect(alice).transfer(bob.address, E("6000")); // Alice exits entirely

    await time.increase(INTERVAL);
    await cert.fundCoupon(E("300")); // all to Bob

    // Alice keeps period 1 only; Bob gets his own period 1 plus all of period 2.
    expect(await cert.claimableCoupon(alice.address)).to.equal(E("180"));
    expect(await cert.claimableCoupon(bob.address)).to.equal(E("420"));

    await cert.connect(alice)["claimCoupon()"]();
    await cert.connect(bob)["claimCoupon()"]();
    expect(await cert.couponPool()).to.equal(0);
  });

  it("refuses a period that is not due yet", async () => {
    const { cert } = await active();
    await expect(cert.fundCoupon(E("300"))).to.be.revertedWithCustomError(cert, "CouponTooEarly");
  });

  it("refuses a claim with nothing accrued", async () => {
    const { cert, alice } = await active();
    await expect(cert.connect(alice)["claimCoupon()"]()).to.be.revertedWithCustomError(cert, "ZeroAmount");
  });

  it("keeps profit out of the principal pool", async () => {
    const { cert, idrx } = await active();
    await time.increase(INTERVAL);
    await cert.fundCoupon(E("300"));

    expect(await cert.couponPool()).to.equal(E("300"));
    // Everything except the profit is at the treasury.
    expect(await idrx.balanceOf(await cert.getAddress())).to.equal(E("300"));
  });
});

describe("SukukCertificate — redemption at maturity (ERC-7540)", () => {
  async function matured() {
    const f = await active();
    await time.increase(TENOR);
    await f.cert.connect(f.treasury).returnFromTreasury(E("10000"));
    await f.cert.markMatured();
    await f.cert.connect(f.auditor).openRedemption();
    return f;
  }

  it("walks request, fulfil and claim", async () => {
    const { cert, idrx, alice } = await matured();

    await expect(cert.connect(alice).requestRedeem(E("6000"), alice.address, alice.address))
      .to.emit(cert, "RedeemRequest")
      .withArgs(alice.address, alice.address, 0, alice.address, E("6000"));

    // Shares leave immediately, as the standard requires.
    expect(await cert.balanceOf(alice.address)).to.equal(0);
    expect(await cert.pendingRedeemRequest(0, alice.address)).to.equal(E("6000"));
    expect(await cert.claimableRedeemRequest(0, alice.address)).to.equal(0);
    expect(await cert.maxRedeem(alice.address)).to.equal(0);
    // Bob's price is untouched by Alice leaving.
    expect(await cert.convertToAssets(E("1"))).to.equal(E("1"));
    expect(await cert.totalAssets()).to.equal(E("4000"));

    await cert.fulfillRedeem([alice.address]);
    expect(await cert.pendingRedeemRequest(0, alice.address)).to.equal(0);
    expect(await cert.claimableRedeemRequest(0, alice.address)).to.equal(E("6000"));
    expect(await cert.maxRedeem(alice.address)).to.equal(E("6000"));
    expect(await cert.maxWithdraw(alice.address)).to.equal(E("6000"));

    const before = await idrx.balanceOf(alice.address);
    await expect(cert.connect(alice).redeem(E("6000"), alice.address, alice.address)).to.emit(cert, "Withdraw");
    expect(await idrx.balanceOf(alice.address)).to.equal(before + E("6000"));
    expect(await cert.claimableRedeemRequest(0, alice.address)).to.equal(0);
  });

  it("supports a partial claim and the withdraw form", async () => {
    const { cert, alice } = await matured();

    await cert.connect(alice).requestRedeem(E("6000"), alice.address, alice.address);
    await cert.fulfillRedeem([alice.address]);

    await cert.connect(alice).redeem(E("2000"), alice.address, alice.address);
    expect(await cert.claimableRedeemRequest(0, alice.address)).to.equal(E("4000"));

    await cert.connect(alice).withdraw(E("4000"), alice.address, alice.address);
    expect(await cert.claimableRedeemRequest(0, alice.address)).to.equal(0);
    expect(await cert.pendingRedemptionAssets()).to.equal(0);
  });

  it("previewRedeem and previewWithdraw revert, as ERC-7540 requires", async () => {
    const { cert } = await matured();
    await expect(cert.previewRedeem(E("1"))).to.be.revertedWithCustomError(cert, "AsyncRedeemOnly");
    await expect(cert.previewWithdraw(E("1"))).to.be.revertedWithCustomError(cert, "AsyncRedeemOnly");
  });

  it("lets an operator act for the controller", async () => {
    const { cert, alice, bob } = await matured();

    await expect(cert.connect(alice).setOperator(bob.address, true)).to.emit(cert, "OperatorSet");
    expect(await cert.isOperator(alice.address, bob.address)).to.equal(true);

    await cert.connect(bob).requestRedeem(E("6000"), alice.address, alice.address);
    await cert.fulfillRedeem([alice.address]);
    await expect(cert.connect(bob).redeem(E("6000"), bob.address, alice.address)).to.not.be.reverted;
  });

  it("refuses a stranger acting on someone's request", async () => {
    const { cert, alice, bob } = await matured();

    await cert.connect(alice).requestRedeem(E("6000"), alice.address, alice.address);
    await cert.fulfillRedeem([alice.address]);

    await expect(
      cert.connect(bob).redeem(E("6000"), bob.address, alice.address),
    ).to.be.revertedWithCustomError(cert, "NotControllerOrOperator");
  });

  it("refuses claims before fulfilment and above the claimable amount", async () => {
    const { cert, alice } = await matured();

    await cert.connect(alice).requestRedeem(E("6000"), alice.address, alice.address);
    await expect(
      cert.connect(alice).redeem(E("6000"), alice.address, alice.address),
    ).to.be.revertedWithCustomError(cert, "NoClaimableRequest");

    await cert.fulfillRedeem([alice.address]);
    await expect(
      cert.connect(alice).redeem(E("6001"), alice.address, alice.address),
    ).to.be.revertedWithCustomError(cert, "ExceedsClaimable");
  });

  it("will not fulfil while the treasury still owes principal", async () => {
    const f = await active();
    await time.increase(TENOR);
    await f.cert.connect(f.treasury).returnFromTreasury(E("9000"));
    // markMatured is blocked, so redemption cannot open with money outstanding.
    await expect(f.cert.markMatured()).to.be.revertedWithCustomError(f.cert, "TreasuryOutstanding");
  });

  it("claiming stays open after the issue is closed", async () => {
    const { cert, bob } = await matured();

    await cert.closeIssue();
    expect(await cert.phase()).to.equal(4);

    await cert.connect(bob).requestRedeem(E("4000"), bob.address, bob.address);
    await cert.fulfillRedeem([bob.address]);
    await expect(cert.connect(bob).redeem(E("4000"), bob.address, bob.address)).to.not.be.reverted;
  });

  it("advertises the ERC-7540 and ERC-7575 interface ids", async () => {
    const { cert } = await matured();
    expect(await cert.supportsInterface("0xe3bc4e65")).to.equal(true); // operator methods
    expect(await cert.supportsInterface("0x620ee8e4")).to.equal(true); // async redeem
    expect(await cert.supportsInterface("0x2f0a18c5")).to.equal(true); // ERC-7575
    expect(await cert.share()).to.equal(await cert.getAddress());
  });
});

describe("SukukCertificate — phases and emergency", () => {
  it("runs the phases in order and refuses to skip", async () => {
    const f = await subscribed();

    await expect(f.cert.markMatured()).to.be.revertedWithCustomError(f.cert, "WrongPhase");
    await expect(f.cert.connect(f.auditor).openRedemption()).to.be.revertedWithCustomError(f.cert, "WrongPhase");

    await f.cert.connect(f.auditor).closeSubscription();
    expect(await f.cert.phase()).to.equal(1);

    await expect(f.cert.connect(f.alice).deposit(E("100"), f.alice.address)).to.be.revertedWithCustomError(
      f.cert,
      "WrongPhase",
    );
    await expect(f.cert.markMatured()).to.be.revertedWithCustomError(f.cert, "NotMatured");
  });

  it("will not close an empty subscription", async () => {
    const f = await loadFixture(deployFixture);
    await f.cert.openIssue(QUOTA, DENOM, TENOR, RATE, INTERVAL);
    await expect(f.cert.connect(f.auditor).closeSubscription()).to.be.revertedWithCustomError(
      f.cert,
      "NothingIssued",
    );
  });

  it("keeps the auditor gates away from the protocol admin", async () => {
    const { cert, admin } = await subscribed();

    await expect(cert.closeSubscription()).to.be.revertedWithCustomError(cert, "AccessControlUnauthorizedAccount");
    await expect(cert.grantRole(await cert.AUDITOR_ROLE(), admin.address)).to.be.revertedWithCustomError(
      cert,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("opens the issue only once", async () => {
    const f = await subscribed();
    await expect(f.cert.openIssue(QUOTA, DENOM, TENOR, RATE, INTERVAL)).to.be.revertedWithCustomError(
      f.cert,
      "IssueAlreadyOpened",
    );
  });

  it("pause stops deposits, transfers and claims", async () => {
    const { cert, alice, bob } = await active();

    await time.increase(INTERVAL);
    await cert.fundCoupon(E("300"));
    await cert.pause();

    expect(await cert.maxDeposit(alice.address)).to.equal(0);
    await expect(cert.connect(alice).transfer(bob.address, E("1"))).to.be.revertedWithCustomError(
      cert,
      "EnforcedPause",
    );
    await expect(cert.connect(alice)["claimCoupon()"]()).to.be.revertedWithCustomError(cert, "EnforcedPause");

    await cert.unpause();
    await expect(cert.connect(alice)["claimCoupon()"]()).to.not.be.reverted;
  });

  it("reports maxDeposit against the remaining quota", async () => {
    const f = await loadFixture(deployFixture);
    expect(await f.cert.maxDeposit(f.alice.address)).to.equal(0); // no issue yet

    await f.cert.openIssue(QUOTA, DENOM, TENOR, RATE, INTERVAL);
    expect(await f.cert.maxDeposit(f.alice.address)).to.equal(QUOTA);

    await f.cert.connect(f.alice).deposit(E("6000"), f.alice.address);
    expect(await f.cert.maxDeposit(f.alice.address)).to.equal(E("4000"));

    await f.cert.connect(f.auditor).closeSubscription();
    expect(await f.cert.maxDeposit(f.alice.address)).to.equal(0);
  });

  it("is donation proof", async () => {
    const { cert, idrx, admin } = await subscribed();

    await idrx.connect(admin).transfer(await cert.getAddress(), E("5000"));

    expect(await cert.totalAssets()).to.equal(E("10000"));
    expect(await cert.convertToAssets(E("1"))).to.equal(E("1"));
  });
});

describe("SukukCertificate — issue volume and request accounting", () => {
  it("fixes issueVolume at close and keeps it through redemption", async () => {
    const f = await subscribed();
    expect(await f.cert.issueVolume()).to.equal(E("10000"));

    await f.cert.connect(f.auditor).closeSubscription();
    expect(await f.cert.issueVolume()).to.equal(E("10000"));

    await time.increase(TENOR);
    await f.cert.markMatured();
    await f.cert.connect(f.auditor).openRedemption();
    await f.cert.connect(f.alice).requestRedeem(E("6000"), f.alice.address, f.alice.address);

    // Outstanding principal falls, but the issue volume is a property of the issue.
    expect(await f.cert.totalAssets()).to.equal(E("4000"));
    expect(await f.cert.issueVolume()).to.equal(E("10000"));
  });

  it("values a request when it is made, not when it is settled", async () => {
    const f = await subscribed();
    await f.cert.connect(f.auditor).closeSubscription();
    await time.increase(TENOR);
    await f.cert.markMatured();
    await f.cert.connect(f.auditor).openRedemption();

    await f.cert.connect(f.alice).requestRedeem(E("2000"), f.alice.address, f.alice.address);
    await f.cert.connect(f.alice).requestRedeem(E("1000"), f.alice.address, f.alice.address);
    expect(await f.cert.pendingRedeemRequest(0, f.alice.address)).to.equal(E("3000"));

    await f.cert.fulfillRedeem([f.alice.address]);
    expect(await f.cert.claimableRedeemRequest(0, f.alice.address)).to.equal(E("3000"));
    expect(await f.cert.maxWithdraw(f.alice.address)).to.equal(E("3000"));

    const before = await f.idrx.balanceOf(f.alice.address);
    await f.cert.connect(f.alice).redeem(E("3000"), f.alice.address, f.alice.address);
    expect((await f.idrx.balanceOf(f.alice.address)) - before).to.equal(E("3000"));
  });
});
