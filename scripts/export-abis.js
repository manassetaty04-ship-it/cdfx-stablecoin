// Regenere frontend/src/abis.json a partir des contrats compiles.
const hre = require("hardhat");
const { exportAbis } = require("./deploy");
hre.run("compile").then(exportAbis).then(() => console.log("abis.json mis a jour"));
