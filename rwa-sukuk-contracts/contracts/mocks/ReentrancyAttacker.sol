// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SukukVault} from "../SukukVault.sol";

/**
 * @title ReentrancyAttacker
 * @notice Test-only malicious investor. Deposits into a vault, then during redemption
 *         the underlying (MaliciousToken) re-enters `tryReenter()`, which attempts a
 *         second `redeem()` inside the same call. The vault's `nonReentrant` guard
 *         must make that second call revert.
 */
contract ReentrancyAttacker {
    SukukVault public vault;
    IERC20 public token;

    constructor(SukukVault vault_, IERC20 token_) {
        vault = vault_;
        token = token_;
    }

    /// @notice Approve the vault and deposit `assets` of the underlying token.
    function deposit(uint256 assets) external {
        token.approve(address(vault), assets);
        vault.deposit(assets, address(this));
    }

    /// @notice Initiate a redemption, triggering the malicious token's re-entrant hook.
    function attack(uint256 shares) external {
        vault.redeem(shares, address(this), address(this));
    }

    /// @notice Re-entrant call target. Should always revert due to the nonReentrant guard.
    function tryReenter(uint256 shares) external {
        vault.redeem(shares, address(this), address(this));
    }
}
