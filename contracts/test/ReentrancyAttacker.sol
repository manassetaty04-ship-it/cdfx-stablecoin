// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VaultManager} from "../VaultManager.sol";

/// @notice Contrat MALVEILLANT de test : tente de reentrer dans withdrawCollateral pendant la reception d'ETH.
///         Sert uniquement a prouver que la protection contre la reentrance fonctionne.
contract ReentrancyAttacker {
    VaultManager public immutable vault;
    uint256 public attackAmount;
    bool public reentryAttempted;
    bool public reentrySucceeded;

    constructor(VaultManager vault_) {
        vault = vault_;
    }

    function deposit() external payable {
        vault.depositCollateral{value: msg.value}();
    }

    function attack(uint256 amount) external {
        attackAmount = amount;
        vault.withdrawCollateral(amount);
    }

    receive() external payable {
        if (!reentryAttempted) {
            reentryAttempted = true;
            try vault.withdrawCollateral(attackAmount) {
                reentrySucceeded = true;
            } catch {}
        }
    }
}
