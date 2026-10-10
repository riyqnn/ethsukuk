// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IInvestorRegistry
 * @notice Identity and compliance surface used by the Sukuk certificate, modelled on the
 *         ERC-3643 `IIdentityRegistry` and `ICompliance` pair.
 * @dev This is the reduced form of ERC-3643: a KYC agent records a verified wallet directly,
 *      instead of resolving claims through ONCHAINID, ClaimTopicsRegistry and TrustedIssuersRegistry.
 *      The function names and semantics match the standard so a full T-REX registry can replace
 *      this contract later without touching the token.
 */
interface IInvestorRegistry {
    event IdentityRegistered(address indexed investor, address indexed onchainId, uint16 country);
    event IdentityRemoved(address indexed investor);
    event CountryUpdated(address indexed investor, uint16 country);
    event CountryRestriction(uint16 indexed country, bool blocked);

    /// @notice True when `investor` has been registered and its country is not restricted.
    function isVerified(address investor) external view returns (bool);

    /// @notice True when `investor` has an entry, regardless of country restrictions.
    function contains(address investor) external view returns (bool);

    /// @notice ONCHAINID (or other identity contract) recorded for `investor`, if any.
    function identity(address investor) external view returns (address);

    /// @notice ISO-3166 numeric country code recorded for `investor`.
    function investorCountry(address investor) external view returns (uint16);

    function registerIdentity(address investor, address onchainId, uint16 country) external;

    function batchRegisterIdentity(
        address[] calldata investors,
        address[] calldata onchainIds,
        uint16[] calldata countries
    ) external;

    function deleteIdentity(address investor) external;

    function updateCountry(address investor, uint16 country) external;

    function updateIdentity(address investor, address onchainId) external;
}
