// Deploiement du systeme CDFx.
//   npx hardhat run scripts/deploy.js --network sepolia     (reseau de test public)
//   npx hardhat run scripts/deploy.js                       (reseau Hardhat temporaire, pour essayer)
// Ecrit deployments/<reseau>.json et, pour Sepolia, frontend/src/deployment.json (lu par la DApp).
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { ethers, network, artifacts } = hre;

// Flux Chainlink ETH/USD sur Sepolia (8 decimales) - source : docs.chain.link, Price Feed Addresses
const CHAINLINK_ETH_USD_SEPOLIA = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
const INITIAL_USD_CDF_RATE = ethers.parseUnits("2800", 18); // taux de DEMONSTRATION : 2 800 CDF / USD
const MAX_FEED_AGE = 3 * 60 * 60; // 3 h
const FAUCET_CLAIM = ethers.parseUnits("1000", 18); // 1 000 CDFx par adresse
const FAUCET_COOLDOWN = 24 * 60 * 60; // une fois par jour

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const isSepolia = network.name === "sepolia";
  console.log(`Reseau : ${network.name} (chainId ${net.chainId})`);
  console.log(`Deployeur : ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Solde : ${ethers.formatEther(balance)} ETH`);
  if (isSepolia && balance < ethers.parseEther("0.02")) {
    throw new Error("Solde insuffisant : obtenez des ETH Sepolia (robinet) avant de deployer (>= 0.02 ETH conseille).");
  }

  // 1) Flux ETH/USD : reel sur Sepolia, simule ailleurs
  let feedAddress = CHAINLINK_ETH_USD_SEPOLIA;
  if (!isSepolia) {
    const Mock = await ethers.getContractFactory("MockV3Aggregator");
    const mock = await Mock.deploy(8, 3000n * 10n ** 8n);
    await mock.waitForDeployment();
    feedAddress = await mock.getAddress();
    console.log(`Flux ETH/USD simule : ${feedAddress}`);
  }

  const wait = async (c) => {
    const tx = c.deploymentTransaction();
    await c.waitForDeployment();
    if (isSepolia && tx) await tx.wait(2);
    return c;
  };

  // 2) Contrats
  const token = await wait(await (await ethers.getContractFactory("CDFxToken")).deploy(deployer.address));
  console.log(`CDFxToken     : ${await token.getAddress()}`);

  const oracle = await wait(
    await (await ethers.getContractFactory("CDFxOracle")).deploy(feedAddress, INITIAL_USD_CDF_RATE, MAX_FEED_AGE, deployer.address)
  );
  console.log(`CDFxOracle    : ${await oracle.getAddress()}`);

  const vault = await wait(
    await (await ethers.getContractFactory("VaultManager")).deploy(
      await token.getAddress(),
      await oracle.getAddress(),
      deployer.address,
      deployer.address // tresorerie : recoit les frais de stabilite
    )
  );
  console.log(`VaultManager  : ${await vault.getAddress()}`);

  const faucet = await wait(
    await (await ethers.getContractFactory("CDFxFaucet")).deploy(await token.getAddress(), deployer.address, FAUCET_CLAIM, FAUCET_COOLDOWN)
  );
  console.log(`CDFxFaucet    : ${await faucet.getAddress()}`);

  // 3) Droits : seul le VaultManager peut creer des CDFx
  const tx = await token.grantRole(await token.MINTER_ROLE(), await vault.getAddress());
  await tx.wait(isSepolia ? 2 : 1);
  console.log("Role MINTER_ROLE accorde au VaultManager");

  const deployBlock = (await vault.deploymentTransaction().wait()).blockNumber;
  const out = {
    network: network.name,
    chainId: Number(net.chainId),
    deployer: deployer.address,
    deployBlock,
    chainlinkEthUsdFeed: feedAddress,
    contracts: {
      CDFxToken: await token.getAddress(),
      CDFxOracle: await oracle.getAddress(),
      VaultManager: await vault.getAddress(),
      CDFxFaucet: await faucet.getAddress(),
    },
    constructorArguments: {
      CDFxToken: [deployer.address],
      CDFxOracle: [feedAddress, INITIAL_USD_CDF_RATE.toString(), MAX_FEED_AGE, deployer.address],
      VaultManager: [await token.getAddress(), await oracle.getAddress(), deployer.address, deployer.address],
      CDFxFaucet: [await token.getAddress(), deployer.address, FAUCET_CLAIM.toString(), FAUCET_COOLDOWN],
    },
  };

  fs.mkdirSync(path.join(__dirname, "..", "deployments"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "deployments", `${network.name}.json`), JSON.stringify(out, null, 2));

  // 4) La DApp lit deployment.json (adresses) et abis.json (interfaces)
  if (isSepolia || network.name === "localhost") {
    const feDir = path.join(__dirname, "..", "frontend", "src");
    fs.writeFileSync(path.join(feDir, "deployment.json"), JSON.stringify(out, null, 2));
    await exportAbis();
    console.log("frontend/src/deployment.json et abis.json mis a jour");
  }

  console.log("\nTermine. Etape suivante : npx hardhat run scripts/verify.js --network sepolia");
}

async function exportAbis() {
  const names = ["CDFxToken", "CDFxOracle", "VaultManager", "CDFxFaucet"];
  const abis = {};
  for (const n of names) abis[n] = (await artifacts.readArtifact(n)).abi;
  fs.writeFileSync(path.join(__dirname, "..", "frontend", "src", "abis.json"), JSON.stringify(abis, null, 2));
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
module.exports = { exportAbis };
