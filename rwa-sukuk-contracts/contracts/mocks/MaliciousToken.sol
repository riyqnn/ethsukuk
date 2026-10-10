// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MaliciousToken
 * @notice Test-only ERC-20 whose `_update` hook can re-enter an arbitrary target
 *         during a transfer. Used to prove that `SukukVault`'s `nonReentrant` guards
 *         block reentrancy from a hostile underlying token.
 * @dev NOT for production. `arm()` configures a one-shot reentrant call that fires
 *      on the next transfer where `to == reenterTarget`.
 */
contract MaliciousToken is ERC20 {
    bool public attackArmed;
    address public reenterTarget;
    bytes public reenterData;
    bool public lastReenterSucceeded;

    constructor() ERC20("Malicious", "MAL") {
        _mint(msg.sender, 1_000_000e18);
    }

    /**
     * @notice Arms a one-shot reentrant call on the next transfer to `target`.
     */
    function arm(address target, bytes calldata data) external {
        attackArmed = true;
        reenterTarget = target;
        reenterData = data;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (attackArmed && to == reenterTarget) {
            attackArmed = false;
            (bool ok, ) = reenterTarget.call(reenterData);
            lastReenterSucceeded = ok;
        }
    }
}
