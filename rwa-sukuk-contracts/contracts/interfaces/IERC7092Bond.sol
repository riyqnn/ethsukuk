// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC7092Bond
 * @notice The ERC-7092 (Financial Bonds) surface that is not already part of ERC-20.
 * @dev ERC-7092 also specifies `name`, `symbol`, `approve`, `allowance` and the `Transfer` and
 *      `Approval` events. Those come from the ERC-20 base of the implementing contract, so they
 *      are deliberately left out here: re-declaring them would force an override on every
 *      inherited ERC-20 member for no benefit.
 *
 *      The batch and cross-chain extensions of ERC-7092 are OPTIONAL and are not implemented.
 */
interface IERC7092Bond {
    /// @notice International Securities Identification Number of the issue, empty when unassigned.
    function isin() external view returns (string memory);

    /// @notice Address of the ERC-20 token the bond is denominated and settled in.
    function currency() external view returns (address);

    /// @notice Smallest amount the bond may be issued in, expressed in `currency` units.
    function denomination() external view returns (uint256);

    /// @notice Total principal issued for this bond, in `currency` units.
    function issueVolume() external view returns (uint256);

    /// @notice Annual profit rate in basis points (1 bp = 0.01%).
    function couponRate() external view returns (uint256);

    /// @notice Unix timestamp at which the bond started running. Zero before issuance.
    function issueDate() external view returns (uint256);

    /// @notice Unix timestamp at which the principal falls due. Zero before issuance.
    function maturityDate() external view returns (uint256);

    /// @notice Principal held by `account`, in `currency` units.
    function principalOf(address account) external view returns (uint256);

    /// @notice ERC-7092 transfer carrying an arbitrary `data` payload.
    function transfer(address to, uint256 amount, bytes calldata data) external returns (bool);

    /// @notice ERC-7092 transferFrom carrying an arbitrary `data` payload.
    function transferFrom(address from, address to, uint256 amount, bytes calldata data) external returns (bool);

    /// @notice Lowers the caller's allowance for `spender`. ERC-7092 has no `increaseAllowance`.
    function decreaseAllowance(address spender, uint256 amount) external returns (bool);
}

/**
 * @title IERC7092ESG
 * @notice Optional ERC-7092 extension describing how the profit is paid.
 */
interface IERC7092ESG {
    /// @notice Token the profit is paid in. The same as `currency()` here.
    function currencyOfCoupon() external view returns (address);

    /// @notice 0 = zero coupon, 1 = fixed rate, 2 = floating rate.
    function couponType() external view returns (uint8);

    /// @notice Number of profit payments per year.
    function couponFrequency() external view returns (uint256);

    /// @notice 0 = actual/actual.
    function dayCountBasis() external view returns (uint8);
}
