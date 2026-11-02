// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @notice Flux Chainlink SIMULE (tests et reseau local uniquement). Ne jamais utiliser en production.
contract MockV3Aggregator is AggregatorV3Interface {
    uint8 public immutable override decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId;
    uint80 public answeredInRound;
    string public constant override description = "Mock ETH / USD";
    uint256 public constant override version = 1;

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        _set(initialAnswer, block.timestamp);
    }

    function setAnswer(int256 newAnswer) external {
        _set(newAnswer, block.timestamp);
    }

    /// @dev permet de simuler une donnee perimee ou incoherente dans les tests
    function setRoundData(int256 newAnswer, uint256 newUpdatedAt, uint80 newAnsweredInRound) external {
        _set(newAnswer, newUpdatedAt);
        answeredInRound = newAnsweredInRound;
    }

    function _set(int256 newAnswer, uint256 newUpdatedAt) internal {
        roundId++;
        answeredInRound = roundId;
        answer = newAnswer;
        updatedAt = newUpdatedAt;
    }

    function getRoundData(uint80) external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }
}
