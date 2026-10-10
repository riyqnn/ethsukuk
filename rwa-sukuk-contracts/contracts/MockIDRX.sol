// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockIDRX
 * @notice DEV/TESTNET ONLY. NOT the official IDRX. Mock stand-in for the underlying asset of the
 *         Sukuk vaults. Mintable only by the owner to serve as a testnet faucet.
 * @dev This is a stand-in for a real fiat-backed stablecoin (e.g. a regulated IDR
 *      stablecoin). It uses 18 decimals to remain fully compatible with the
 *      OpenZeppelin ERC-4626 implementation's default `_decimalsOffset()` of 0.
 */
contract MockIDRX is ERC20, Ownable {
    /**
     * @param initialOwner Address that will hold the `DEFAULT_ADMIN_ROLE` (and thus
     *                    the sole `mint()` permission) — typically the deployer.
     */
    constructor(address initialOwner) ERC20("Mock IDRX", "mIDRX") Ownable(initialOwner) {}

    /**
     * @notice Mints `amount` IDRX to `to`. Only callable by the owner.
     * @dev Used exclusively for testing / testnet faucet purposes. In a production
     *      deployment the underlying stablecoin would be issued by the regulated
     *      fiat-backing entity, not minted by this contract.
     * @param to Address receiving the newly minted tokens.
     * @param amount Number of tokens (in 18-decimal wei) to mint.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
