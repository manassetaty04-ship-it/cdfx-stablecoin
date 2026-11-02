import { sepolia, hardhat } from "wagmi/chains";
import deployment from "./deployment.json";
import abis from "./abis.json";

export { abis };
export const addresses = deployment.contracts ?? {};
export const isDeployed = Boolean(addresses.VaultManager && addresses.CDFxToken && addresses.CDFxOracle);
export const deployBlock = BigInt(deployment.deployBlock ?? 0);
export const chain = deployment.chainId === 31337 ? hardhat : sepolia;
export const explorer = chain.id === sepolia.id ? "https://sepolia.etherscan.io" : null;
export const rpcUrl =
  import.meta.env.VITE_RPC_URL ||
  (chain.id === sepolia.id ? "https://ethereum-sepolia-rpc.publicnode.com" : "http://127.0.0.1:8545");

export const MAX_UINT = 2n ** 256n - 1n;
export const WAD = 10n ** 18n;

/** ABI combinee (toutes les erreurs personnalisees) pour decoder les messages de revert, y compris ceux de l'oracle et du jeton. */
const errorItems = [];
const seen = new Set();
for (const abi of Object.values(abis)) {
  for (const item of abi) {
    if (item.type === "error" && !seen.has(item.name)) {
      seen.add(item.name);
      errorItems.push(item);
    }
  }
}
export const errorAbi = errorItems;

export const contracts = {
  VaultManager: { address: addresses.VaultManager, abi: abis.VaultManager },
  CDFxToken: { address: addresses.CDFxToken, abi: abis.CDFxToken },
  CDFxOracle: { address: addresses.CDFxOracle, abi: abis.CDFxOracle },
  CDFxFaucet: { address: addresses.CDFxFaucet, abi: abis.CDFxFaucet },
};

export const addressUrl = (a) => (explorer ? `${explorer}/address/${a}` : null);
export const txUrl = (h) => (explorer ? `${explorer}/tx/${h}` : null);
