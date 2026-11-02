# Guide de déploiement pas à pas (Windows) — CDFx

Ce guide part de zéro : un PC Windows sans rien d'installé. Comptez environ 1 h 30 la première fois.
Chaque étape dit **quoi faire**, **ce que vous devez voir**, et **que faire si ça échoue**.

> Règle d'or : utilisez un **portefeuille MetaMask neuf, dédié au projet**, qui ne contient que des ETH de test.
> Ne mettez jamais votre vraie phrase de récupération ni une clé de portefeuille personnel dans ce projet.

---

## Étape 0 — Ce dont vous avez besoin (tout est gratuit)

| Outil | Rôle | Où |
|---|---|---|
| Node.js **22 LTS** | exécute Hardhat et la DApp | https://nodejs.org (choisir « 22.x LTS ») |
| Git | envoie le code sur GitHub | https://git-scm.com/download/win |
| VS Code (facultatif) | éditer les fichiers | https://code.visualstudio.com |
| MetaMask | portefeuille | https://metamask.io/download |
| Compte GitHub | héberge le dépôt | https://github.com |
| Compte Vercel | héberge la DApp | https://vercel.com (« Continue with GitHub ») |
| Compte Etherscan | vérifie le code des contrats | https://etherscan.io/register |

Choisissez **Node 22** et pas une version plus récente : Hardhat 2 peut afficher des avertissements ou échouer avec les versions très récentes.

Ouvrez **PowerShell** (touche Windows → taper « PowerShell ») et vérifiez :

```powershell
node -v      # doit afficher v22.x.x
npm -v
git --version
```

---

## Étape 1 — Préparer le projet

1. Dézippez `cdfx-projet.zip` dans un dossier simple, par exemple `C:\projets\cdfx` (évitez OneDrive et les chemins avec accents).
2. Dans PowerShell :

```powershell
cd C:\projets\cdfx
npm install
cd frontend
npm install
cd ..
```

Vous devez voir « added … packages » (des avertissements « npm audit » sont normaux).

3. Lancez les tests pour vérifier que tout fonctionne **avant** de déployer :

```powershell
npx hardhat test
```

Attendu : `34 passing`. La première exécution télécharge le compilateur Solidity (internet nécessaire).

---

## Étape 2 — Créer le portefeuille de test (MetaMask)

1. Installez l'extension MetaMask, choisissez **Créer un nouveau portefeuille**, notez la phrase de récupération **sur papier** (jamais en capture d'écran, jamais sur GitHub).
2. Dans MetaMask : menu des réseaux → activez **Afficher les réseaux de test** → sélectionnez **Sepolia**.
3. Copiez l'adresse de votre compte (`0x…`) : elle sert aux robinets.

> Astuce : renommez ce compte « CDFx-projet » pour ne pas le confondre.

---

## Étape 3 — Obtenir des ETH Sepolia gratuits

Il vous faut environ **0,1 ETH Sepolia** (le déploiement coûte ~0,01 à 0,05 ETH selon le prix du gas, plus 0,03 ETH pour le coffre de démonstration). Essayez dans l'ordre :

1. Google Cloud Web3 : https://cloud.google.com/application/web3/faucet/ethereum/sepolia
2. Alchemy : https://www.alchemy.com/faucets/ethereum-sepolia
3. Chainlink : https://faucets.chain.link/sepolia
4. Si les robinets refusent (certains exigent un historique), utilisez un robinet « par minage » : https://sepolia-faucet.pk910.de (laissez la page ouverte pendant que le solde monte, puis encaissez).

Vérifiez dans MetaMask que le solde Sepolia est > 0,05 ETH. Vous pouvez aussi demander à vos 3 camarades de vous envoyer des ETH Sepolia.

---

## Étape 4 — Clés et fichier `.env`

### 4.1 Clé privée du portefeuille dédié
MetaMask → les trois points du compte → **Détails du compte** → **Afficher la clé privée** → saisissez votre mot de passe → copiez la clé.

### 4.2 Clé API Etherscan
Connectez-vous sur https://etherscan.io/myapikey → **Add** → donnez un nom (« cdfx ») → copiez la clé. Cette clé unique (API V2) fonctionne pour Sepolia.

### 4.3 (Facultatif) RPC Alchemy
Par défaut, le projet utilise un RPC public gratuit (`publicnode.com`). Si vous préférez Alchemy : créez une app « Ethereum Sepolia » sur https://dashboard.alchemy.com et copiez l'URL HTTPS.

### 4.4 Créer le fichier `.env`
Dans `C:\projets\cdfx` :

```powershell
copy .env.example .env
notepad .env
```

Remplissez :

```
DEPLOYER_PRIVATE_KEY=0xVOTRE_CLE_PRIVEE
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ETHERSCAN_API_KEY=VOTRE_CLE_ETHERSCAN
```

Enregistrez. Le fichier `.env` est dans `.gitignore` : il ne partira **jamais** sur GitHub. Ne le copiez dans aucun message ni capture d'écran.

---

## Étape 5 — Déployer sur Sepolia

```powershell
npx hardhat run scripts/deploy.js --network sepolia
```

Attendu (durée : 1 à 3 minutes) :

```
Réseau : sepolia (chainId 11155111)
Solde : 0.1 ETH
CDFxToken     : 0x…
CDFxOracle    : 0x…
VaultManager  : 0x…
CDFxFaucet    : 0x…
Rôle MINTER_ROLE accordé au VaultManager
frontend/src/deployment.json et abis.json mis à jour
```

Le script écrit les adresses dans `deployments\sepolia.json` et dans `frontend\src\deployment.json` (lu par la DApp). **Conservez ces fichiers.**

Problèmes fréquents :
- `Solde insuffisant` → retournez à l'étape 3.
- `insufficient funds` → idem.
- `could not detect network` / délai dépassé → le RPC est saturé : changez `SEPOLIA_RPC_URL` pour une URL Alchemy ou Infura, puis relancez.
- `nonce too low` / `replacement fee too low` → attendez 1 minute et relancez ; si des contrats sont déjà déployés, redéployez simplement (de nouvelles adresses seront créées).

---

## Étape 6 — Vérifier le code source sur Etherscan

```powershell
npx hardhat run scripts/verify.js --network sepolia
```

Attendu : `CDFxToken … OK` pour chacun des 4 contrats, puis 4 liens `https://sepolia.etherscan.io/address/0x…#code`. Ouvrez-les : vous devez voir une coche verte **Contract Source Code Verified**.

Si l'étape échoue (message `Invalid API Key`, délai…) : patientez 1 minute (Etherscan indexe lentement) et relancez — le script ignore les contrats déjà vérifiés. En dernier recours, vérification manuelle : `npx hardhat flatten contracts/VaultManager.sol > VaultManager_flat.sol`, puis Etherscan → onglet **Contract** → **Verify & Publish** → compilateur `0.8.24`, optimisation **oui, 200 runs**, EVM **cancun**, licence MIT.

---

## Étape 7 — Préparer la démonstration (coffre + robinet)

```powershell
npx hardhat run scripts/seed.js --network sepolia
```

Ce script ouvre un coffre avec votre compte (0,03 ETH → 100 000 CDFx) et envoie 60 000 CDFx au robinet. Les visiteurs pourront ainsi réclamer des CDFx gratuitement (1 000 par jour et par adresse).

Pour changer les montants : `$env:SEED_ETH="0.05"; $env:SEED_MINT="150000"; $env:SEED_FAUCET="90000"` avant la commande.

---

## Étape 8 — Tester la DApp sur votre PC

```powershell
cd frontend
npm run dev
```

Ouvrez http://localhost:5173. Vous devez voir le prix de l'ETH en CDF, le ratio global et votre coffre. Cliquez **Connecter le portefeuille** → MetaMask (réseau Sepolia).

Faites un essai complet : *Mon coffre* → dépôt de 0,01 ETH + émission de 10 000 CDFx → *Démo & robinets* → réclamer des CDFx → rembourser. Arrêtez avec `Ctrl + C`.

---

## Étape 9 — Envoyer le code sur GitHub

1. Sur github.com : **New repository** → nom `cdfx-stablecoin` → **Public** → ne cochez rien d'autre → **Create**.
2. Dans PowerShell (dossier du projet) :

```powershell
cd C:\projets\cdfx
git init
git add .
git status
```

**Contrôle important** : dans la liste, vérifiez qu'il n'y a **ni `.env`**, ni `node_modules`. Il doit y avoir `frontend/src/deployment.json` et `frontend/src/abis.json`.

```powershell
git commit -m "CDFx : stablecoin simulé du franc congolais"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/cdfx-stablecoin.git
git push -u origin main
```

(Git demandera votre identité la première fois : `git config --global user.name "Votre nom"` et `git config --global user.email "votre@email"`.)

3. Ajoutez vos 3 camarades en collaborateurs : *Settings → Collaborators*.
4. Complétez dans `README.md` les adresses des contrats, l'URL Vercel et vos captures d'écran, puis `git add . ; git commit -m "README" ; git push`.

---

## Étape 10 — Publier la DApp sur Vercel

1. Allez sur https://vercel.com → **Add New… → Project** → importez `cdfx-stablecoin` (autorisez l'accès à GitHub).
2. Réglages **importants** :
   - **Root Directory** : cliquez *Edit* et choisissez `frontend`.
   - **Framework Preset** : Vite (détecté automatiquement).
   - Build Command : `npm run build` · Output Directory : `dist` (valeurs par défaut).
   - Variables d'environnement : aucune obligatoire.
3. Cliquez **Deploy**. Après ~1 minute, Vercel affiche une URL du type `https://cdfx-stablecoin.vercel.app`.
4. **Vérifiez en navigation privée** (comme l'exige le sujet) : la page se charge, le tableau de bord affiche des chiffres sans connexion, le bouton MetaMask fonctionne.

Chaque `git push` redéploie automatiquement. Si vous redéployez les contrats, relancez `deploy.js`, puis `git add . ; git commit ; git push` : Vercel republiera avec les nouvelles adresses.

---

## Étape 11 — Démonstration de défense (5 minutes)

1. **Tableau de bord** : prix ETH/CDF (Chainlink × taux de démo), ratio global, santé des coffres.
2. **Mon coffre** : déposer 0,02 ETH et émettre CDFx ; montrer l'aperçu du ratio *avant* de signer.
3. **Simulateur** : ETH −40 % et taux USD/CDF −10 % ; expliquer le prix de liquidation.
4. **Démo & robinets** (compte administrateur) : baisser deux fois le taux USD/CDF de 10 % → un coffre à ~150 % passe sous 130 %.
5. **Liquidations** : depuis un second compte, liquider ; montrer la pénalité de 10 %.
6. Etherscan : code vérifié, événements `Minted`, `Liquidated`.
7. Terminal : `npx hardhat test` (34 tests), rapport Slither (`docs/`), couverture.

Préparez **deux comptes MetaMask** (administrateur + liquidateur) avec des ETH Sepolia **avant** la défense, et testez tout la veille.

---

## Liste de contrôle avant l'envoi (échéance : 2 novembre 2026, 23 h 59)

- [ ] 4 contrats déployés **et vérifiés** (coche verte sur Etherscan)
- [ ] URL Vercel ouverte en **navigation privée**, sans erreur
- [ ] Dépôt GitHub **public**, sans `.env` ni clé privée
- [ ] README complété (adresses, URL, captures Sepolia, membres)
- [ ] Rapport ≤ 30 pages (PDF) + exemplaire papier déposé **avant 17 h** le 2 novembre
- [ ] PowerPoint ≤ 15 slides
- [ ] E-mail à **labcoursjk@gmail.com**, objet exact : `Projet-BC&CRYPTO-13-2026-M1`
  avec : URL de la DApp, lien GitHub, adresses des 4 contrats (liens Etherscan), rapport, PowerPoint
- [ ] Défense le **mardi 3 novembre** dès 9 h, tenue de ville
