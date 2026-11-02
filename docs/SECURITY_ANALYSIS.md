# Analyse de sécurité — CDFx

Outil : **Slither 0.11.6** (Trail of Bits), commande :
`slither . --filter-paths "node_modules|contracts/test" --exclude-dependencies --json docs/slither-report.json`
Périmètre : `CDFxToken`, `CDFxOracle`, `CDFxFaucet`, `VaultManager` (28 contrats compilés, 102 détecteurs). Les contrats de test (`contracts/test/`) sont exclus.

## Résultat global

| Gravité | Nombre | Verdict |
|---|---:|---|
| Haute | **0** | — |
| Moyenne | 33 | tous analysés ci-dessous : faux positifs ou choix de conception justifiés |
| Faible | 29 | idem |
| Informationnelle | 2 | appels bas niveau (`call`) pour envoyer de l'ETH : voulu |

Un résultat a été **corrigé** grâce à l'analyse : dans `VaultManager.drip()`, l'appel externe `cdfx.mint(...)` avait lieu *avant* la mise à jour de `debtIndex`. L'ordre a été inversé (effets d'abord, interaction ensuite) ; les détecteurs `reentrancy-no-eth` / `uninitialized-local` correspondants sont passés de 8 à 7 et de 1 à 0. Les 34 tests restent verts.

## Analyse des résultats restants

| Détecteur | N | Analyse | Décision |
|---|---:|---|---|
| `incorrect-equality` (moyenne) | 16 | Comparaisons `== 0` ou `amount == debt` pour traiter le cas « tout rembourser » ou « pas de dette ». Il s'agit de valeurs entières exactes calculées dans le contrat, pas de soldes manipulables par un tiers (le contrat n'utilise jamais `address(this).balance` pour sa logique). | Faux positif — conservé |
| `reentrancy-no-eth` (moyenne) | 7 | Toutes via `drip()` → `cdfx.mint(treasury, …)`. Le jeton appelé est notre propre ERC-20 OpenZeppelin, sans hook (pas ERC-777, pas de rappel vers le destinataire). Toutes les fonctions publiques concernées sont en plus protégées par `nonReentrant`, et `drip()` met à jour `debtIndex` avant l'appel. | Risque résiduel nul dans ce modèle — conservé |
| `unused-return` (moyenne) | 9 | `(price, ) = oracle.ethPriceCdf()` : seul le prix est utile ; la date de mise à jour est déjà contrôlée dans l'oracle (rejet des données périmées). De même pour `latestRoundData()` : `startedAt` n'est pas utilisé, les autres champs sont validés. | Voulu — conservé |
| `divide-before-multiply` (moyenne) | 1 | `_currentIndex()` calcule le taux par seconde en précision RAY (10²⁷) : la perte de précision est inférieure à 10⁻²⁷ par seconde, négligeable (frais 2 %/an ≈ 6,3 × 10¹⁷ en RAY/s). | Précision suffisante — conservé |
| `reentrancy-benign` / `reentrancy-events` (faible) | 7 / 2 | Même origine que ci-dessus (appel vers notre jeton de confiance) ; seuls des événements ou des variables non critiques sont écrits après. | Conservé |
| `timestamp` (faible) | 18 | `block.timestamp` est indispensable aux frais de stabilité (intérêts par seconde) et à la fraîcheur de l'oracle. Une manipulation de quelques secondes par un validateur n'a pas d'effet significatif (2 %/an). | Nécessaire — conservé |
| `missing-zero-check` (faible) | 2 | `treasury` peut valoir `address(0)` : dans ce cas, les frais ne sont pas créés (désactivation volontaire). | Voulu — conservé |
| `low-level-calls` (info) | 2 | `msg.sender.call{value: …}("")` pour envoyer de l'ETH (recommandé à la place de `transfer`), avec vérification du retour et `nonReentrant`. | Voulu — conservé |

## Mesures de sécurité intégrées au code

- **Contrôle d'accès** par rôles OpenZeppelin ; seul `VaultManager` peut créer des CDFx.
- **Réentrance** : `nonReentrant` + effets avant interactions ; test d'attaque réel (`ReentrancyAttacker`) qui échoue à retirer deux fois.
- **Arrondis** orientés en faveur du protocole : la dette est arrondie vers le haut, les frais créés aussi (l'offre n'est jamais inférieure à la dette).
- **Oracle** : prix > 0, round cohérent (`answeredInRound ≥ roundId`), donnée non périmée (≤ 3 h), pas de date future ; taux USD/CDF borné et limité à ±10 % par mise à jour.
- **Paramètres de risque bornés** dans le contrat : un administrateur ne peut pas fixer des frais de 100 % ni un seuil de liquidation absurde.
- **Pause d'urgence** qui laisse toujours possibles le remboursement et le retrait (l'utilisateur n'est jamais piégé).
- **Pas de réception d'ETH par envoi direct** (aucune fonction `receive`), donc pas d'ETH « perdu » dans le contrat.

## Tests qui prouvent ces propriétés

34 tests Hardhat, dont 3 campagnes aléatoires de 250 actions chacune avec 4 invariants vérifiés après chaque action (voir README). Couverture : 98 % des lignes.

## Limites de cette analyse

Analyse statique + tests : **ce n'est pas un audit**. Non couvert : preuve formelle, fuzzing par Foundry/Echidna, revue indépendante, comportement en cas de défaillance prolongée de Chainlink, risques de gouvernance (administrateur unique dans la version de démonstration). Voir `ANALYSE_RISQUES.md`.
