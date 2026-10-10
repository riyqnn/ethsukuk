// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC7540Redeem
 * @notice ERC-7540 asynchronous redemption, plus the operator methods every ERC-7540 vault
 *         must expose and the ERC-7575 `share()` accessor it requires.
 * @dev `redeem`, `withdraw`, `maxRedeem` and `maxWithdraw` keep their ERC-4626 signatures and so
 *      are inherited from IERC4626 by the implementing contract, with the third parameter read as
 *      the request controller rather than the share owner.
 */
interface IERC7540Redeem {
    event RedeemRequest(
        address indexed controller,
        address indexed owner,
        uint256 indexed requestId,
        address sender,
        uint256 shares
    );

    event OperatorSet(address indexed controller, address indexed operator, bool approved);

    /**
     * @notice Moves `shares` out of `owner` and opens a redemption request controlled by `controller`.
     * @return requestId Always 0: requests are discriminated by `controller` alone, which ERC-7540
     *         permits and which lets a controller hold at most one open request.
     */
    function requestRedeem(uint256 shares, address controller, address owner) external returns (uint256 requestId);

    /// @notice Shares requested by `controller` that are not claimable yet.
    function pendingRedeemRequest(uint256 requestId, address controller) external view returns (uint256 shares);

    /// @notice Shares requested by `controller` that can be claimed now.
    function claimableRedeemRequest(uint256 requestId, address controller) external view returns (uint256 shares);

    /// @notice Lets `operator` act on the caller's requests.
    function setOperator(address operator, bool approved) external returns (bool);

    function isOperator(address controller, address operator) external view returns (bool);

    /// @notice ERC-7575: the share token of this vault.
    function share() external view returns (address);
}
