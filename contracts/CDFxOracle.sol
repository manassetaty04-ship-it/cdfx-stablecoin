// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title CDFxOracle - prix de l'ETH en francs congolais (CDF)
/// @notice Combine deux sources :
///         1) le flux Chainlink ETH/USD (donnee reelle du reseau de test) ;
///         2) un taux USD/CDF de DEMONSTRATION, mis a jour par un role dedie
///            (il n'existe pas de flux Chainlink USD/CDF).
///         prixETH_CDF = prixETH_USD x tauxUSD_CDF
/// @dev Toutes les valeurs de sortie ont 18 decimales.
///      Protections : prix strictement positif, donnee non perimee, round valide,
///      taux borne et variation maximale de 10 % par mise a jour.
contract CDFxOracle is AccessControl {
    bytes32 public constant RATE_UPDATER_ROLE = keccak256("RATE_UPDATER_ROLE");

    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    /// @notice Bornes absolues du taux de demonstration (CDF pour 1 USD, 18 decimales).
    uint256 public constant MIN_RATE = 1_000e18;
    uint256 public constant MAX_RATE = 10_000e18;
    /// @notice Variation maximale du taux par mise a jour (10 %).
    uint256 public constant MAX_RATE_STEP_BPS = 1_000;
    uint256 public constant MIN_FEED_AGE = 1 hours;
    uint256 public constant MAX_FEED_AGE = 48 hours;

    AggregatorV3Interface public immutable ethUsdFeed;
    uint8 private immutable _feedDecimals;

    /// @notice Anciennete maximale acceptee pour la donnee Chainlink.
    uint256 public maxFeedAge;
    /// @notice CDF pour 1 USD (18 decimales). Ex. 2800e18 = 2 800 CDF/USD.
    uint256 public usdCdfRate;
    uint256 public rateUpdatedAt;

    event UsdCdfRateUpdated(uint256 oldRate, uint256 newRate, address indexed by);
    event MaxFeedAgeUpdated(uint256 oldAge, uint256 newAge);

    error InvalidFeed();
    error InvalidRate();
    error RateStepTooLarge();
    error InvalidFeedAge();
    error InvalidPrice();
    error StalePrice();

    constructor(AggregatorV3Interface feed, uint256 initialRate, uint256 maxFeedAge_, address admin) {
        if (address(feed) == address(0)) revert InvalidFeed();
        uint8 dec = feed.decimals();
        if (dec > 18) revert InvalidFeed();
        if (initialRate < MIN_RATE || initialRate > MAX_RATE) revert InvalidRate();
        if (maxFeedAge_ < MIN_FEED_AGE || maxFeedAge_ > MAX_FEED_AGE) revert InvalidFeedAge();

        ethUsdFeed = feed;
        _feedDecimals = dec;
        usdCdfRate = initialRate;
        rateUpdatedAt = block.timestamp;
        maxFeedAge = maxFeedAge_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RATE_UPDATER_ROLE, admin);
    }

    /// @notice Met a jour le taux USD/CDF de demonstration.
    /// @dev Borne absolue + variation maximale de 10 % par appel (limite l'impact d'une cle compromise).
    function setUsdCdfRate(uint256 newRate) external onlyRole(RATE_UPDATER_ROLE) {
        if (newRate < MIN_RATE || newRate > MAX_RATE) revert InvalidRate();
        uint256 old = usdCdfRate;
        uint256 diff = newRate > old ? newRate - old : old - newRate;
        if (diff * BPS > old * MAX_RATE_STEP_BPS) revert RateStepTooLarge();

        usdCdfRate = newRate;
        rateUpdatedAt = block.timestamp;
        emit UsdCdfRateUpdated(old, newRate, msg.sender);
    }

    /// @notice Modifie l'anciennete maximale tolerée du flux Chainlink.
    function setMaxFeedAge(uint256 newAge) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newAge < MIN_FEED_AGE || newAge > MAX_FEED_AGE) revert InvalidFeedAge();
        emit MaxFeedAgeUpdated(maxFeedAge, newAge);
        maxFeedAge = newAge;
    }

    /// @notice Prix de l'ETH en USD (18 decimales) et date de mise a jour Chainlink.
    function ethUsd() public view returns (uint256 price, uint256 updatedAt) {
        (uint80 roundId, int256 answer,, uint256 updated, uint80 answeredInRound) = ethUsdFeed.latestRoundData();
        if (answer <= 0 || updated == 0 || updated > block.timestamp || answeredInRound < roundId) {
            revert InvalidPrice();
        }
        if (block.timestamp - updated > maxFeedAge) revert StalePrice();

        price = uint256(answer) * (10 ** (18 - _feedDecimals));
        updatedAt = updated;
    }

    /// @notice Prix de 1 ETH en CDF (18 decimales) et date de la donnee Chainlink utilisee.
    function ethPriceCdf() external view returns (uint256 priceCdf, uint256 updatedAt) {
        (uint256 usd, uint256 updated) = ethUsd();
        priceCdf = (usd * usdCdfRate) / WAD;
        updatedAt = updated;
    }
}
