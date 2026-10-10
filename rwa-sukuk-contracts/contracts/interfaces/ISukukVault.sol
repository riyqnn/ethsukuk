// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {VaultErrors} from "../libraries/VaultErrors.sol";

/**
 * @title ISukukVault
 * @notice Public interface for `SukukVault`, exposing the role-based access control
 *         surface, the lifecycle state machine, and the overridden ERC-4626 actions.
 */
interface ISukukVault is IERC4626 {
    // Roles
    function PROTOCOL_ROLE() external view returns (bytes32);
    function AUDITOR_ROLE() external view returns (bytes32);

    // State
    function state() external view returns (VaultErrors.VaultState);
    function maxQuota() external view returns (uint256);
    function duration() external view returns (uint256);
    function apy() external view returns (uint256);
    function lockStartTime() external view returns (uint256);
    function vaultCreated() external view returns (bool);

    // Phase 1
    function createVault(uint256 maxQuota_, uint256 duration_, uint256 apy_) external;

    // Phase 2
    function protocolFill(uint256 amount) external returns (uint256 shares);

    // Phase 3
    function approveVault() external;

    // Phase 4
    function sendPayout(uint256 totalPayoutAmount) external;
    function depositYield(uint256 totalPayoutAmount) external;

    // Phase 5
    function approvePayout() external;
    function closeVault() external;

    // Emergency
    function pause() external;
    function unpause() external;

    // Events
    event VaultCreated(uint256 maxQuota, uint256 duration, uint256 apy);
    event Deposited(address indexed receiver, uint256 assets, uint256 shares);
    event ProtocolFilled(address indexed receiver, uint256 assets, uint256 shares);
    event VaultLocked(uint256 lockStartTime);
    event PayoutFunded(uint256 totalPayoutAmount);
    event PayoutApproved();
    event Redeemed(address indexed owner, address indexed receiver, uint256 shares, uint256 assets);
    event VaultClosed();
}
