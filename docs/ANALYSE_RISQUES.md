# Analyse des risques — CDFx

Cette analyse suit la demande du sujet : **perte de parité** et **manipulation d'oracle**, complétée par les autres menaces importantes. Le CDFx est un prototype sur réseau de test ; les mesures « en production » décrivent la suite logique.

## 1. Perte de parité (1 CDFx ≠ 1 CDF)

### Comment la parité est maintenue (mécanismes en place)
- **Surcollatéralisation** : chaque CDFx émis est couvert par ≥ 150 % de collatéral. Un coffre à 150 % devient liquidable après une baisse d'environ 13 % du prix de l'ETH (seuil 130 %) et ne devient insolvable qu'après une baisse d'environ 33 % : la zone entre les deux laisse le temps aux liquidateurs d'intervenir.
- **Arbitrage vers le bas** : si 1 CDFx cote < 1 CDF, un détenteur de coffre peut racheter des CDFx pas chers et rembourser sa dette (valeur 1 CDF par CDFx) → demande de CDFx, le prix remonte.
- **Arbitrage vers le haut** : si 1 CDFx cote > 1 CDF, émettre des CDFx est rentable → l'offre augmente, le prix redescend.
- **Frais de stabilité** (levier de politique monétaire) : les augmenter freine l'émission quand le CDFx est sous le pair, les baisser l'encourage au-dessus.
- **Liquidations** : retirent la dette des coffres risqués avant qu'ils ne deviennent insolvables.

### Scénarios de perte de parité
| Scénario | Cause | Effet | Mesures en place | Mesures en production |
|---|---|---|---|---|
| Chute brutale de l'ETH | marché | coffres sous 130 %, liquidations massives, risque de **dette irrécouvrable** | pénalité 10 %, ratio 150 % ; `settleBadDebt` ; simulateur de stress | module de stabilité (PSM), fonds de réserve alimenté par les frais, enchères de liquidation, plusieurs collatéraux |
| Peu de liquidateurs | manque d'incitation / gas élevé | coffres insolvables non liquidés | bonus de 10 % ; liquidation ouverte à tous ; liquidation partielle | robots de surveillance, subventions de gas |
| Perte de confiance / ruée | rumeurs, absence de marché de liquidité | CDFx < 1 CDF | remboursement toujours possible, même en pause | pool de liquidité, PSM adossé à un autre stablecoin |
| Taux USD/CDF incorrect | donnée de démonstration | valeur du collatéral mal estimée | bornes + ±10 % par mise à jour ; rôle séparé | flux décentralisé, médiane de plusieurs sources |
| Dépréciation du franc congolais | macroéconomie | le CDFx « suit » le CDF : parité interne conservée, mais valeur en USD baisse | taux USD/CDF mis à jour | indexation sur un panier ou sur l'USD selon l'usage |

**Limite importante** : dans ce prototype, aucun marché n'échange le CDFx. La parité est un objectif de conception démontré par les mécanismes (ratios, liquidations, simulateur), pas mesuré par un prix de marché.

## 2. Manipulation et défaillance de l'oracle

| Menace | Description | Protection actuelle | Amélioration en production |
|---|---|---|---|
| Donnée périmée | le flux Chainlink ne se met plus à jour | rejet si > 3 h ; opérations sensibles bloquées (émission, retrait avec dette, liquidation) ; dépôt/remboursement permis | disjoncteur automatique, valeur de repli |
| Prix invalide | réponse ≤ 0 ou round incohérent | `InvalidPrice` | idem + bornes de variation entre deux lectures |
| Manipulation du taux USD/CDF | administrateur malveillant ou clé volée | borne [1 000 ; 10 000], ±10 % par mise à jour, événement `UsdCdfRateUpdated` | multisignature + timelock, flux décentralisé |
| Manipulation du prix ETH | attaque sur la source de prix | prix agrégé par un réseau de nœuds Chainlink (pas de prix spot d'une seule bourse) ; pas de flash-loan possible sur ce prix | seuil de déviation / second flux de contrôle |
| Frontrunning de liquidation | des robots devancent un liquidateur | liquidation ouverte, pénalité fixe | enchères, protection MEV |
| Décimales | mauvaise conversion des décimales du flux | `decimals()` lue dans le constructeur, normalisation à 18 décimales ; test avec 8 décimales | — |

## 3. Autres menaces

| Catégorie | Menace | Mesure |
|---|---|---|
| Contrats | réentrance via envoi d'ETH | `nonReentrant`, effets avant interactions, test d'attaque |
| Contrats | débordements arithmétiques | Solidity 0.8 (revert), `Math.mulDiv` pour les produits larges |
| Contrats | poussière de dette | dette minimale 10 000 CDFx |
| Contrats | dette irrécouvrable | suivie séparément, effaçable par n'importe quel détenteur de CDFx |
| Gouvernance | clé administrateur compromise | paramètres bornés, rôles séparés, pause ; en production : multisignature + timelock |
| Économie | frais de stabilité « créés » pour la trésorerie | l'offre de CDFx reste égale à la dette (invariant testé) |
| Interface | signer une transaction sans comprendre | simulation avant envoi, aperçu du ratio, messages d'erreur clairs |
| Confidentialité | données personnelles | aucune ; uniquement adresses et montants sur la chaîne |
| Conformité | usage réel d'un « stablecoin » | prototype de test, sans valeur ; en production : cadre légal congolais (Banque centrale du Congo) et conformité LCB-FT |

## 4. Matrice synthétique

| Risque | Probabilité | Impact | Niveau | Traitement |
|---|---|---|---|---|
| Chute de l'ETH > 35 % en peu de temps | moyenne | élevé | **élevé** | surcollatéralisation, liquidation, fonds de réserve (prod.) |
| Oracle périmé | faible | moyen | moyen | blocage des opérations sensibles |
| Taux USD/CDF erroné ou manipulé | moyenne (démo) | élevé | **élevé** (démo) | bornes ; flux décentralisé (prod.) |
| Bug de contrat | faible | élevé | moyen | tests, Slither ; audit externe (prod.) |
| Clé administrateur volée | faible | élevé | moyen | bornes de paramètres ; multisignature (prod.) |
