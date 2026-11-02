// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {CDFxToken} from "./CDFxToken.sol";
import {CDFxOracle} from "./CDFxOracle.sol";

/// @title VaultManager - coffres (vaults) surcollateralises en ETH pour emettre du CDFx
/// @notice Principe inspire de MakerDAO (Sky) : l'utilisateur depose de l'ETH de test, emet des CDFx
///         dans la limite de son collateral (ratio minimal de 150 %), rembourse sa dette avec des frais
///         de stabilite, et peut etre liquide si son ratio passe sous 130 %.
/// @dev Dette stockee sous forme "normalisee" : dette reelle = dette normalisee x indice de dette.
///      L'indice de dette croit avec le temps (frais de stabilite). Les frais accumules sont crees
///      sous forme de CDFx et envoyes a la tresorerie, de sorte que l'offre reste egale a la dette totale.
///      Ce contrat est un PROTOTYPE PEDAGOGIQUE : non audite, ne pas utiliser avec des fonds reels.
contract VaultManager is AccessControl, ReentrancyGuard, Pausable {
    // ---------------------------------------------------------------- roles & constantes
    bytes32 public constant RISK_ADMIN_ROLE = keccak256("RISK_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant RAY = 1e27;
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    uint256 public constant MAX_STABILITY_FEE_BPS = 2_000; // 20 % / an
    uint256 public constant MAX_PENALTY_BPS = 2_000; // 20 %
    uint256 public constant MIN_LIQUIDATION_RATIO_BPS = 11_000; // 110 %
    uint256 public constant MAX_MIN_RATIO_BPS = 30_000; // 300 %

    // ---------------------------------------------------------------- etat
    struct Vault {
        uint256 collateral; // ETH (wei)
        uint256 normalizedDebt; // dette / indice
    }

    struct ProtocolStats {
        uint256 totalCollateral;
        uint256 totalDebt;
        uint256 badDebt;
        uint256 supply;
        uint256 priceCdf;
        bool oracleOk;
        uint256 globalRatioBps;
        uint256 stabilityFeeBps;
        uint256 minCollateralRatioBps;
        uint256 liquidationRatioBps;
        uint256 liquidationPenaltyBps;
        uint256 debtCeiling;
        uint256 minDebt;
        bool paused;
    }

    CDFxToken public immutable cdfx;
    CDFxOracle public immutable oracle;

    mapping(address => Vault) private _vaults;

    uint256 public totalCollateral;
    uint256 public totalNormalizedDebt; // inclut la dette irrecouvrable
    uint256 public badDebtNormalized;
    uint256 public debtIndex = RAY;
    uint256 public lastDrip;

    uint256 public stabilityFeeBps;
    uint256 public minCollateralRatioBps;
    uint256 public liquidationRatioBps;
    uint256 public liquidationPenaltyBps;
    uint256 public debtCeiling;
    uint256 public minDebt;
    address public treasury;

    // ---------------------------------------------------------------- evenements
    event VaultUpdated(address indexed owner, uint256 collateral, uint256 debt);
    event CollateralDeposited(address indexed owner, uint256 amount);
    event CollateralWithdrawn(address indexed owner, uint256 amount);
    event Minted(address indexed owner, uint256 amount);
    event Repaid(address indexed owner, uint256 amount);
    event Liquidated(
        address indexed owner,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 badDebtCreated
    );
    event BadDebtSettled(address indexed by, uint256 amount);
    event FeeAccrued(uint256 newDebtIndex, uint256 feeMinted);
    event RiskParametersUpdated(
        uint256 minCollateralRatioBps,
        uint256 liquidationRatioBps,
        uint256 liquidationPenaltyBps,
        uint256 stabilityFeeBps,
        uint256 debtCeiling,
        uint256 minDebt
    );
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    // ---------------------------------------------------------------- erreurs
    error ZeroAmount();
    error InsufficientCollateral();
    error Undercollateralized();
    error BelowMinDebt();
    error DebtCeilingExceeded();
    error NoDebt();
    error VaultHealthy();
    error NoBadDebt();
    error EthTransferFailed();
    error InvalidParameters();

    constructor(CDFxToken token, CDFxOracle oracle_, address admin, address treasury_) {
        if (address(token) == address(0) || address(oracle_) == address(0) || admin == address(0)) {
            revert InvalidParameters();
        }
        cdfx = token;
        oracle = oracle_;
        treasury = treasury_;
        lastDrip = block.timestamp;

        // Parametres par defaut
        minCollateralRatioBps = 15_000; // 150 %
        liquidationRatioBps = 13_000; // 130 %
        liquidationPenaltyBps = 1_000; // 10 %
        stabilityFeeBps = 200; // 2 % / an
        debtCeiling = 1_000_000_000e18; // 1 milliard de CDFx
        minDebt = 10_000e18; // 10 000 CDFx

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RISK_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ================================================================ actions utilisateur

    /// @notice Depose de l'ETH de test comme collateral.
    function depositCollateral() external payable nonReentrant whenNotPaused {
        _deposit(msg.sender, msg.value);
    }

    /// @notice Depose de l'ETH et emet des CDFx en une seule transaction.
    function depositAndMint(uint256 mintAmount) external payable nonReentrant whenNotPaused {
        if (msg.value > 0) _deposit(msg.sender, msg.value);
        _mint(msg.sender, mintAmount);
    }

    /// @notice Emet `amount` CDFx contre le collateral deja depose (ratio >= minimum requis).
    function mint(uint256 amount) external nonReentrant whenNotPaused {
        _mint(msg.sender, amount);
    }

    /// @notice Rembourse la dette (frais inclus). Necessite un `approve` prealable du CDFx.
    /// @dev Un montant superieur a la dette est plafonne a la dette. Pas d'oracle requis.
    function repay(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 idx = drip();
        Vault storage v = _vaults[msg.sender];
        uint256 debt = _debtOf(v.normalizedDebt, idx);
        if (debt == 0) revert NoDebt();
        if (amount > debt) amount = debt;

        uint256 sub = amount == debt ? v.normalizedDebt : Math.mulDiv(amount, RAY, idx);
        v.normalizedDebt -= sub;
        totalNormalizedDebt -= sub;

        uint256 remaining = _debtOf(v.normalizedDebt, idx);
        if (remaining != 0 && remaining < minDebt) revert BelowMinDebt();

        emit Repaid(msg.sender, amount);
        emit VaultUpdated(msg.sender, v.collateral, remaining);
        cdfx.burnFrom(msg.sender, amount);
    }

    /// @notice Retire du collateral tant que le ratio minimal reste respecte.
    function withdrawCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 idx = drip();
        Vault storage v = _vaults[msg.sender];
        if (amount > v.collateral) revert InsufficientCollateral();

        // Effets avant interaction (protection contre la reentrance, en plus de nonReentrant)
        v.collateral -= amount;
        totalCollateral -= amount;

        uint256 debt = _debtOf(v.normalizedDebt, idx);
        if (debt > 0) {
            (uint256 price,) = oracle.ethPriceCdf();
            if (!_isHealthy(v.collateral, debt, price, minCollateralRatioBps)) revert Undercollateralized();
        }

        emit CollateralWithdrawn(msg.sender, amount);
        emit VaultUpdated(msg.sender, v.collateral, debt);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    /// @notice Liquide (en partie ou totalement) un coffre dont le ratio est sous le seuil de liquidation.
    /// @dev Le liquidateur rembourse `repayAmount` CDFx (brules) et recoit du collateral valant
    ///      repayAmount x (1 + penalite). Si le collateral ne suffit pas, il recoit tout le collateral
    ///      et le reste de la dette devient une dette irrecouvrable (badDebt).
    function liquidate(address owner, uint256 repayAmount) external nonReentrant whenNotPaused {
        if (repayAmount == 0) revert ZeroAmount();
        uint256 idx = drip();
        Vault storage v = _vaults[owner];
        uint256 debt = _debtOf(v.normalizedDebt, idx);
        if (debt == 0) revert NoDebt();

        (uint256 price,) = oracle.ethPriceCdf();
        if (_isHealthy(v.collateral, debt, price, liquidationRatioBps)) revert VaultHealthy();

        if (repayAmount > debt) repayAmount = debt;
        uint256 seized = Math.mulDiv(repayAmount * (BPS + liquidationPenaltyBps), WAD, price * BPS);
        if (seized > v.collateral) seized = v.collateral;

        uint256 badDebtCreated = _applyLiquidation(v, repayAmount, debt, idx, seized);

        emit Liquidated(owner, msg.sender, repayAmount, seized, badDebtCreated);
        emit VaultUpdated(owner, v.collateral, _debtOf(v.normalizedDebt, idx));
        cdfx.burnFrom(msg.sender, repayAmount);
        if (seized > 0) {
            (bool ok,) = msg.sender.call{value: seized}("");
            if (!ok) revert EthTransferFailed();
        }
    }

    /// @notice Permet a n'importe qui d'effacer la dette irrecouvrable en brulant ses propres CDFx.
    function settleBadDebt(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 idx = drip();
        uint256 bad = Math.mulDiv(badDebtNormalized, idx, RAY, Math.Rounding.Ceil);
        if (bad == 0) revert NoBadDebt();
        if (amount > bad) amount = bad;

        uint256 sub = amount == bad ? badDebtNormalized : Math.mulDiv(amount, RAY, idx);
        badDebtNormalized -= sub;
        totalNormalizedDebt -= sub;

        emit BadDebtSettled(msg.sender, amount);
        cdfx.burnFrom(msg.sender, amount);
    }

    /// @notice Applique les frais de stabilite accumules. Appelable par tous.
    /// @return newIndex le nouvel indice de dette (27 decimales)
    function drip() public returns (uint256 newIndex) {
        uint256 idx = debtIndex;
        if (block.timestamp == lastDrip) return idx;
        newIndex = _currentIndex(); // calcule avec l'ancienne date, avant de la mettre a jour
        lastDrip = block.timestamp;
        if (newIndex == idx) return idx;

        // Effets d'abord (indice a jour), interaction ensuite (creation des frais en CDFx)
        debtIndex = newIndex;
        uint256 feeMinted = 0;
        if (treasury != address(0) && totalNormalizedDebt > 0) {
            // Arrondi vers le haut : l'offre de CDFx ne peut pas etre inferieure a la dette
            feeMinted = Math.mulDiv(totalNormalizedDebt, newIndex - idx, RAY, Math.Rounding.Ceil);
        }
        emit FeeAccrued(newIndex, feeMinted);
        if (feeMinted > 0) cdfx.mint(treasury, feeMinted);
    }

    // ================================================================ administration

    function setRiskParameters(
        uint256 minRatioBps,
        uint256 liqRatioBps,
        uint256 penaltyBps,
        uint256 feeBps,
        uint256 ceiling,
        uint256 minDebt_
    ) external onlyRole(RISK_ADMIN_ROLE) {
        if (
            liqRatioBps < MIN_LIQUIDATION_RATIO_BPS || minRatioBps < liqRatioBps + 500
                || minRatioBps > MAX_MIN_RATIO_BPS || penaltyBps > MAX_PENALTY_BPS
                || liqRatioBps < BPS + penaltyBps + 500 || feeBps > MAX_STABILITY_FEE_BPS
        ) revert InvalidParameters();

        drip(); // applique l'ancien taux de frais jusqu'a maintenant
        minCollateralRatioBps = minRatioBps;
        liquidationRatioBps = liqRatioBps;
        liquidationPenaltyBps = penaltyBps;
        stabilityFeeBps = feeBps;
        debtCeiling = ceiling;
        minDebt = minDebt_;
        emit RiskParametersUpdated(minRatioBps, liqRatioBps, penaltyBps, feeBps, ceiling, minDebt_);
    }

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        drip(); // les frais deja accumules vont a l'ancienne tresorerie
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Pause d'urgence : bloque depots, emissions et liquidations. Remboursements et retraits restent possibles.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ================================================================ lectures

    function getVault(address owner) external view returns (uint256 collateral, uint256 debt) {
        Vault storage v = _vaults[owner];
        return (v.collateral, _debtOf(v.normalizedDebt, _currentIndex()));
    }

    function collateralOf(address owner) external view returns (uint256) {
        return _vaults[owner].collateral;
    }

    function debtOf(address owner) external view returns (uint256) {
        return _debtOf(_vaults[owner].normalizedDebt, _currentIndex());
    }

    /// @notice Dette totale du systeme (CDFx), dette irrecouvrable incluse.
    function totalDebt() public view returns (uint256) {
        return Math.mulDiv(totalNormalizedDebt, _currentIndex(), RAY);
    }

    function badDebt() public view returns (uint256) {
        return Math.mulDiv(badDebtNormalized, _currentIndex(), RAY, Math.Rounding.Ceil);
    }

    /// @notice Ratio de collateralisation du coffre en points de base (15000 = 150 %).
    function collateralRatioBps(address owner) external view returns (uint256) {
        Vault storage v = _vaults[owner];
        uint256 debt = _debtOf(v.normalizedDebt, _currentIndex());
        if (debt == 0) return type(uint256).max;
        (uint256 price,) = oracle.ethPriceCdf();
        return Math.mulDiv(Math.mulDiv(v.collateral, price, WAD), BPS, debt);
    }

    function isLiquidatable(address owner) external view returns (bool) {
        Vault storage v = _vaults[owner];
        uint256 debt = _debtOf(v.normalizedDebt, _currentIndex());
        if (debt == 0) return false;
        (uint256 price,) = oracle.ethPriceCdf();
        return !_isHealthy(v.collateral, debt, price, liquidationRatioBps);
    }

    /// @notice Prix de l'ETH (CDF, 18 decimales) sous lequel le coffre devient liquidable. 0 si pas de dette.
    function liquidationPrice(address owner) external view returns (uint256) {
        Vault storage v = _vaults[owner];
        uint256 debt = _debtOf(v.normalizedDebt, _currentIndex());
        if (debt == 0) return 0;
        if (v.collateral == 0) return type(uint256).max;
        return Math.mulDiv(debt * liquidationRatioBps, WAD, v.collateral * BPS, Math.Rounding.Ceil);
    }

    /// @notice Quantite maximale de CDFx supplementaire que le coffre peut emettre maintenant.
    function maxMintable(address owner) external view returns (uint256) {
        Vault storage v = _vaults[owner];
        uint256 idx = _currentIndex();
        uint256 debt = _debtOf(v.normalizedDebt, idx);
        (uint256 price,) = oracle.ethPriceCdf();
        uint256 maxDebt = Math.mulDiv(Math.mulDiv(v.collateral, price, WAD), BPS, minCollateralRatioBps);
        uint256 room = maxDebt > debt ? maxDebt - debt : 0;
        uint256 total = Math.mulDiv(totalNormalizedDebt, idx, RAY);
        uint256 ceilingRoom = debtCeiling > total ? debtCeiling - total : 0;
        return room < ceilingRoom ? room : ceilingRoom;
    }

    /// @notice Quantite maximale d'ETH que le coffre peut retirer maintenant.
    function maxWithdrawable(address owner) external view returns (uint256) {
        Vault storage v = _vaults[owner];
        uint256 debt = _debtOf(v.normalizedDebt, _currentIndex());
        if (debt == 0) return v.collateral;
        (uint256 price,) = oracle.ethPriceCdf();
        uint256 required = Math.mulDiv(debt * minCollateralRatioBps, WAD, price * BPS, Math.Rounding.Ceil);
        return v.collateral > required ? v.collateral - required : 0;
    }

    /// @notice Vue d'ensemble pour le tableau de bord de solvabilite (ne revert pas si l'oracle est indisponible).
    function getProtocolStats() external view returns (ProtocolStats memory s) {
        s.totalCollateral = totalCollateral;
        s.totalDebt = totalDebt();
        s.badDebt = badDebt();
        s.supply = cdfx.totalSupply();
        s.stabilityFeeBps = stabilityFeeBps;
        s.minCollateralRatioBps = minCollateralRatioBps;
        s.liquidationRatioBps = liquidationRatioBps;
        s.liquidationPenaltyBps = liquidationPenaltyBps;
        s.debtCeiling = debtCeiling;
        s.minDebt = minDebt;
        s.paused = paused();
        try oracle.ethPriceCdf() returns (uint256 price, uint256) {
            s.priceCdf = price;
            s.oracleOk = true;
            s.globalRatioBps = s.totalDebt == 0
                ? type(uint256).max
                : Math.mulDiv(Math.mulDiv(s.totalCollateral, price, WAD), BPS, s.totalDebt);
        } catch {
            s.oracleOk = false;
        }
    }

    // ================================================================ interne

    function _deposit(address owner, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 idx = drip();
        Vault storage v = _vaults[owner];
        v.collateral += amount;
        totalCollateral += amount;
        emit CollateralDeposited(owner, amount);
        emit VaultUpdated(owner, v.collateral, _debtOf(v.normalizedDebt, idx));
    }

    function _mint(address owner, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        uint256 idx = drip();
        Vault storage v = _vaults[owner];

        // Arrondi vers le haut : la dette enregistree n'est jamais inferieure au montant emis
        uint256 add = Math.mulDiv(amount, RAY, idx, Math.Rounding.Ceil);
        v.normalizedDebt += add;
        totalNormalizedDebt += add;

        uint256 debt = _debtOf(v.normalizedDebt, idx);
        if (debt < minDebt) revert BelowMinDebt();
        if (Math.mulDiv(totalNormalizedDebt, idx, RAY) > debtCeiling) revert DebtCeilingExceeded();

        (uint256 price,) = oracle.ethPriceCdf();
        if (!_isHealthy(v.collateral, debt, price, minCollateralRatioBps)) revert Undercollateralized();

        emit Minted(owner, amount);
        emit VaultUpdated(owner, v.collateral, debt);
        cdfx.mint(owner, amount);
    }

    function _applyLiquidation(Vault storage v, uint256 repayAmount, uint256 debt, uint256 idx, uint256 seized)
        internal
        returns (uint256 badDebtCreated)
    {
        uint256 sub = repayAmount == debt ? v.normalizedDebt : Math.mulDiv(repayAmount, RAY, idx);
        v.collateral -= seized;
        totalCollateral -= seized;
        v.normalizedDebt -= sub;
        // totalNormalizedDebt diminue car le liquidateur brule les CDFx correspondants
        totalNormalizedDebt -= sub;

        if (v.collateral == 0 && v.normalizedDebt > 0) {
            // Coffre vide mais dette restante : dette irrecouvrable (reste comptee dans totalNormalizedDebt)
            badDebtNormalized += v.normalizedDebt;
            badDebtCreated = Math.mulDiv(v.normalizedDebt, idx, RAY, Math.Rounding.Ceil);
            v.normalizedDebt = 0;
        }
    }

    function _currentIndex() internal view returns (uint256) {
        uint256 dt = block.timestamp - lastDrip;
        if (dt == 0 || stabilityFeeBps == 0) return debtIndex;
        uint256 ratePerSecond = (RAY * stabilityFeeBps) / BPS / SECONDS_PER_YEAR;
        return debtIndex + (debtIndex * ratePerSecond * dt) / RAY;
    }

    function _debtOf(uint256 normalized, uint256 idx) internal pure returns (uint256) {
        return Math.mulDiv(normalized, idx, RAY, Math.Rounding.Ceil);
    }

    /// @dev vrai si valeur(collateral) / dette >= ratio (comparaison croisee, sans division)
    function _isHealthy(uint256 collateral, uint256 debt, uint256 price, uint256 ratioBps)
        internal
        pure
        returns (bool)
    {
        return Math.mulDiv(collateral, price, WAD) * BPS >= debt * ratioBps;
    }
}
