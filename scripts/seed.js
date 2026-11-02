// Prepare la demonstration : ouvre un coffre avec le deployeur et alimente le robinet en CDFx.
//   npx hardhat run scripts/seed.js --network sepolia
// Utilise ~0.03 ETH de test (collateral) + du gas. Les CDFx envoyes au robinet proviennent d'un vrai coffre.
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  const [deployer] = await ethers.getSigners();
  const vault = await ethers.getContractAt("VaultManager", d.contracts.VaultManager);
  const token = await ethers.getContractAt("CDFxToken", d.contracts.CDFxToken);

  const collateral = ethers.parseEther(process.env.SEED_ETH || "0.03");
  const mintAmount = ethers.parseUnits(process.env.SEED_MINT || "100000", 18);
  const toFaucet = ethers.parseUnits(process.env.SEED_FAUCET || "60000", 18);

  console.log("Ouverture du coffre du deployeur...");
  await (await vault.depositAndMint(mintAmount, { value: collateral })).wait();
  console.log("Envoi de CDFx au robinet...");
  await (await token.transfer(d.contracts.CDFxFaucet, toFaucet)).wait();

  const [c, debt] = await vault.getVault(deployer.address);
  console.log(`Coffre : ${ethers.formatEther(c)} ETH, dette ${ethers.formatUnits(debt, 18)} CDFx`);
  console.log(`Robinet : ${ethers.formatUnits(await token.balanceOf(d.contracts.CDFxFaucet), 18)} CDFx`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
