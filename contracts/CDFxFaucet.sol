// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title CDFxFaucet - robinet de demonstration
/// @notice Distribue une petite quantite de CDFx (sans valeur) a chaque adresse, une fois par periode.
///         Utile car les frais de stabilite exigent de rembourser un peu plus que ce qui a ete emis.
///         Les CDFx distribues proviennent d'un coffre reel finance par le deploiement (aucune creation gratuite).
contract CDFxFaucet is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 public claimAmount;
    uint256 public cooldown;
    mapping(address => uint256) public lastClaim;

    event Claimed(address indexed account, uint256 amount);
    event ParametersUpdated(uint256 claimAmount, uint256 cooldown);
    event Withdrawn(address indexed to, uint256 amount);

    error CooldownActive(uint256 availableAt);
    error FaucetEmpty();
    error InvalidParameters();

    constructor(IERC20 token_, address owner_, uint256 claimAmount_, uint256 cooldown_) Ownable(owner_) {
        if (address(token_) == address(0) || claimAmount_ == 0) revert InvalidParameters();
        token = token_;
        claimAmount = claimAmount_;
        cooldown = cooldown_;
    }

    function claim() external {
        uint256 last = lastClaim[msg.sender];
        if (last != 0 && block.timestamp < last + cooldown) revert CooldownActive(last + cooldown);
        if (token.balanceOf(address(this)) < claimAmount) revert FaucetEmpty();

        lastClaim[msg.sender] = block.timestamp;
        emit Claimed(msg.sender, claimAmount);
        token.safeTransfer(msg.sender, claimAmount);
    }

    function nextClaimAt(address account) external view returns (uint256) {
        uint256 last = lastClaim[account];
        return last == 0 ? 0 : last + cooldown;
    }

    function setParameters(uint256 claimAmount_, uint256 cooldown_) external onlyOwner {
        if (claimAmount_ == 0) revert InvalidParameters();
        claimAmount = claimAmount_;
        cooldown = cooldown_;
        emit ParametersUpdated(claimAmount_, cooldown_);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        emit Withdrawn(to, amount);
        token.safeTransfer(to, amount);
    }
}
