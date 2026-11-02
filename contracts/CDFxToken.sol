// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title CDFx - stablecoin simule indexe sur le franc congolais (1 CDFx = 1 CDF)
/// @notice Jeton SANS valeur reelle, destine a un reseau de test. Seul un contrat
///         disposant du role MINTER_ROLE (le VaultManager) peut creer des CDFx.
/// @dev Bibliotheque reutilisee : OpenZeppelin Contracts v5 (ERC20, ERC20Burnable, AccessControl).
contract CDFxToken is ERC20, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(address admin) ERC20("Congolese Franc Stablecoin (simulated)", "CDFx") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Cree `amount` CDFx pour `to`. Reserve au role MINTER_ROLE.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
