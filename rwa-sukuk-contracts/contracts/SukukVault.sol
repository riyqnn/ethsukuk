// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VaultErrors} from "./libraries/VaultErrors.sol";

/**
 * @title SukukVault
 * @notice ERC-4626 yield-bearing vault that tokenizes an RWA Sukuk. Investors deposit
 *         the `IDRX` stablecoin and receive `sSUKUK` shares; at maturity the protocol
 *         funds the yield, the auditor approves the payout, and investors redeem their
 *         shares (principal + yield) at the resulting exchange rate.
 *
 * @dev Access control is enforced through OpenZeppelin `AccessControl`:
 *      - `PROTOCOL_ROLE` (admin/treasury) can create the vault, top up the quota,
 *        fund the payout and close the vault.
 *      - `AUDITOR_ROLE` (a Gnosis Safe / Safe{Core} multisig) approves the vault
 *        (locking funds) and approves the payout (re-opening redemptions).
 *
 *      NOTE ON THE AUDITOR MULTISIG: the `AUDITOR_ROLE` SHOULD be granted to a Gnosis
 *      Safe (or other multisig) address, never a plain EOA. The 2-of-3 (or N-of-M)
 *      signing threshold is enforced OFF-CHAIN by the Safe's own module logic — this
 *      contract trusts the Safe address and cannot inspect its internal threshold.
 *      On-chain we only require that the caller holds `AUDITOR_ROLE`.
 */
contract SukukVault is ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PROTOCOL_ROLE = keccak256("PROTOCOL_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");

    /// @notice Current lifecycle state. See VaultErrors.VaultState for the linear flow.
    VaultErrors.VaultState public state;

    /// @notice Maximum amount of underlying (IDRX) the vault can hold.
    uint256 public maxQuota;

    /// @notice Duration (seconds) the vault stays locked before maturity.
    uint256 public duration;

    /// @notice Annual percentage yield in basis points (1 bp = 0.01%). Informational only.
    uint256 public apy;

    /// @notice Timestamp at which the auditor locked the vault.
    uint256 public lockStartTime;

    /// @notice Guards `createVault()` so it can only be executed once.
    bool public vaultCreated;

    /// @dev Internally tracked assets. Direct IDRX transfers ("donations") are NOT
    ///      counted, so they cannot move the share price or the quota check.
    uint256 private _managedAssets;

    // ------------------------------------------------------------------------
    // Events — one per state transition and financial action (on-chain audit trail)
    // ------------------------------------------------------------------------

    /// @notice Emitted when the protocol configures the vault (once).
    event VaultCreated(uint256 maxQuota, uint256 duration, uint256 apy);

    /// @notice Emitted on every deposit / mint (investor or protocol fill).
    event Deposited(address indexed receiver, uint256 assets, uint256 shares);

    /// @notice Emitted when the protocol tops up the quota to reach 100%.
    event ProtocolFilled(address indexed receiver, uint256 assets, uint256 shares);

    /// @notice Emitted when the auditor approves the vault and funds become locked.
    event VaultLocked(uint256 lockStartTime);

    /// @notice Emitted when the protocol funds the yield at maturity.
    event PayoutFunded(uint256 totalPayoutAmount);

    /// @notice Emitted when the auditor approves the payout, reopening redemptions.
    event PayoutApproved();

    /// @notice Emitted on every withdraw / redeem.
    event Redeemed(address indexed owner, address indexed receiver, uint256 shares, uint256 assets);

    /// @notice Emitted when the protocol closes the vault.
    event VaultClosed();

    // ------------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------------

    /**
     * @param underlying_   Address of the underlying asset (`IDRX`).
     * @param name_         Name of the share token (e.g. "Sukuk Share Token").
     * @param symbol_       Symbol of the share token (e.g. "sSUKUK").
     * @param admin_        Protocol/treasury address. Granted `DEFAULT_ADMIN_ROLE`
     *                      and `PROTOCOL_ROLE`.
     * @param auditorMultisig_ Gnosis Safe / Safe{Core} multisig address. Granted
     *                      `AUDITOR_ROLE`.
     */
    constructor(
        IERC20 underlying_,
        string memory name_,
        string memory symbol_,
        address admin_,
        address auditorMultisig_
    ) ERC20(name_, symbol_) ERC4626(underlying_) {
        require(address(underlying_).code.length > 0, "SukukVault: underlying not a contract");
        require(admin_ != address(0), "SukukVault: zero admin");
        require(auditorMultisig_ != address(0), "SukukVault: zero auditor");

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PROTOCOL_ROLE, admin_);
        _grantRole(AUDITOR_ROLE, auditorMultisig_);
        // Only the auditor Safe can manage AUDITOR_ROLE; the protocol admin cannot
        // grant itself the auditor's approval power.
        _setRoleAdmin(AUDITOR_ROLE, AUDITOR_ROLE);

        // Vault starts OPEN (funding) but maxQuota is 0, so deposits are effectively
        // blocked until createVault() sets a real quota.
        state = VaultErrors.VaultState.OPEN;
    }

    // ------------------------------------------------------------------------
    // Phase 1 — Vault configuration (protocol)
    // ------------------------------------------------------------------------

    /**
     * @notice Configures the vault's funding parameters. Callable exactly once.
     * @dev Reverts with `VaultAlreadyCreated()` on any second call. `state` is already
     *      OPEN from the constructor; this call only populates the parameters.
     * @param maxQuota_ Maximum underlying (IDRX) the vault will accept.
     * @param duration_ Lock period in seconds between `approveVault()` and maturity.
     * @param apy_      Annual percentage yield in basis points (informational).
     */
    function createVault(uint256 maxQuota_, uint256 duration_, uint256 apy_)
        external
        onlyRole(PROTOCOL_ROLE)
    {
        if (vaultCreated) revert VaultErrors.VaultAlreadyCreated();
        if (maxQuota_ == 0 || duration_ == 0) revert VaultErrors.ZeroAmount();

        vaultCreated = true;
        maxQuota = maxQuota_;
        duration = duration_;
        apy = apy_;
        state = VaultErrors.VaultState.OPEN;

        emit VaultCreated(maxQuota_, duration_, apy_);
    }

    // ------------------------------------------------------------------------
    // Phase 2 — Funding (investors + protocol top-up)
    // ------------------------------------------------------------------------

    /**
     * @notice Deposits `assets` IDRX and mints `sSUKUK` shares to `receiver`.
     * @dev Overrides ERC-4626 `deposit`. Enforced guards:
     *      - vault must be OPEN,
     *      - deposit must not exceed `maxQuota`,
     *      - reentrancy protected, pausable.
     * @param assets   Amount of IDRX to deposit.
     * @param receiver Address that receives the minted sSUKUK shares.
     * @return shares  Number of sSUKUK shares minted.
     */
    function deposit(uint256 assets, address receiver)
        public
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        if (state != VaultErrors.VaultState.OPEN) {
            revert VaultErrors.InvalidState(state, VaultErrors.VaultState.OPEN);
        }
        if (assets == 0) revert VaultErrors.ZeroAmount();
        if (totalAssets() + assets > maxQuota) revert VaultErrors.QuotaExceeded();

        shares = super.deposit(assets, receiver);
        if (shares == 0) revert VaultErrors.ZeroAmount();

        emit Deposited(receiver, assets, shares);
    }

    /**
     * @notice Mints exactly `shares` sSUKUK to `receiver`, pulling the corresponding
     *         amount of IDRX from the caller.
     * @dev Overrides ERC-4626 `mint` with the same OPEN-state and quota guards as
     *      `deposit`, so the state machine cannot be bypassed through `mint`.
     * @param shares   Number of sSUKUK shares to mint.
     * @param receiver Address that receives the minted sSUKUK shares.
     * @return assets  Amount of IDRX transferred into the vault.
     */
    function mint(uint256 shares, address receiver)
        public
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        if (state != VaultErrors.VaultState.OPEN) {
            revert VaultErrors.InvalidState(state, VaultErrors.VaultState.OPEN);
        }

        if (shares == 0) revert VaultErrors.ZeroAmount();
        assets = previewMint(shares);
        if (totalAssets() + assets > maxQuota) revert VaultErrors.QuotaExceeded();

        assets = super.mint(shares, receiver);

        emit Deposited(receiver, assets, shares);
    }

    /**
     * @notice Allows the protocol to top up the vault so the quota reaches 100%.
     * @dev Shares are minted to the caller (the protocol/treasury address) at the
     *      current ERC-4626 exchange rate. Uses `SafeERC20.safeTransferFrom`, so the
     *      caller must first `approve` the vault to spend `amount` IDRX.
     * @param amount Amount of IDRX to deposit on behalf of the protocol.
     * @return shares Number of sSUKUK shares minted to the caller.
     */
    function protocolFill(uint256 amount)
        external
        onlyRole(PROTOCOL_ROLE)
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        if (state != VaultErrors.VaultState.OPEN) {
            revert VaultErrors.InvalidState(state, VaultErrors.VaultState.OPEN);
        }
        if (amount == 0) revert VaultErrors.ZeroAmount();
        if (totalAssets() + amount > maxQuota) revert VaultErrors.QuotaExceeded();

        shares = previewDeposit(amount);
        if (shares == 0) revert VaultErrors.ZeroAmount();
        _deposit(msg.sender, msg.sender, amount, shares); // emits ERC-4626 Deposit

        emit Deposited(msg.sender, amount, shares);
        emit ProtocolFilled(msg.sender, amount, shares);
    }

    // ------------------------------------------------------------------------
    // Phase 3 — Audit 1 & lock (auditor)
    // ------------------------------------------------------------------------

    /**
     * @notice Auditor approves the vault, locking all funds until maturity.
     * @dev Transition: OPEN -> LOCKED. Sets `lockStartTime`. After this point
     *      `deposit`/`mint` revert and `redeem`/`withdraw` are disabled until the
     *      payout is approved.
     */
    function approveVault() external onlyRole(AUDITOR_ROLE) {
        if (!vaultCreated) revert VaultErrors.VaultNotCreated();
        if (state != VaultErrors.VaultState.OPEN) {
            revert VaultErrors.InvalidState(state, VaultErrors.VaultState.OPEN);
        }

        if (totalSupply() == 0) revert VaultErrors.VaultEmpty();

        state = VaultErrors.VaultState.LOCKED;
        lockStartTime = block.timestamp;

        emit VaultLocked(lockStartTime);
    }

    // ------------------------------------------------------------------------
    // Phase 4 — Maturity (protocol)
    // ------------------------------------------------------------------------

    /**
     * @notice Funds the yield at maturity, raising the sSUKUK exchange rate.
     * @dev Transition: LOCKED -> MATURED.
     *
     *      `totalPayoutAmount` is the yield/profit to be transferred INTO the vault on
     *      top of the principal already custodied from the funding phase. Because the
     *      principal never leaves the vault (there is no off-chain deploy step in this
     *      reference implementation), `totalAssets()` increases by exactly this amount
     *      and the exchange rate rises proportionally — e.g. deposit 1000 IDRX ->
     *      1000 sSUKUK, then `sendPayout(50)` -> 1050 IDRX at redemption.
     *
     *      Enforced time-lock: reverts with `LockPeriodNotEnded` unless
     *      `block.timestamp >= lockStartTime + duration`.
     * @param totalPayoutAmount Yield/profit amount (in IDRX) to transfer into the vault.
     */
    function sendPayout(uint256 totalPayoutAmount)
        external
        onlyRole(PROTOCOL_ROLE)
        nonReentrant
        whenNotPaused
    {
        _sendPayout(totalPayoutAmount);
    }

    /**
     * @notice Alias for `sendPayout` (kept for API clarity: the protocol "deposits" yield).
     * @param totalPayoutAmount Yield/profit amount (in IDRX) to transfer into the vault.
     */
    function depositYield(uint256 totalPayoutAmount)
        external
        onlyRole(PROTOCOL_ROLE)
        nonReentrant
        whenNotPaused
    {
        _sendPayout(totalPayoutAmount);
    }

    /**
     * @dev Internal implementation shared by `sendPayout` and `depositYield`.
     */
    function _sendPayout(uint256 totalPayoutAmount) internal {
        if (state != VaultErrors.VaultState.LOCKED) {
            revert VaultErrors.InvalidState(state, VaultErrors.VaultState.LOCKED);
        }

        uint256 unlockTime = lockStartTime + duration;
        if (block.timestamp < unlockTime) {
            revert VaultErrors.LockPeriodNotEnded(block.timestamp, unlockTime);
        }
        if (totalPayoutAmount == 0) revert VaultErrors.ZeroAmount();

        // Checks-Effects-Interactions: update state before external token transfer.
        state = VaultErrors.VaultState.MATURED;
        _managedAssets += totalPayoutAmount;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), totalPayoutAmount);

        emit PayoutFunded(totalPayoutAmount);
    }

    // ------------------------------------------------------------------------
    // Phase 5 — Audit 2 & redemption (auditor + investors)
    // ------------------------------------------------------------------------

    /**
     * @notice Auditor verifies the funded payout and re-opens redemptions.
     * @dev Transition: MATURED -> APPROVED_FOR_PAYOUT.
     *
     *      The nominal sufficiency of the payout is verified OFF-CHAIN by the auditor
     *      (e.g. checking the vault's IDRX balance against the expected principal +
     *      yield). This transaction records the auditor's approval on-chain for a
     *      transparent audit trail. Emits `PayoutApproved`.
     */
    function approvePayout() external onlyRole(AUDITOR_ROLE) {
        if (state != VaultErrors.VaultState.MATURED) {
            revert VaultErrors.InvalidState(state, VaultErrors.VaultState.MATURED);
        }

        state = VaultErrors.VaultState.APPROVED_FOR_PAYOUT;

        emit PayoutApproved();
    }

    /**
     * @notice Burns `shares` sSUKUK and transfers the proportional IDRX (principal +
     *         yield) to `receiver`.
     * @dev Overrides ERC-4626 `redeem`. Guard: vault must be APPROVED_FOR_PAYOUT or CLOSED.
     * @param shares   Number of sSUKUK shares to burn.
     * @param receiver Address receiving the IDRX proceeds.
     * @param owner    Address whose shares are burned.
     * @return assets  Amount of IDRX transferred.
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        _requireRedeemable();
        if (shares == 0) revert VaultErrors.ZeroAmount();

        assets = super.redeem(shares, receiver, owner);

        emit Redeemed(owner, receiver, shares, assets);
    }

    /**
     * @notice Burns the shares required to withdraw `assets` IDRX and transfers them
     *         to `receiver`.
     * @dev Overrides ERC-4626 `withdraw` with the same APPROVED_FOR_PAYOUT guard as
     *      `redeem`, so the state machine cannot be bypassed through `withdraw`.
     * @param assets   Amount of IDRX to withdraw.
     * @param receiver Address receiving the IDRX proceeds.
     * @param owner    Address whose shares are burned.
     * @return shares  Number of sSUKUK shares burned.
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        virtual
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        _requireRedeemable();
        if (assets == 0) revert VaultErrors.ZeroAmount();

        shares = super.withdraw(assets, receiver, owner);

        emit Redeemed(owner, receiver, shares, assets);
    }

    /**
     * @notice Marks the vault as fully closed. Optional terminal step.
     * @dev Transition: APPROVED_FOR_PAYOUT -> CLOSED. Redemptions stay open after close
     *      so unredeemed investors are never stranded.
     */
    function closeVault() external onlyRole(PROTOCOL_ROLE) {
        if (state != VaultErrors.VaultState.APPROVED_FOR_PAYOUT) {
            revert VaultErrors.InvalidState(state, VaultErrors.VaultState.APPROVED_FOR_PAYOUT);
        }

        state = VaultErrors.VaultState.CLOSED;

        emit VaultClosed();
    }

    // ------------------------------------------------------------------------
    // Emergency circuit breaker (protocol)
    // ------------------------------------------------------------------------

    /**
     * @notice Pauses all asset-moving functions (deposit/mint/redeem/withdraw/
     *         protocolFill/sendPayout). Only `PROTOCOL_ROLE`.
     */
    function pause() external onlyRole(PROTOCOL_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses the vault. Only `PROTOCOL_ROLE`.
     */
    function unpause() external onlyRole(PROTOCOL_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------------------------
    // ERC-4626 helpers

    /// @notice Internally tracked assets (deposits + funded payout - withdrawals).
    function totalAssets() public view override returns (uint256) {
        return _managedAssets;
    }

    /// @dev EIP-4626: returns 0 when deposits are disabled, else remaining quota.
    function maxDeposit(address) public view override returns (uint256) {
        if (paused() || state != VaultErrors.VaultState.OPEN) return 0;
        uint256 assets = totalAssets();
        return assets >= maxQuota ? 0 : maxQuota - assets;
    }

    /// @dev EIP-4626: returns 0 when minting is disabled, else remaining quota in shares.
    function maxMint(address receiver) public view override returns (uint256) {
        return _convertToShares(maxDeposit(receiver), Math.Rounding.Floor);
    }

    /// @dev EIP-4626: returns 0 when withdrawals are disabled.
    function maxWithdraw(address owner_) public view override returns (uint256) {
        return _redeemable() ? super.maxWithdraw(owner_) : 0;
    }

    /// @dev EIP-4626: returns 0 when redemptions are disabled.
    function maxRedeem(address owner_) public view override returns (uint256) {
        return _redeemable() ? super.maxRedeem(owner_) : 0;
    }

    function _redeemable() internal view returns (bool) {
        return !paused()
            && (state == VaultErrors.VaultState.APPROVED_FOR_PAYOUT || state == VaultErrors.VaultState.CLOSED);
    }

    function _requireRedeemable() internal view {
        if (state != VaultErrors.VaultState.APPROVED_FOR_PAYOUT && state != VaultErrors.VaultState.CLOSED) {
            revert VaultErrors.InvalidState(state, VaultErrors.VaultState.APPROVED_FOR_PAYOUT);
        }
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares);
        _managedAssets += assets;
    }

    function _withdraw(address caller, address receiver, address owner_, uint256 assets, uint256 shares)
        internal
        override
    {
        _managedAssets -= assets; // effects before the token transfer
        super._withdraw(caller, receiver, owner_, assets, shares);
    }

    /**
     * @notice Returns the number of decimals used by the share token.
     * @dev The share token (sSUKUK) shares the same 18 decimals as the underlying
     *      (IDRX), so the offset is 0 — the default behavior of OpenZeppelin v5.
     */
    function _decimalsOffset() internal view override returns (uint8) {
        return 0;
    }
}
