// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title VaultErrors
 * @notice Centralized custom errors and the `VaultState` enum used by `SukukVault`.
 * @dev Custom errors (rather than `require` string messages) keep revert payloads
 *      small and therefore gas-efficient. `VaultState` lives here so both the vault
 *      and the `ISukukVault` interface can reference the exact same enum without a
 *      circular import.
 */
library VaultErrors {
    /**
     * @notice Lifecycle state of a Sukuk vault.
     * @dev Transitions MUST be strictly linear and cannot be skipped:
     *      OPEN -> LOCKED -> MATURED -> APPROVED_FOR_PAYOUT -> CLOSED
     *
     *      `OPEN` and `LOCKED` are the only state names explicitly defined in the
     *      source documentation. `MATURED`, `APPROVED_FOR_PAYOUT` and `CLOSED` are
     *      technical design additions required to implement the documented guard
     *      ("redeem() MUST be blocked while LOCKED, only re-enabled after the payout
     *      has been verified by the auditor") in a safe, unambiguous way.
     */
    enum VaultState {
        OPEN,               // Funding phase: deposits accepted until maxQuota reached.
        LOCKED,             // Auditor approved the vault; funds locked, no deposits/redeems.
        MATURED,            // Admin executed sendPayout(); yield has been funded.
        APPROVED_FOR_PAYOUT,// Auditor verified the payout; redemption window open.
        CLOSED              // Optional terminal state set by protocol after full redemption.
    }

    /// @notice Operation performed in a state that does not permit it.
    error InvalidState(VaultState current, VaultState required);

    /// @notice A deposit would push totalAssets above the vault maxQuota.
    error QuotaExceeded();

    /// @notice sendPayout() called before the lock period (duration) has elapsed.
    error LockPeriodNotEnded(uint256 currentTime, uint256 unlockTime);

    /// @notice Caller is not authorized to perform the action.
    error Unauthorized();

    /// @notice createVault() already called; it may only run once.
    error VaultAlreadyCreated();

    /// @notice A zero amount was supplied where a positive amount is required.
    error ZeroAmount();

    /// @notice The auditor attempted to lock a vault that has not been configured yet.
    error VaultNotCreated();

    /// @notice approveVault() called with no shares issued (nothing was raised).
    error VaultEmpty();
}
