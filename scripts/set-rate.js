// Modifie le taux USD/CDF de demonstration (max +/-10 % par appel).
//   set RATE=2600 && npx hardhat run scripts/set-rate.js --network sepolia      (PowerShell : $env:RATE=2600)
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const rate = process.env.RATE;
  if (!rate) throw new Error("Definissez la variable RATE (ex. 2600).");
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`), "utf8"));
  const oracle = await ethers.getContractAt("CDFxOracle", d.contracts.CDFxOracle);
  const old = await oracle.usdCdfRate();
  await (await oracle.setUsdCdfRate(ethers.parseUnits(rate, 18))).wait();
  console.log(`Taux USD/CDF : ${ethers.formatUnits(old, 18)} -> ${rate}`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
