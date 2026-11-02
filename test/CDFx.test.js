const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { cdf, eth, usd8, THREE_HOURS, deploySystem } = require("./helpers");

// Prix de reference dans les tests : 1 ETH = 3 000 USD x 2 800 CDF/USD = 8 400 000 CDF

describe("CDFxToken", () => {
  it("n'autorise que le VaultManager (MINTER_ROLE) a creer des CDFx", async () => {
    const { token, other, vault } = await loadFixture(deploySystem);
    await expect(token.connect(other).mint(other.address, 1n)).to.be.revertedWithCustomError(
      token,
      "AccessControlUnauthorizedAccount"
    );
    expect(await token.hasRole(await token.MINTER_ROLE(), await vault.getAddress())).to.equal(true);
    expect(await token.symbol()).to.equal("CDFx");
    expect(await token.decimals()).to.equal(18n);
  });
});

describe("CDFxOracle", () => {
  it("calcule le prix ETH en CDF = ETH/USD x USD/CDF", async () => {
    const { oracle } = await loadFixture(deploySystem);
    const [price] = await oracle.ethPriceCdf();
    expect(price).to.equal(cdf(8_400_000));
  });

  it("rejette une donnee Chainlink perimee", async () => {
    const { oracle } = await loadFixture(deploySystem);
    await time.increase(THREE_HOURS + 60);
    await expect(oracle.ethPriceCdf()).to.be.revertedWithCustomError(oracle, "StalePrice");
  });

  it("rejette un prix nul, negatif ou un round incoherent", async () => {
    const { oracle, feed } = await loadFixture(deploySystem);
    await feed.setAnswer(0);
    await expect(oracle.ethPriceCdf()).to.be.revertedWithCustomError(oracle, "InvalidPrice");
    await feed.setAnswer(-5);
    await expect(oracle.ethPriceCdf()).to.be.revertedWithCustomError(oracle, "InvalidPrice");
    const now = await time.latest();
    await feed.setRoundData(usd8(3000), now, 0); // answeredInRound < roundId
    await expect(oracle.ethPriceCdf()).to.be.revertedWithCustomError(oracle, "InvalidPrice");
  });

  it("borne le taux USD/CDF et limite la variation a 10 % par mise a jour", async () => {
    const { oracle, other } = await loadFixture(deploySystem);
    await expect(oracle.setUsdCdfRate(cdf(500))).to.be.revertedWithCustomError(oracle, "InvalidRate");
    await expect(oracle.setUsdCdfRate(cdf(11_000))).to.be.revertedWithCustomError(oracle, "InvalidRate");
    await expect(oracle.setUsdCdfRate(cdf(3200))).to.be.revertedWithCustomError(oracle, "RateStepTooLarge"); // +14 %
    await expect(oracle.setUsdCdfRate(cdf(3000))).to.emit(oracle, "UsdCdfRateUpdated"); // +7 %
    expect(await oracle.usdCdfRate()).to.equal(cdf(3000));
    await expect(oracle.connect(other).setUsdCdfRate(cdf(3000))).to.be.revertedWithCustomError(
      oracle,
      "AccessControlUnauthorizedAccount"
    );
  });

  it("valide la configuration du constructeur et de setMaxFeedAge", async () => {
    const { oracle, feed, admin, other } = await loadFixture(deploySystem);
    const F = await ethers.getContractFactory("CDFxOracle");
    await expect(F.deploy(ethers.ZeroAddress, cdf(2800), THREE_HOURS, admin.address)).to.be.revertedWithCustomError(F, "InvalidFeed");
    await expect(F.deploy(await feed.getAddress(), cdf(10), THREE_HOURS, admin.address)).to.be.revertedWithCustomError(F, "InvalidRate");
    await expect(F.deploy(await feed.getAddress(), cdf(2800), 60, admin.address)).to.be.revertedWithCustomError(F, "InvalidFeedAge");
    await expect(oracle.setMaxFeedAge(10)).to.be.revertedWithCustomError(oracle, "InvalidFeedAge");
    await expect(oracle.connect(other).setMaxFeedAge(7200)).to.be.revertedWithCustomError(oracle, "AccessControlUnauthorizedAccount");
    await oracle.setMaxFeedAge(7200);
    expect(await oracle.maxFeedAge()).to.equal(7200n);
  });
});

describe("VaultManager - coffres", () => {
  it("depot : enregistre le collateral et emet les evenements", async () => {
    const { vault, alice } = await loadFixture(deploySystem);
    await expect(vault.connect(alice).depositCollateral({ value: eth(1) }))
      .to.emit(vault, "CollateralDeposited")
      .withArgs(alice.address, eth(1))
      .and.to.emit(vault, "VaultUpdated")
      .withArgs(alice.address, eth(1), 0n);
    expect(await vault.collateralOf(alice.address)).to.equal(eth(1));
    expect(await vault.totalCollateral()).to.equal(eth(1));
    await expect(vault.connect(alice).depositCollateral({ value: 0 })).to.be.revertedWithCustomError(vault, "ZeroAmount");
  });

  it("refuse l'envoi direct d'ETH (aucune fonction receive)", async () => {
    const { vault, alice } = await loadFixture(deploySystem);
    await expect(alice.sendTransaction({ to: await vault.getAddress(), value: 1n })).to.be.reverted;
  });

  it("emission : autorisee jusqu'au ratio minimal de 150 %", async () => {
    const { vault, token, alice } = await loadFixture(deploySystem);
    await vault.connect(alice).depositCollateral({ value: eth(1) });
    // valeur 8,4 M CDF -> dette max = 8,4 M / 1,5 = 5,6 M
    expect(await vault.maxMintable(alice.address)).to.equal(cdf(5_600_000));
    await vault.connect(alice).mint(cdf(5_000_000));
    expect(await token.balanceOf(alice.address)).to.equal(cdf(5_000_000));
    expect(await vault.collateralRatioBps(alice.address)).to.be.closeTo(16_800n, 2n); // ~168 % (frais de quelques secondes)
    await expect(vault.connect(alice).mint(cdf(700_000))).to.be.revertedWithCustomError(vault, "Undercollateralized");
    await vault.connect(alice).mint(cdf(595_000)); // total ~5,595 M, juste sous la limite de 150 %
    expect(await vault.collateralRatioBps(alice.address)).to.be.gte(15_000n);
    await expect(vault.connect(alice).mint(cdf(10_000))).to.be.revertedWithCustomError(vault, "Undercollateralized");
  });

  it("emission : respecte la dette minimale et le plafond de dette global", async () => {
    const { vault, alice, admin } = await loadFixture(deploySystem);
    await vault.connect(alice).depositCollateral({ value: eth(1) });
    await expect(vault.connect(alice).mint(cdf(9_999))).to.be.revertedWithCustomError(vault, "BelowMinDebt");
    await expect(vault.connect(alice).mint(0)).to.be.revertedWithCustomError(vault, "ZeroAmount");
    await vault.connect(admin).setRiskParameters(15_000, 13_000, 1_000, 200, cdf(1_000_000), cdf(10_000));
    await expect(vault.connect(alice).mint(cdf(1_000_001))).to.be.revertedWithCustomError(vault, "DebtCeilingExceeded");
    await vault.connect(alice).mint(cdf(1_000_000));
  });

  it("depositAndMint : depot et emission en une transaction", async () => {
    const { vault, token, alice } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(4_000_000), { value: eth(1) });
    expect(await token.balanceOf(alice.address)).to.equal(cdf(4_000_000));
    const [c, d] = await vault.getVault(alice.address);
    expect(c).to.equal(eth(1));
    expect(d).to.be.gte(cdf(4_000_000));
  });

  it("retrait : bloque s'il fait passer le ratio sous 150 %, libre sans dette", async () => {
    const { vault, alice, bob } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(4_200_000), { value: eth(1) }); // 200 %
    // collateral requis = 4,2 M x 1,5 / 8,4 M = 0,75 ETH -> max retirable 0,25 ETH
    expect(await vault.maxWithdrawable(alice.address)).to.be.closeTo(eth(0.25), 10n ** 6n);
    await expect(vault.connect(alice).withdrawCollateral(eth(0.3))).to.be.revertedWithCustomError(vault, "Undercollateralized");
    await expect(vault.connect(alice).withdrawCollateral(eth(2))).to.be.revertedWithCustomError(vault, "InsufficientCollateral");
    await vault.connect(alice).withdrawCollateral(eth(0.2));
    // un coffre sans dette retire tout
    await vault.connect(bob).depositCollateral({ value: eth(1) });
    await vault.connect(bob).withdrawCollateral(eth(1));
    expect(await vault.collateralOf(bob.address)).to.equal(0n);
  });

  it("remboursement : partiel puis total, avec dette minimale residuelle", async () => {
    const { vault, token, alice, bob } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(2_000_000), { value: eth(1) });
    await token.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
    await expect(vault.connect(alice).repay(cdf(1_995_000))).to.be.revertedWithCustomError(vault, "BelowMinDebt"); // reste 5 000 < 10 000
    await vault.connect(alice).repay(cdf(1_000_000));
    expect(await vault.debtOf(alice.address)).to.be.closeTo(cdf(1_000_000), cdf(1));
    // les frais courus obligent a disposer d'un peu plus de CDFx que le montant emis : on les obtient aupres de bob
    await vault.connect(bob).depositAndMint(cdf(100_000), { value: eth(1) });
    await token.connect(bob).transfer(alice.address, cdf(100));
    await vault.connect(alice).repay(ethers.MaxUint256); // plafonne a la dette
    expect(await vault.debtOf(alice.address)).to.equal(0n);
    await expect(vault.connect(alice).repay(1n)).to.be.revertedWithCustomError(vault, "NoDebt");
  });

  it("remboursement : exige l'autorisation (approve) et ne depend pas de l'oracle", async () => {
    const { vault, token, alice } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(2_000_000), { value: eth(1) });
    await expect(vault.connect(alice).repay(cdf(1_000_000))).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    await token.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
    await time.increase(THREE_HOURS * 10); // oracle perime
    await vault.connect(alice).repay(cdf(1_000_000)); // fonctionne quand meme
  });

  it("l'oracle perime bloque emission et retrait avec dette, mais pas le depot", async () => {
    const { vault, oracle, alice } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(2_000_000), { value: eth(1) });
    await time.increase(THREE_HOURS + 100);
    await expect(vault.connect(alice).mint(cdf(100_000))).to.be.revertedWithCustomError(oracle, "StalePrice");
    await expect(vault.connect(alice).withdrawCollateral(eth(0.1))).to.be.revertedWithCustomError(oracle, "StalePrice");
    await vault.connect(alice).depositCollateral({ value: eth(0.1) });
    const stats = await vault.getProtocolStats();
    expect(stats.oracleOk).to.equal(false);
  });
});

describe("VaultManager - frais de stabilite", () => {
  it("accumule ~2 %/an, cree les frais en CDFx pour la tresorerie et garde offre = dette", async () => {
    const { vault, token, alice, treasury } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(5_000_000), { value: eth(1) });
    await time.increase(365 * 24 * 3600);
    expect(await vault.debtOf(alice.address)).to.be.closeTo(cdf(5_100_000), cdf(500));
    await vault.drip();
    expect(await token.balanceOf(treasury.address)).to.be.closeTo(cdf(100_000), cdf(500));
    const supply = await token.totalSupply();
    const debt = await vault.totalDebt();
    expect(supply >= debt ? supply - debt : debt - supply).to.be.lt(1_000n); // quelques wei d'arrondi
  });

  it("permet de tout rembourser avec les frais obtenus de la tresorerie, puis retirer le collateral", async () => {
    const { vault, token, feed, alice, bob, treasury } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(5_000_000), { value: eth(1) });
    await time.increase(30 * 24 * 3600);
    await feed.setAnswer(usd8(3000)); // le flux Chainlink est rafraichi (sinon donnee perimee)
    await vault.drip();
    const debt = await vault.debtOf(alice.address);
    const missing = debt - (await token.balanceOf(alice.address));
    expect(missing).to.be.gt(0n);
    // la tresorerie detient les frais deja crees ; une marge de quelques CDFx vient du coffre de bob
    await token.connect(treasury).transfer(alice.address, missing);
    await vault.connect(bob).depositAndMint(cdf(100_000), { value: eth(1) });
    await token.connect(bob).transfer(alice.address, cdf(10));
    await token.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
    await vault.connect(alice).repay(ethers.MaxUint256);
    expect(await vault.debtOf(alice.address)).to.equal(0n);
    await vault.connect(alice).withdrawCollateral(eth(1));
    expect(await vault.collateralOf(alice.address)).to.equal(0n);
  });
});

describe("VaultManager - liquidation", () => {
  async function openRiskyVault() {
    const ctx = await deploySystem();
    const { vault, token, alice, liquidator } = ctx;
    await vault.connect(alice).depositAndMint(cdf(5_000_000), { value: eth(1) }); // 168 %
    await vault.connect(liquidator).depositAndMint(cdf(10_000_000), { value: eth(10) }); // 840 %
    await token.connect(liquidator).approve(await vault.getAddress(), ethers.MaxUint256);
    return ctx;
  }

  it("refuse de liquider un coffre sain", async () => {
    const { vault, alice, liquidator } = await loadFixture(openRiskyVault);
    expect(await vault.isLiquidatable(alice.address)).to.equal(false);
    await expect(vault.connect(liquidator).liquidate(alice.address, cdf(1_000_000))).to.be.revertedWithCustomError(vault, "VaultHealthy");
  });

  it("liquide totalement un coffre sous 130 % : penalite de 10 % pour le liquidateur, reste rendu au proprietaire", async () => {
    const { vault, feed, alice, liquidator } = await loadFixture(openRiskyVault);
    await feed.setAnswer(usd8(2200)); // 6,16 M CDF/ETH -> ratio 123 %
    expect(await vault.isLiquidatable(alice.address)).to.equal(true);
    expect(await vault.liquidationPrice(alice.address)).to.be.closeTo(cdf(6_500_000), cdf(5)); // 5 M x 1,3 / 1 ETH

    const before = await ethers.provider.getBalance(liquidator.address);
    const tx = await vault.connect(liquidator).liquidate(alice.address, ethers.MaxUint256);
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const gained = (await ethers.provider.getBalance(liquidator.address)) - before + gas;

    // 5 M CDFx rembourses x 1,10 / 6,16 M = 0,89285... ETH recus
    expect(gained).to.be.closeTo(eth("0.892857142857142857"), 10n ** 12n);
    expect(await vault.debtOf(alice.address)).to.equal(0n);
    expect(await vault.collateralOf(alice.address)).to.be.closeTo(eth("0.107142857142857143"), 10n ** 12n);
  });

  it("permet une liquidation partielle et rejette si le coffre redevient sain", async () => {
    const { vault, feed, alice, liquidator } = await loadFixture(openRiskyVault);
    await feed.setAnswer(usd8(2200));
    await vault.connect(liquidator).liquidate(alice.address, cdf(2_500_000));
    expect(await vault.debtOf(alice.address)).to.be.closeTo(cdf(2_500_000), cdf(1));
    // il reste 1 - 0,4464 = 0,5536 ETH = 3,41 M CDF pour 2,5 M de dette : 136 % -> sain
    expect(await vault.isLiquidatable(alice.address)).to.equal(false);
    await expect(vault.connect(liquidator).liquidate(alice.address, cdf(100_000))).to.be.revertedWithCustomError(vault, "VaultHealthy");
  });

  it("gere la dette irrecouvrable quand le collateral ne couvre plus la dette", async () => {
    const { vault, token, feed, alice, liquidator } = await loadFixture(openRiskyVault);
    await feed.setAnswer(usd8(1000)); // 2,8 M CDF/ETH : 1 ETH ne vaut plus que 2,8 M pour 5 M de dette
    await expect(vault.connect(liquidator).liquidate(alice.address, cdf(4_000_000)))
      .to.emit(vault, "Liquidated");
    expect(await vault.collateralOf(alice.address)).to.equal(0n);
    expect(await vault.debtOf(alice.address)).to.equal(0n);
    const bad = await vault.badDebt();
    expect(bad).to.be.closeTo(cdf(1_000_000), cdf(1));
    // n'importe qui peut effacer la dette irrecouvrable en brulant ses CDFx
    await vault.connect(liquidator).settleBadDebt(ethers.MaxUint256);
    expect(await vault.badDebt()).to.equal(0n);
    await expect(vault.connect(liquidator).settleBadDebt(1n)).to.be.revertedWithCustomError(vault, "NoBadDebt");
    await vault.drip();
    expect(await token.totalSupply()).to.be.closeTo(await vault.totalDebt(), 10n ** 6n);
  });

  it("le taux USD/CDF peut aussi declencher une liquidation (demo)", async () => {
    const { vault, oracle, alice } = await loadFixture(openRiskyVault);
    await oracle.setUsdCdfRate(cdf(2520)); // -10 %
    await oracle.setUsdCdfRate(cdf(2268)); // -10 % : 2268 x 3000 = 6,8 M -> ratio 136 %
    expect(await vault.isLiquidatable(alice.address)).to.equal(false);
    await oracle.setUsdCdfRate(cdf(2042)); // 6,126 M -> 122,5 %
    expect(await vault.isLiquidatable(alice.address)).to.equal(true);
  });
});

describe("VaultManager - securite", () => {
  it("la reentrance dans withdrawCollateral est bloquee (nonReentrant)", async () => {
    const { vault, alice } = await loadFixture(deploySystem);
    const attacker = await (await ethers.getContractFactory("ReentrancyAttacker")).deploy(await vault.getAddress());
    await vault.connect(alice).depositCollateral({ value: eth(5) }); // fonds d'autres utilisateurs dans le contrat
    await attacker.deposit({ value: eth(2) });
    await attacker.attack(eth(1));
    expect(await attacker.reentryAttempted()).to.equal(true);
    expect(await attacker.reentrySucceeded()).to.equal(false);
    expect(await vault.collateralOf(await attacker.getAddress())).to.equal(eth(1)); // un seul retrait a abouti
    expect(await ethers.provider.getBalance(await attacker.getAddress())).to.equal(eth(1));
    expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(eth(6));
  });

  it("controle d'acces : parametres, tresorerie et pause reserves aux roles", async () => {
    const { vault, other } = await loadFixture(deploySystem);
    const denied = (p) => expect(p).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
    await denied(vault.connect(other).setRiskParameters(15_000, 13_000, 1_000, 200, cdf(1), cdf(1)));
    await denied(vault.connect(other).setTreasury(other.address));
    await denied(vault.connect(other).pause());
  });

  it("valide les parametres de risque", async () => {
    const { vault, admin } = await loadFixture(deploySystem);
    const bad = (...a) => expect(vault.connect(admin).setRiskParameters(...a)).to.be.revertedWithCustomError(vault, "InvalidParameters");
    await bad(15_000, 10_500, 1_000, 200, cdf(1), cdf(1)); // seuil < 110 %
    await bad(13_200, 13_000, 1_000, 200, cdf(1), cdf(1)); // ecart min/liq < 5 %
    await bad(15_000, 13_000, 2_500, 200, cdf(1), cdf(1)); // penalite > 20 %
    await bad(15_000, 13_000, 1_000, 2_500, cdf(1), cdf(1)); // frais > 20 %
    await bad(15_000, 11_200, 1_000, 200, cdf(1), cdf(1)); // seuil trop proche de 100 % + penalite
    await expect(vault.connect(admin).setRiskParameters(16_000, 13_500, 800, 300, cdf(5), cdf(2))).to.emit(vault, "RiskParametersUpdated");
  });

  it("pause d'urgence : bloque depot, emission, liquidation ; remboursement et retrait restent possibles", async () => {
    const { vault, token, admin, alice } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(2_000_000), { value: eth(1) });
    await token.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
    await vault.connect(admin).pause();
    await expect(vault.connect(alice).depositCollateral({ value: 1n })).to.be.revertedWithCustomError(vault, "EnforcedPause");
    await expect(vault.connect(alice).mint(cdf(20_000))).to.be.revertedWithCustomError(vault, "EnforcedPause");
    await expect(vault.connect(alice).liquidate(alice.address, 1n)).to.be.revertedWithCustomError(vault, "EnforcedPause");
    await vault.connect(alice).repay(cdf(1_000_000)); // possible malgre la pause
    await vault.connect(alice).withdrawCollateral(eth(0.5)); // possible malgre la pause
    await vault.connect(admin).unpause();
    await vault.connect(alice).depositCollateral({ value: 1n });
  });

  it("changer le taux de frais applique d'abord l'ancien taux (pas d'effet retroactif)", async () => {
    const { vault, admin, alice } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(5_000_000), { value: eth(1) });
    await time.increase(365 * 24 * 3600);
    await vault.connect(admin).setRiskParameters(15_000, 13_000, 1_000, 0, cdf(1_000_000_000), cdf(10_000));
    expect(await vault.debtOf(alice.address)).to.be.closeTo(cdf(5_100_000), cdf(500));
    await time.increase(365 * 24 * 3600);
    expect(await vault.debtOf(alice.address)).to.be.closeTo(cdf(5_100_000), cdf(500)); // plus de frais
  });

  it("changer la tresorerie : les frais deja courus vont a l'ancienne adresse", async () => {
    const { vault, token, admin, alice, treasury, other } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(5_000_000), { value: eth(1) });
    await time.increase(100 * 24 * 3600);
    await vault.connect(admin).setTreasury(other.address);
    expect(await token.balanceOf(treasury.address)).to.be.gt(0n);
    expect(await token.balanceOf(other.address)).to.equal(0n);
  });

  it("getProtocolStats : vue d'ensemble coherente pour le tableau de bord", async () => {
    const { vault, alice } = await loadFixture(deploySystem);
    await vault.connect(alice).depositAndMint(cdf(4_200_000), { value: eth(1) });
    const s = await vault.getProtocolStats();
    expect(s.oracleOk).to.equal(true);
    expect(s.totalCollateral).to.equal(eth(1));
    expect(s.priceCdf).to.equal(cdf(8_400_000));
    expect(s.globalRatioBps).to.equal(20_000n);
    expect(s.minCollateralRatioBps).to.equal(15_000n);
    expect(s.liquidationRatioBps).to.equal(13_000n);
  });
});

describe("CDFxFaucet", () => {
  async function faucetFixture() {
    const ctx = await deploySystem();
    const { vault, token, admin, alice } = ctx;
    const faucet = await (await ethers.getContractFactory("CDFxFaucet")).deploy(
      await token.getAddress(), admin.address, cdf(1_000), 24 * 3600
    );
    await vault.connect(alice).depositAndMint(cdf(100_000), { value: eth(1) });
    await token.connect(alice).transfer(await faucet.getAddress(), cdf(5_000));
    return { ...ctx, faucet };
  }

  it("distribue une fois par periode et par adresse", async () => {
    const { faucet, token, bob } = await loadFixture(faucetFixture);
    await faucet.connect(bob).claim();
    expect(await token.balanceOf(bob.address)).to.equal(cdf(1_000));
    await expect(faucet.connect(bob).claim()).to.be.revertedWithCustomError(faucet, "CooldownActive");
    await time.increase(24 * 3600 + 1);
    await faucet.connect(bob).claim();
    expect(await token.balanceOf(bob.address)).to.equal(cdf(2_000));
  });

  it("s'arrete quand il est vide et reste reserve a son proprietaire", async () => {
    const { faucet, bob, carol, other, admin, token } = await loadFixture(faucetFixture);
    await expect(faucet.connect(other).setParameters(1, 1)).to.be.revertedWithCustomError(faucet, "OwnableUnauthorizedAccount");
    await faucet.connect(admin).withdraw(admin.address, cdf(4_500));
    await expect(faucet.connect(bob).claim()).to.be.revertedWithCustomError(faucet, "FaucetEmpty");
    await faucet.connect(admin).setParameters(cdf(100), 60);
    await faucet.connect(carol).claim();
    expect(await token.balanceOf(carol.address)).to.equal(cdf(100));
  });
});
