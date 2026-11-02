const { ethers } = require("hardhat");

const cdf = (n) => ethers.parseUnits(n.toString(), 18); // montants CDFx / CDF (18 decimales)
const eth = (n) => ethers.parseEther(n.toString());
const usd8 = (n) => BigInt(Math.round(n * 1e8)); // prix Chainlink a 8 decimales
const THREE_HOURS = 3 * 60 * 60;

/** Deploie tout le systeme avec un flux ETH/USD simule a 3 000 USD et un taux de 2 800 CDF/USD. */
async function deploySystem() {
  const [admin, alice, bob, carol, liquidator, treasury, other] = await ethers.getSigners();

  const feed = await (await ethers.getContractFactory("MockV3Aggregator")).deploy(8, usd8(3000));
  const token = await (await ethers.getContractFactory("CDFxToken")).deploy(admin.address);
  const oracle = await (await ethers.getContractFactory("CDFxOracle")).deploy(
    await feed.getAddress(),
    cdf(2800),
    THREE_HOURS,
    admin.address
  );
  const vault = await (await ethers.getContractFactory("VaultManager")).deploy(
    await token.getAddress(),
    await oracle.getAddress(),
    admin.address,
    treasury.address
  );
  await token.grantRole(await token.MINTER_ROLE(), await vault.getAddress());

  return { admin, alice, bob, carol, liquidator, treasury, other, feed, token, oracle, vault };
}

module.exports = { cdf, eth, usd8, THREE_HOURS, deploySystem };
