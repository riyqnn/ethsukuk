// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IInvestorRegistry} from "./interfaces/IInvestorRegistry.sol";
import {IERC7092Bond, IERC7092ESG} from "./interfaces/IERC7092Bond.sol";
import {IERC7540Redeem} from "./interfaces/IERC7540Redeem.sol";

/**
 * @title SukukCertificate
 * @notice A tokenized Sukuk certificate: investors subscribe with IDRX, the principal is deployed to
 *         a Gnosis Safe treasury for the real-world project, profit is shared on a fixed schedule,
 *         and the principal is redeemed after maturity.
 *
 * @dev Four standards meet in one token, each doing one job:
 *
 *      - ERC-3643 (via {InvestorRegistry}): only KYC-verified, unfrozen wallets may hold the
 *        certificate. Adds agent freeze, forced transfer and wallet recovery.
 *      - ERC-7092: the certificate is the bond. It carries an ISIN, a denomination, an issue volume,
 *        a profit rate, an issue date and a maturity date, and reports `principalOf` per holder.
 *      - ERC-4626: the accounting layer. One share is minted per unit of principal and the exchange
 *        rate is held at 1:1 for the life of the issue, so `convertToAssets` is the investor's
 *        principal and the profit share is computed from the share balance rather than from a
 *        rising share price.
 *      - ERC-7540: redemption at maturity is asynchronous. An investor requests, the issuer
 *        fulfills once the treasury has repaid, and the investor then claims.
 *
 *      Profit is deliberately NOT compounded into the share price. A Sukuk pays periodically, so
 *      each funded period raises `accCouponPerShare` and every holder pulls their share with
 *      {claimCoupon}. Accrual follows the balance, so a transfer carries no unclaimed profit with it.
 *
 *      Roles:
 *      - PROTOCOL_ROLE: opens the issue, moves money to and from the treasury, funds profit,
 *        fulfills redemption requests, pauses.
 *      - AUDITOR_ROLE: a Gnosis Safe. Closes subscription and opens redemption. Self-administered,
 *        so PROTOCOL_ROLE cannot grant it to itself.
 *      - AGENT_ROLE: the ERC-3643 agent. Freezes wallets and tokens, forces transfers, recovers.
 */
contract SukukCertificate is
    ERC4626,
    AccessControl,
    Pausable,
    ReentrancyGuard,
    IERC7092Bond,
    IERC7092ESG,
    IERC7540Redeem
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    bytes32 public constant PROTOCOL_ROLE = keccak256("PROTOCOL_ROLE");
    bytes32 public constant AUDITOR_ROLE = keccak256("AUDITOR_ROLE");
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    /// @dev Fixed-point scale for the per-share profit accumulator.
    uint256 private constant ACC_PRECISION = 1e18;
    uint256 private constant BPS = 10_000;
    uint256 private constant YEAR = 365 days;

    // ERC-165 identifiers defined by ERC-7540 and ERC-7575.
    bytes4 private constant IID_7540_OPERATOR = 0xe3bc4e65;
    bytes4 private constant IID_7540_ASYNC_REDEEM = 0x620ee8e4;
    bytes4 private constant IID_7575 = 0x2f0a18c5;

    /// @notice Lifecycle of the issue. Strictly forward-only.
    enum Phase {
        Subscription, // investors deposit IDRX and receive certificates
        Active, // funds locked and deployed, profit shared each period
        Matured, // tenor elapsed and the treasury has repaid the principal
        Redeeming, // auditor opened redemption; requests can be fulfilled and claimed
        Closed // settled; claiming stays open for anyone still holding
    }

    struct Terms {
        uint256 quota; // maximum principal accepted, in IDRX
        uint256 denomination; // smallest subscribable unit, in IDRX
        uint256 tenor; // seconds from issue date to maturity
        uint256 couponRate; // annual profit rate, basis points
        uint256 couponInterval; // seconds between profit payments
    }

    /// @dev One open request per controller, which is why `requestId` is always 0.
    struct Request {
        uint256 pendingShares;
        uint256 pendingAssets;
        uint256 claimableShares;
        uint256 claimableAssets;
    }

    Phase public phase;
    Terms public terms;
    string public isin;

    address public treasury;

    uint256 public issueDate;
    uint256 public maturityDate;
    /// @dev Principal raised, frozen when the offer closes so redemptions cannot shrink it.
    uint256 private _issuedVolume;
    uint256 public lastCouponDate;
    uint256 public couponsPaid;

    IInvestorRegistry public registry;

    /// @dev Principal backing outstanding certificates. `totalAssets`, so the rate stays 1:1.
    uint256 private _principal;
    /// @dev Part of `_principal` currently held by the treasury.
    uint256 public deployedToTreasury;
    /// @dev IDRX held for unclaimed profit.
    uint256 public couponPool;
    /// @dev Principal carved out by redemption requests and not yet claimed.
    uint256 public pendingRedemptionAssets;

    uint256 public accCouponPerShare;
    mapping(address holder => uint256) private _couponDebt;
    mapping(address holder => uint256) public unclaimedCoupon;
    /// @notice Total profit ever claimed by `holder`, for statements.
    mapping(address holder => uint256) public couponClaimed;

    mapping(address holder => bool) public isFrozen;
    mapping(address holder => uint256) public getFrozenTokens;

    mapping(address controller => Request) private _requests;
    mapping(address controller => mapping(address operator => bool)) private _operators;

    event IssueOpened(uint256 quota, uint256 denomination, uint256 tenor, uint256 couponRate, uint256 couponInterval);
    event SubscriptionClosed(uint256 issueDate, uint256 maturityDate, uint256 issueVolume);
    event TreasuryUpdated(address indexed treasury);
    event AllocatedToTreasury(address indexed treasury, uint256 amount);
    event ReturnedFromTreasury(address indexed from, uint256 amount);
    event CouponFunded(uint256 indexed period, uint256 amount, uint256 perShare, uint256 paidAt);
    event CouponClaimed(address indexed holder, address indexed receiver, uint256 amount);
    event Matured(uint256 at);
    event RedemptionOpened(uint256 at);
    event RedeemFulfilled(address indexed controller, uint256 shares, uint256 assets);
    event IssueClosed(uint256 at);
    event RegistryUpdated(address indexed registry);
    event AddressFrozen(address indexed holder, bool frozen, address indexed agent);
    event TokensFrozen(address indexed holder, uint256 amount);
    event TokensUnfrozen(address indexed holder, uint256 amount);
    event RecoverySuccess(address indexed lostWallet, address indexed newWallet);

    error ZeroAddress();
    error ZeroAmount();
    error WrongPhase(Phase current, Phase required);
    error IssueAlreadyOpened();
    error QuotaExceeded(uint256 remaining);
    error NotDenominationMultiple(uint256 denomination);
    error NotVerified(address account);
    error WalletFrozen(address account);
    error InsufficientUnfrozen(uint256 free, uint256 needed);
    error NothingIssued();
    error CouponTooEarly(uint256 nowTs, uint256 dueAt);
    error NotMatured(uint256 nowTs, uint256 maturityAt);
    error TreasuryOutstanding(uint256 amount);
    error InsufficientTreasuryBalance(uint256 available);
    error NoClaimableRequest();
    error ExceedsClaimable(uint256 claimable);
    error NotControllerOrOperator(address caller);
    error AsyncRedeemOnly();

    /**
     * @param underlying_ IDRX (or MockIDRX on a testnet).
     * @param name_       Certificate name.
     * @param symbol_     Certificate symbol.
     * @param isin_       ISIN of the issue, or an empty string.
     * @param admin_      Receives DEFAULT_ADMIN_ROLE, PROTOCOL_ROLE and AGENT_ROLE.
     * @param auditorSafe_ Gnosis Safe granted AUDITOR_ROLE.
     * @param treasury_   Gnosis Safe that holds the deployed principal.
     * @param registry_   KYC registry consulted on every transfer.
     */
    constructor(
        IERC20 underlying_,
        string memory name_,
        string memory symbol_,
        string memory isin_,
        address admin_,
        address auditorSafe_,
        address treasury_,
        IInvestorRegistry registry_
    ) ERC20(name_, symbol_) ERC4626(underlying_) {
        if (address(underlying_).code.length == 0) revert ZeroAddress();
        if (admin_ == address(0) || auditorSafe_ == address(0)) revert ZeroAddress();
        if (treasury_ == address(0) || address(registry_) == address(0)) revert ZeroAddress();

        isin = isin_;
        treasury = treasury_;
        registry = registry_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PROTOCOL_ROLE, admin_);
        _grantRole(AGENT_ROLE, admin_);
        _grantRole(AUDITOR_ROLE, auditorSafe_);
        // Only the Safe can hand out AUDITOR_ROLE, so the protocol admin cannot approve its own issue.
        _setRoleAdmin(AUDITOR_ROLE, AUDITOR_ROLE);
    }

    // ==================================================================
    // 1. Issue terms
    // ==================================================================

    /**
     * @notice Sets the terms of the issue and opens subscription. Callable once.
     * @param quota_ Maximum principal in IDRX.
     * @param denomination_ Smallest subscribable unit in IDRX.
     * @param tenor_ Seconds from issue date to maturity (three years in production).
     * @param couponRate_ Annual profit rate in basis points.
     * @param couponInterval_ Seconds between profit payments (90 days in production).
     */
    function openIssue(
        uint256 quota_,
        uint256 denomination_,
        uint256 tenor_,
        uint256 couponRate_,
        uint256 couponInterval_
    ) external onlyRole(PROTOCOL_ROLE) {
        if (terms.quota != 0) revert IssueAlreadyOpened();
        if (quota_ == 0 || denomination_ == 0 || tenor_ == 0 || couponInterval_ == 0) revert ZeroAmount();
        if (couponInterval_ > tenor_) revert ZeroAmount();

        terms = Terms({
            quota: quota_,
            denomination: denomination_,
            tenor: tenor_,
            couponRate: couponRate_,
            couponInterval: couponInterval_
        });

        emit IssueOpened(quota_, denomination_, tenor_, couponRate_, couponInterval_);
    }

    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();
        if (deployedToTreasury != 0) revert TreasuryOutstanding(deployedToTreasury);
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setRegistry(IInvestorRegistry registry_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(registry_) == address(0)) revert ZeroAddress();
        registry = registry_;
        emit RegistryUpdated(address(registry_));
    }

    // ==================================================================
    // 2. Subscription (ERC-4626 deposit, synchronous)
    // ==================================================================

    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        _requirePhase(Phase.Subscription);
        // Checked before the quota so an unverified investor is told the real reason.
        if (!registry.isVerified(receiver)) revert NotVerified(receiver);
        _requireSubscribable(assets);
        uint256 shares = super.deposit(assets, receiver);
        if (shares == 0) revert ZeroAmount();
        _principal += assets;
        return shares;
    }

    function mint(uint256 shares, address receiver) public override nonReentrant whenNotPaused returns (uint256) {
        _requirePhase(Phase.Subscription);
        if (!registry.isVerified(receiver)) revert NotVerified(receiver);
        if (shares == 0) revert ZeroAmount();
        _requireSubscribable(previewMint(shares));
        uint256 assets = super.mint(shares, receiver);
        _principal += assets;
        return assets;
    }

    function _requireSubscribable(uint256 assets) private view {
        if (assets == 0) revert ZeroAmount();
        if (assets % terms.denomination != 0) revert NotDenominationMultiple(terms.denomination);
        uint256 remaining = terms.quota - _principal;
        if (assets > remaining) revert QuotaExceeded(remaining);
    }

    /// @notice Auditor Safe closes subscription and starts the tenor.
    function closeSubscription() external onlyRole(AUDITOR_ROLE) {
        _requirePhase(Phase.Subscription);
        if (totalSupply() == 0) revert NothingIssued();

        phase = Phase.Active;
        issueDate = block.timestamp;
        maturityDate = block.timestamp + terms.tenor;
        lastCouponDate = block.timestamp;
        _issuedVolume = _principal;

        emit SubscriptionClosed(issueDate, maturityDate, _principal);
    }

    // ==================================================================
    // 3. Treasury (Gnosis Safe)
    // ==================================================================

    /// @notice Sends principal to the treasury Safe, which funds the real-world project.
    function allocateToTreasury(uint256 amount) external onlyRole(PROTOCOL_ROLE) nonReentrant whenNotPaused {
        _requirePhase(Phase.Active);
        if (amount == 0) revert ZeroAmount();

        uint256 available = _principal - deployedToTreasury;
        if (amount > available) revert InsufficientTreasuryBalance(available);

        deployedToTreasury += amount;
        IERC20(asset()).safeTransfer(treasury, amount);

        emit AllocatedToTreasury(treasury, amount);
    }

    /// @notice Returns principal from the treasury. The caller must have approved this contract.
    function returnFromTreasury(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > deployedToTreasury) revert InsufficientTreasuryBalance(deployedToTreasury);

        deployedToTreasury -= amount;
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        emit ReturnedFromTreasury(msg.sender, amount);
    }

    // ==================================================================
    // 4. Profit sharing
    // ==================================================================

    /**
     * @notice Funds one profit period. Raises every holder's claim in proportion to their shares.
     * @dev The amount is not checked against {expectedCouponAmount} on-chain: the contract cannot
     *      know what the project actually earned. The auditor Safe compares the two off-chain, and
     *      both figures are on-chain for anyone to check.
     */
    function fundCoupon(uint256 amount) external onlyRole(PROTOCOL_ROLE) nonReentrant whenNotPaused {
        _requirePhase(Phase.Active);
        if (amount == 0) revert ZeroAmount();

        uint256 dueAt = lastCouponDate + terms.couponInterval;
        if (block.timestamp < dueAt) revert CouponTooEarly(block.timestamp, dueAt);

        uint256 supply = totalSupply();
        if (supply == 0) revert NothingIssued();

        uint256 perShare = amount.mulDiv(ACC_PRECISION, supply);
        accCouponPerShare += perShare;
        couponPool += amount;
        lastCouponDate = dueAt;
        couponsPaid += 1;

        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        emit CouponFunded(couponsPaid, amount, perShare, block.timestamp);
    }

    /// @notice Pays the caller's accrued profit to `receiver`.
    function claimCoupon(address receiver) public nonReentrant whenNotPaused returns (uint256 amount) {
        if (receiver == address(0)) revert ZeroAddress();

        _accrue(msg.sender);
        amount = unclaimedCoupon[msg.sender];
        if (amount == 0) revert ZeroAmount();

        unclaimedCoupon[msg.sender] = 0;
        couponClaimed[msg.sender] += amount;
        couponPool -= amount;

        IERC20(asset()).safeTransfer(receiver, amount);

        emit CouponClaimed(msg.sender, receiver, amount);
    }

    function claimCoupon() external returns (uint256) {
        return claimCoupon(msg.sender);
    }

    /// @notice Profit `holder` can claim right now.
    function claimableCoupon(address holder) public view returns (uint256) {
        return unclaimedCoupon[holder] + _accrued(holder);
    }

    /// @notice Profit one period should pay at the stated rate, for comparison with what was funded.
    function expectedCouponAmount() public view returns (uint256) {
        return _principal.mulDiv(terms.couponRate * terms.couponInterval, BPS * YEAR);
    }

    /// @notice Timestamp the next profit payment is due. Zero before the issue is active.
    function nextCouponDate() external view returns (uint256) {
        if (phase != Phase.Active) return 0;
        return lastCouponDate + terms.couponInterval;
    }

    function _accrued(address holder) private view returns (uint256) {
        return balanceOf(holder).mulDiv(accCouponPerShare, ACC_PRECISION) - _couponDebt[holder];
    }

    /// @dev Banks what `holder` has earned on its current balance, then resets the debt marker.
    function _accrue(address holder) private {
        if (holder == address(0)) return;
        uint256 owed = _accrued(holder);
        if (owed != 0) unclaimedCoupon[holder] += owed;
        _couponDebt[holder] = balanceOf(holder).mulDiv(accCouponPerShare, ACC_PRECISION);
    }

    // ==================================================================
    // 5. Maturity and redemption (ERC-7540, asynchronous)
    // ==================================================================

    /// @notice Marks the tenor elapsed. The treasury must have repaid the whole principal first.
    function markMatured() external onlyRole(PROTOCOL_ROLE) {
        _requirePhase(Phase.Active);
        if (block.timestamp < maturityDate) revert NotMatured(block.timestamp, maturityDate);
        if (deployedToTreasury != 0) revert TreasuryOutstanding(deployedToTreasury);

        phase = Phase.Matured;
        emit Matured(block.timestamp);
    }

    /// @notice Auditor Safe opens redemption once it has checked the returned principal.
    function openRedemption() external onlyRole(AUDITOR_ROLE) {
        _requirePhase(Phase.Matured);

        phase = Phase.Redeeming;
        emit RedemptionOpened(block.timestamp);
    }

    function closeIssue() external onlyRole(PROTOCOL_ROLE) {
        _requirePhase(Phase.Redeeming);

        phase = Phase.Closed;
        emit IssueClosed(block.timestamp);
    }

    /**
     * @notice Opens a redemption request. The shares leave `owner` immediately, as ERC-7540 requires,
     *         and the matching principal is carved out of `totalAssets` so the rate stays 1:1 for
     *         everyone still holding.
     */
    function requestRedeem(uint256 shares, address controller, address owner)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 requestId)
    {
        if (phase != Phase.Redeeming && phase != Phase.Closed) revert WrongPhase(phase, Phase.Redeeming);
        if (shares == 0) revert ZeroAmount();
        if (controller == address(0)) revert ZeroAddress();
        if (msg.sender != owner && !_operators[owner][msg.sender]) revert NotControllerOrOperator(msg.sender);

        uint256 free = balanceOf(owner) - getFrozenTokens[owner];
        if (shares > free) revert InsufficientUnfrozen(free, shares);

        uint256 assets = convertToAssets(shares);

        // Burn now: ERC-7540 allows it, and it keeps the exiting holder from accruing further profit.
        _burn(owner, shares);
        _principal -= assets;
        pendingRedemptionAssets += assets;

        // The rate is recorded now, so fulfilment cannot value the request differently.
        Request storage req = _requests[controller];
        req.pendingShares += shares;
        req.pendingAssets += assets;

        emit RedeemRequest(controller, owner, 0, msg.sender, shares);
        return 0;
    }

    /// @notice Issuer marks requests claimable. Only possible once the treasury has repaid.
    function fulfillRedeem(address[] calldata controllers) external onlyRole(PROTOCOL_ROLE) nonReentrant {
        if (deployedToTreasury != 0) revert TreasuryOutstanding(deployedToTreasury);

        for (uint256 i = 0; i < controllers.length; ++i) {
            Request storage req = _requests[controllers[i]];
            uint256 shares = req.pendingShares;
            if (shares == 0) continue;

            uint256 assets = req.pendingAssets;
            req.pendingShares = 0;
            req.pendingAssets = 0;
            req.claimableShares += shares;
            req.claimableAssets += assets;

            emit RedeemFulfilled(controllers[i], shares, assets);
        }
    }

    function redeem(uint256 shares, address receiver, address controller)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        _requireController(controller);
        Request storage req = _requests[controller];
        if (req.claimableShares == 0) revert NoClaimableRequest();
        if (shares > req.claimableShares) revert ExceedsClaimable(req.claimableShares);

        assets = req.claimableAssets.mulDiv(shares, req.claimableShares);
        req.claimableShares -= shares;
        req.claimableAssets -= assets;

        _settleClaim(receiver, controller, assets, shares);
    }

    function withdraw(uint256 assets, address receiver, address controller)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        _requireController(controller);
        Request storage req = _requests[controller];
        if (req.claimableAssets == 0) revert NoClaimableRequest();
        if (assets > req.claimableAssets) revert ExceedsClaimable(req.claimableAssets);

        shares = req.claimableShares.mulDiv(assets, req.claimableAssets);
        req.claimableShares -= shares;
        req.claimableAssets -= assets;

        _settleClaim(receiver, controller, assets, shares);
    }

    function _settleClaim(address receiver, address controller, uint256 assets, uint256 shares) private {
        if (receiver == address(0)) revert ZeroAddress();
        if (assets == 0) revert ZeroAmount();

        pendingRedemptionAssets -= assets;
        IERC20(asset()).safeTransfer(receiver, assets);

        // Shares were burned at request time, so this only reports the claim.
        emit Withdraw(msg.sender, receiver, controller, assets, shares);
    }

    function _requireController(address controller) private view {
        if (msg.sender != controller && !_operators[controller][msg.sender]) {
            revert NotControllerOrOperator(msg.sender);
        }
    }

    function pendingRedeemRequest(uint256, address controller) external view returns (uint256) {
        return _requests[controller].pendingShares;
    }

    function claimableRedeemRequest(uint256, address controller) external view returns (uint256) {
        return _requests[controller].claimableShares;
    }

    function setOperator(address operator, bool approved) external returns (bool) {
        if (operator == msg.sender) revert ZeroAddress();
        _operators[msg.sender][operator] = approved;
        emit OperatorSet(msg.sender, operator, approved);
        return true;
    }

    function isOperator(address controller, address operator) external view returns (bool) {
        return _operators[controller][operator];
    }

    /// @notice ERC-7575: this vault is its own share token.
    function share() external view returns (address) {
        return address(this);
    }

    // ==================================================================
    // 6. ERC-3643 compliance
    // ==================================================================

    /// @notice Freezes or unfreezes a whole wallet.
    function setAddressFrozen(address holder, bool frozen) public onlyRole(AGENT_ROLE) {
        isFrozen[holder] = frozen;
        emit AddressFrozen(holder, frozen, msg.sender);
    }

    /// @notice Freezes part of a holder's balance, leaving the rest transferable.
    function freezePartialTokens(address holder, uint256 amount) external onlyRole(AGENT_ROLE) {
        uint256 free = balanceOf(holder) - getFrozenTokens[holder];
        if (amount > free) revert InsufficientUnfrozen(free, amount);

        getFrozenTokens[holder] += amount;
        emit TokensFrozen(holder, amount);
    }

    function unfreezePartialTokens(address holder, uint256 amount) external onlyRole(AGENT_ROLE) {
        if (amount > getFrozenTokens[holder]) revert InsufficientUnfrozen(getFrozenTokens[holder], amount);

        getFrozenTokens[holder] -= amount;
        emit TokensUnfrozen(holder, amount);
    }

    /// @notice Agent moves tokens regardless of freezes, for a court order or a correction.
    function forcedTransfer(address from, address to, uint256 amount)
        public
        onlyRole(AGENT_ROLE)
        returns (bool)
    {
        uint256 frozen = getFrozenTokens[from];
        uint256 free = balanceOf(from) - frozen;
        if (amount > free) {
            uint256 toUnfreeze = amount - free;
            getFrozenTokens[from] = frozen - toUnfreeze;
            emit TokensUnfrozen(from, toUnfreeze);
        }
        _forced = true;
        _transfer(from, to, amount);
        _forced = false;
        return true;
    }

    /// @notice Moves a whole position to a new wallet after the old key is lost.
    function recoveryAddress(address lostWallet, address newWallet) external onlyRole(AGENT_ROLE) returns (bool) {
        if (!registry.isVerified(newWallet)) revert NotVerified(newWallet);

        uint256 balance = balanceOf(lostWallet);
        if (balance == 0) revert ZeroAmount();

        uint256 frozen = getFrozenTokens[lostWallet];
        forcedTransfer(lostWallet, newWallet, balance);

        if (frozen != 0) {
            getFrozenTokens[lostWallet] = 0;
            getFrozenTokens[newWallet] += frozen;
            emit TokensFrozen(newWallet, frozen);
        }
        if (isFrozen[lostWallet]) setAddressFrozen(newWallet, true);

        // Profit already accrued belongs to the position, so it moves too.
        uint256 owed = unclaimedCoupon[lostWallet];
        if (owed != 0) {
            unclaimedCoupon[lostWallet] = 0;
            unclaimedCoupon[newWallet] += owed;
        }

        emit RecoverySuccess(lostWallet, newWallet);
        return true;
    }

    /// @dev Set only for the duration of a forced transfer, so compliance checks can stand aside.
    bool private _forced;

    /**
     * @dev Single hook for every balance change: mint, burn and transfer. Enforces the ERC-3643
     *      rules and banks profit on both sides before the balances move.
     */
    function _update(address from, address to, uint256 value) internal override {
        bool minting = from == address(0);
        bool burning = to == address(0);

        if (!_forced) {
            if (paused()) revert EnforcedPause();
            if (!minting && isFrozen[from]) revert WalletFrozen(from);
            if (!burning && isFrozen[to]) revert WalletFrozen(to);
            if (!burning && !registry.isVerified(to)) revert NotVerified(to);

            if (!minting) {
                uint256 free = balanceOf(from) - getFrozenTokens[from];
                if (value > free) revert InsufficientUnfrozen(free, value);
            }
        }

        _accrue(from);
        _accrue(to);

        super._update(from, to, value);

        _couponDebt[from] = balanceOf(from).mulDiv(accCouponPerShare, ACC_PRECISION);
        _couponDebt[to] = balanceOf(to).mulDiv(accCouponPerShare, ACC_PRECISION);
    }

    // ==================================================================
    // 7. ERC-7092 bond view
    // ==================================================================

    function currency() external view returns (address) {
        return asset();
    }

    function denomination() external view returns (uint256) {
        return terms.denomination;
    }

    /// @notice Principal raised by this issue: the running total while the offer is open, then the
    ///         amount fixed at close, which is what ERC-7092 means by issue volume.
    function issueVolume() external view returns (uint256) {
        return phase == Phase.Subscription ? _principal : _issuedVolume;
    }

    function couponRate() external view returns (uint256) {
        return terms.couponRate;
    }

    function principalOf(address account) external view returns (uint256) {
        return convertToAssets(balanceOf(account));
    }

    function currencyOfCoupon() external view returns (address) {
        return asset();
    }

    /// @notice Fixed rate.
    function couponType() external pure returns (uint8) {
        return 1;
    }

    function couponFrequency() external view returns (uint256) {
        return terms.couponInterval == 0 ? 0 : YEAR / terms.couponInterval;
    }

    /// @notice Actual/actual.
    function dayCountBasis() external pure returns (uint8) {
        return 0;
    }

    function transfer(address to, uint256 amount, bytes calldata) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount, bytes calldata) external returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount);
        return true;
    }

    function decreaseAllowance(address spender, uint256 amount) external returns (bool) {
        uint256 current = allowance(msg.sender, spender);
        _approve(msg.sender, spender, current > amount ? current - amount : 0);
        return true;
    }

    // ==================================================================
    // 8. ERC-4626 accounting
    // ==================================================================

    /// @notice Principal backing outstanding certificates. Profit is held separately, so this
    ///         keeps the share price at exactly one unit of IDRX for the life of the issue.
    function totalAssets() public view override returns (uint256) {
        return _principal;
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (paused() || phase != Phase.Subscription || terms.quota == 0) return 0;
        return terms.quota - _principal;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return convertToShares(maxDeposit(receiver));
    }

    /// @notice ERC-7540: the claimable part of the controller's request, not their balance.
    function maxRedeem(address controller) public view override returns (uint256) {
        if (paused()) return 0;
        return _requests[controller].claimableShares;
    }

    function maxWithdraw(address controller) public view override returns (uint256) {
        if (paused()) return 0;
        return _requests[controller].claimableAssets;
    }

    /// @dev ERC-7540 requires both previews to revert on an asynchronous vault.
    function previewRedeem(uint256) public pure override returns (uint256) {
        revert AsyncRedeemOnly();
    }

    function previewWithdraw(uint256) public pure override returns (uint256) {
        revert AsyncRedeemOnly();
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 0;
    }

    // ==================================================================
    // 9. Emergency
    // ==================================================================

    function pause() external onlyRole(PROTOCOL_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PROTOCOL_ROLE) {
        _unpause();
    }

    // ==================================================================
    // Internals
    // ==================================================================

    function _requirePhase(Phase required) private view {
        if (phase != required) revert WrongPhase(phase, required);
    }

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl) returns (bool) {
        return interfaceId == IID_7540_OPERATOR || interfaceId == IID_7540_ASYNC_REDEEM || interfaceId == IID_7575
            || interfaceId == type(IERC7092Bond).interfaceId || interfaceId == type(IERC20).interfaceId
            || interfaceId == type(IERC20Metadata).interfaceId || super.supportsInterface(interfaceId);
    }
}
