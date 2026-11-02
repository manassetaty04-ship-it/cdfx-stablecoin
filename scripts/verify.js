// Verifie le code source des 4 contrats sur Etherscan (Sepolia).
//   npx hardhat run scripts/verify.js --network sepolia
// Necessite ETHERSCAN_API_KEY dans .env. Peut etre relance sans risque (les contrats deja verifies sont ignores).
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const file = path.join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!fs.existsSync(file)) throw new Error(`Fichier introuvable : ${file}. Deployez d'abord.`);
  if (!process.env.ETHERSCAN_API_KEY) throw new Error("ETHERSCAN_API_KEY manquant dans .env");
  const d = JSON.parse(fs.readFileSync(file, "utf8"));

  for (const [name, address] of Object.entries(d.contracts)) {
    process.stdout.write(`Verification de ${name} (${address}) ... `);
    try {
      await hre.run("verify:verify", { address, constructorArguments: d.constructorArguments[name] });
      console.log("OK");
    } catch (e) {
      if (/already verified/i.test(e.message)) console.log("deja verifie");
      else console.log("ECHEC :", e.message.split("\n")[0]);
    }
  }
  const base = "https://sepolia.etherscan.io/address/";
  console.log("\nLiens Etherscan :");
  for (const [name, address] of Object.entries(d.contracts)) console.log(`- ${name}: ${base}${address}#code`);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
