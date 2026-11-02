# Rapport de gas

Genere par `npx hardhat run scripts/gas-report.js` (optimiseur active, 200 runs, Solidity 0.8.24).
Les couts en ETH sont **indicatifs** : cout = gas x prix du gas. Sur Sepolia, l'ETH n'a aucune valeur.

| Type | Operation | Gas | Cout @ 1 gwei (ETH) | Cout @ 20 gwei (ETH) |
|---|---|---:|---:|---:|
| Deploiement | CDFxToken | 826861 | 0.000827 | 0.016537 |
| Deploiement | CDFxOracle | 788132 | 0.000788 | 0.015763 |
| Deploiement | VaultManager | 2736904 | 0.002737 | 0.054738 |
| Deploiement | CDFxFaucet | 493868 | 0.000494 | 0.009877 |
| Transaction | depositCollateral (1er depot) | 95541 | 0.000096 | 0.001911 |
| Transaction | depositCollateral (depot suivant) | 61341 | 0.000061 | 0.001227 |
| Transaction | mint (1ere emission) | 172316 | 0.000172 | 0.003446 |
| Transaction | mint (emission suivante) | 130592 | 0.000131 | 0.002612 |
| Transaction | depositAndMint (autre utilisateur) | 177538 | 0.000178 | 0.003551 |
| Transaction | approve (CDFx -> VaultManager) | 26809 | 0.000027 | 0.000536 |
| Transaction | repay (partiel) | 90237 | 0.000090 | 0.001805 |
| Transaction | withdrawCollateral | 106384 | 0.000106 | 0.002128 |
| Transaction | drip | 59199 | 0.000059 | 0.001184 |
| Transaction | setUsdCdfRate | 36053 | 0.000036 | 0.000721 |
| Transaction | liquidate (totale) | 121537 | 0.000122 | 0.002431 |
| Transaction | faucet.claim | 63938 | 0.000064 | 0.001279 |
