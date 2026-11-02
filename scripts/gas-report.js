// Mesure le gas consomme par chaque operation et ecrit docs/GAS_REPORT.md
//   npx hardhat run scripts/gas-report.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const cdf = (n) => ethers.parseUnits(n.toString(), 18);

async function main() {
  const [admin, alice, liq] = await ethers.getSigners();
  const feed = await (await ethers.getContractFactory("MockV3Aggregator")).deploy(8, 3000n * 10n ** 8n);
  const rows = [];
  const deployGas = async (name, c) => {
    const r = await c.deploymentTransaction().wait();
    rows.push(["Deploiement", name, r.gasUsed]);
    return c;
  };
  const token = await deployGas("CDFxToken", await (await ethers.getContractFactory("CDFxToken")).deploy(admin.address));
  const oracle = await deployGas("CDFxOracle", await (await ethers.getContractFactory("CDFxOracle")).deploy(await feed.getAddress(), cdf(2800), 10800, admin.address));
  const vault = await deployGas("VaultManager", await (await ethers.getContractFactory("VaultManager")).deploy(await token.getAddress(), await oracle.getAddress(), admin.address, admin.address));
  const faucet = await deployGas("CDFxFaucet", await (await ethers.getContractFactory("CDFxFaucet")).deploy(await token.getAddress(), admin.address, cdf(1000), 86400));
  await token.grantRole(await token.MINTER_ROLE(), await vault.getAddress());

  const measure = async (label, p) => {
    const r = await (await p).wait();
    rows.push(["Transaction", label, r.gasUsed]);
  };
  await measure("depositCollateral (1er depot)", vault.connect(alice).depositCollateral({ value: ethers.parseEther("1") }));
  await measure("depositCollateral (depot suivant)", vault.connect(alice).depositCollateral({ value: ethers.parseEther("1") }));
  await measure("mint (1ere emission)", vault.connect(alice).mint(cdf(3_000_000)));
  await measure("mint (emission suivante)", vault.connect(alice).mint(cdf(1_000_000)));
  await measure("depositAndMint (autre utilisateur)", vault.connect(liq).depositAndMint(cdf(5_000_000), { value: ethers.parseEther("2") }));
  await token.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);
  await measure("approve (CDFx -> VaultManager)", token.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256));
  await measure("repay (partiel)", vault.connect(alice).repay(cdf(1_000_000)));
  await measure("withdrawCollateral", vault.connect(alice).withdrawCollateral(ethers.parseEther("0.5")));
  await measure("drip", vault.drip());
  await measure("setUsdCdfRate", oracle.setUsdCdfRate(cdf(2600)));
  await feed.setAnswer(700n * 10n ** 8n); // chute du prix pour rendre le coffre liquidable
  await token.connect(liq).approve(await vault.getAddress(), ethers.MaxUint256);
  await measure("liquidate (totale)", vault.connect(liq).liquidate(alice.address, ethers.MaxUint256));
  await token.connect(alice).transfer(await faucet.getAddress(), cdf(5000));
  await measure("faucet.claim", faucet.connect(admin).claim());

  const gwei = [1, 20];
  let md = "# Rapport de gas\n\nGenere par `npx hardhat run scripts/gas-report.js` (optimiseur active, 200 runs, Solidity 0.8.24).\n";
  md += "Les couts en ETH sont **indicatifs** : cout = gas x prix du gas. Sur Sepolia, l'ETH n'a aucune valeur.\n\n";
  md += `| Type | Operation | Gas | Cout @ ${gwei[0]} gwei (ETH) | Cout @ ${gwei[1]} gwei (ETH) |\n|---|---|---:|---:|---:|\n`;
  for (const [t, n, g] of rows) {
    const c = (gw) => (Number(g) * gw * 1e-9).toFixed(6);
    md += `| ${t} | ${n} | ${g.toString()} | ${c(gwei[0])} | ${c(gwei[1])} |\n`;
  }
  fs.mkdirSync(path.join(__dirname, "..", "docs"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "docs", "GAS_REPORT.md"), md);
  console.log(md);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
