// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IInvestorRegistry} from "../interfaces/IInvestorRegistry.sol";

/**
 * @title InvestorRegistry
 * @notice KYC gate for the Sukuk issue: a wallet may only hold the certificate once an agent has
 *         registered it here.
 * @dev Reduced ERC-3643 identity registry. A full T-REX deployment derives `isVerified` from claims
 *      held on an ONCHAINID and signed by a trusted issuer; here an agent asserts the result of the
 *      off-chain KYC directly. The interface matches ERC-3643, so swapping in a T-REX registry later
 *      requires no change to the token.
 *
 *      Roles:
 *      - DEFAULT_ADMIN_ROLE manages agents and country restrictions.
 *      - AGENT_ROLE registers, updates and removes investors.
 */
contract InvestorRegistry is IInvestorRegistry, AccessControl {
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    struct Identity {
        address onchainId;
        uint16 country;
        bool registered;
    }

    mapping(address investor => Identity) private _identities;

    /// @notice Countries barred from holding the certificate, by ISO-3166 numeric code.
    mapping(uint16 country => bool) public blockedCountry;

    /// @notice Number of wallets currently registered.
    uint256 public investorCount;

    error ZeroAddress();
    error AlreadyRegistered(address investor);
    error NotRegistered(address investor);
    error LengthMismatch();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function isVerified(address investor) public view returns (bool) {
        Identity storage id = _identities[investor];
        return id.registered && !blockedCountry[id.country];
    }

    function contains(address investor) external view returns (bool) {
        return _identities[investor].registered;
    }

    function identity(address investor) external view returns (address) {
        return _identities[investor].onchainId;
    }

    function investorCountry(address investor) external view returns (uint16) {
        return _identities[investor].country;
    }

    // ------------------------------------------------------------------
    // Agent actions
    // ------------------------------------------------------------------

    function registerIdentity(address investor, address onchainId, uint16 country)
        public
        onlyRole(AGENT_ROLE)
    {
        if (investor == address(0)) revert ZeroAddress();
        if (_identities[investor].registered) revert AlreadyRegistered(investor);

        _identities[investor] = Identity({onchainId: onchainId, country: country, registered: true});
        investorCount += 1;

        emit IdentityRegistered(investor, onchainId, country);
    }

    function batchRegisterIdentity(
        address[] calldata investors,
        address[] calldata onchainIds,
        uint16[] calldata countries
    ) external onlyRole(AGENT_ROLE) {
        if (investors.length != onchainIds.length || investors.length != countries.length) {
            revert LengthMismatch();
        }
        for (uint256 i = 0; i < investors.length; ++i) {
            registerIdentity(investors[i], onchainIds[i], countries[i]);
        }
    }

    function deleteIdentity(address investor) external onlyRole(AGENT_ROLE) {
        if (!_identities[investor].registered) revert NotRegistered(investor);

        delete _identities[investor];
        investorCount -= 1;

        emit IdentityRemoved(investor);
    }

    function updateCountry(address investor, uint16 country) external onlyRole(AGENT_ROLE) {
        if (!_identities[investor].registered) revert NotRegistered(investor);

        _identities[investor].country = country;

        emit CountryUpdated(investor, country);
    }

    function updateIdentity(address investor, address onchainId) external onlyRole(AGENT_ROLE) {
        if (!_identities[investor].registered) revert NotRegistered(investor);

        _identities[investor].onchainId = onchainId;

        emit IdentityRegistered(investor, onchainId, _identities[investor].country);
    }

    // ------------------------------------------------------------------
    // Compliance rules
    // ------------------------------------------------------------------

    /// @notice Bars or readmits a country. Existing holders in a barred country can no longer receive.
    function setCountryRestriction(uint16 country, bool blocked) external onlyRole(DEFAULT_ADMIN_ROLE) {
        blockedCountry[country] = blocked;
        emit CountryRestriction(country, blocked);
    }
}
