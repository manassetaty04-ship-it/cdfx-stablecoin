const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.theme = { headFontFace: "Cambria", bodyFontFace: "Calibri" };
pres.title = "CDFx - Stablecoin simulé du franc congolais";
pres.author = "Groupe 13";

const NAVY = "0B1220", PANEL = "131C2E", BLUE = "1B6FD1", YEL = "F5C400", RED = "CE1126", INK = "1A2233", MUTED = "5A6882", LIGHT = "F3F5FA", WHITE = "FFFFFF", GREEN = "178A4C";
const SH = "../docs/screenshots/";

function base(title, dark, tw, fs) {
  const s = pres.addSlide();
  s.background = { color: dark ? NAVY : WHITE };
  if (title) s.addText(title, { x: 0.5, y: 0.35, w: tw || 9, h: 0.8, fontFace: "Cambria", fontSize: fs || 30, bold: true, color: dark ? WHITE : NAVY, margin: 0, valign: "top", isTextBox: true });
  return s;
}
function card(s, x, y, w, h, fill) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, fill: { color: fill || LIGHT }, line: { color: fill || LIGHT }, rectRadius: 0.12 });
}
function num(s, x, y, n, col) {
  s.addShape(pres.shapes.OVAL, { x, y, w: 0.5, h: 0.5, fill: { color: col || BLUE }, line: { color: col || BLUE } });
  s.addText(String(n), { x, y, w: 0.5, h: 0.5, align: "center", valign: "middle", fontSize: 16, bold: true, color: WHITE, margin: 0, isTextBox: true });
}
const T = (s, text, o) => s.addText(text, Object.assign({ fontFace: "Calibri", fontSize: 14, color: INK, margin: 0, isTextBox: true, valign: "top" }, o));

// 1 Titre
let s = base(null, true);
s.addShape(pres.shapes.RECTANGLE, { x: 7.3, y: 0, w: 2.7, h: 1.9, fill: { color: BLUE }, line: { color: BLUE } });
s.addShape(pres.shapes.RECTANGLE, { x: 7.3, y: 1.9, w: 2.7, h: 1.9, fill: { color: YEL }, line: { color: YEL } });
s.addShape(pres.shapes.RECTANGLE, { x: 7.3, y: 3.8, w: 2.7, h: 1.825, fill: { color: RED }, line: { color: RED } });
T(s, "CDFx", { x: 0.6, y: 1.0, w: 6.4, h: 1.0, fontFace: "Cambria", fontSize: 60, bold: true, color: WHITE });
T(s, "Stablecoin décentralisé indexé sur le franc congolais (version simulée)", { x: 0.6, y: 2.1, w: 6.4, h: 1.0, fontSize: 22, color: "CADCFC" });
T(s, "Blockchain et cryptomonnaies · Master 1 · UNIKIN\nGroupe 13 : MUELA MPIANA POPOL, THEYTHEY KAMBALE KEVIN, TATY MUNSI MANASSE, MBENGA EZIBE ANDERSON", { x: 0.6, y: 3.7, w: 6.4, h: 1.2, fontSize: 14, color: "92A0BB" });
s.addNotes("Présentation du projet : un stablecoin simulé du franc congolais, déployé sur Ethereum Sepolia. Tout est sans valeur réelle.");

// 2 Problème
s = base("Un jeton à 1 CDF, sans réserve de francs");
T(s, "Question de recherche", { x: 0.5, y: 1.3, w: 4.2, h: 0.4, fontSize: 18, bold: true, color: BLUE });
T(s, "Comment garder un jeton proche de 1 franc congolais, sans réserve en francs, tout en restant solvable et résistant aux erreurs d'oracle ?", { x: 0.5, y: 1.8, w: 4.2, h: 1.6, fontSize: 16 });
T(s, "Approche : comme MakerDAO (DAI), le CDFx est créé contre un collatéral crypto surcollatéralisé.", { x: 0.5, y: 3.6, w: 4.2, h: 1.0, fontSize: 14, color: MUTED });
const objs = ["Coffres surcollatéralisés en ETH de test", "Oracle : Chainlink ETH/USD × taux USD/CDF", "Frais de stabilité et liquidation", "Tableau de bord de solvabilité", "Tests, Slither, analyse des risques", "Sepolia + Vercel"];
objs.forEach((o, i) => {
  const y = 1.3 + i * 0.62;
  card(s, 5.1, y, 4.4, 0.52);
  num(s, 5.15, y + 0.01, i + 1, [BLUE, BLUE, BLUE, "B38F00", RED, RED][i]);
  T(s, o, { x: 5.8, y, w: 3.6, h: 0.52, valign: "middle", fontSize: 14 });
});
s.addNotes("Les 6 objectifs correspondent aux exigences du sujet du Groupe 13.");

// 3 Principe
s = base("Le cycle de vie d'un coffre");
const steps = [["Déposer", "de l'ETH de test comme collatéral"], ["Émettre", "des CDFx si ratio ≥ 150 %"], ["Payer", "2 % de frais de stabilité par an"], ["Rembourser", "brûle les CDFx, libère l'ETH"]];
steps.forEach((st, i) => {
  const x = 0.5 + i * 2.3;
  card(s, x, 1.5, 2.1, 2.2);
  num(s, x + 0.15, 1.65, i + 1, BLUE);
  T(s, st[0], { x: x + 0.15, y: 2.3, w: 1.8, h: 0.4, fontSize: 20, bold: true, color: NAVY, fontFace: "Cambria" });
  T(s, st[1], { x: x + 0.15, y: 2.8, w: 1.8, h: 0.8, fontSize: 14 });
});
card(s, 0.5, 4.0, 9, 1.0, "FDECEE");
T(s, [{ text: "Si le ratio passe sous 130 % : ", options: { bold: true, color: RED } }, { text: "n'importe qui peut liquider le coffre, rembourse la dette en CDFx et reçoit le collatéral avec 10 % de bonus." }], { x: 0.7, y: 4.0, w: 8.6, h: 1.0, valign: "middle", fontSize: 15 });
s.addNotes("Ratio = valeur du collatéral / dette. 150 % pour émettre, 130 % pour liquider, bonus de 10 % pour le liquidateur.");

// 4 Architecture
s = base("Architecture : 4 contrats, une DApp statique");
card(s, 0.5, 1.4, 2.3, 1.1, "E4EAF5"); T(s, "DApp React\nwagmi / viem · Vercel", { x: 0.6, y: 1.4, w: 2.1, h: 1.1, valign: "middle", fontSize: 14, bold: true, color: NAVY });
card(s, 0.5, 3.0, 2.3, 1.1, "E4EAF5"); T(s, "MetaMask\nportefeuille de test", { x: 0.6, y: 3.0, w: 2.1, h: 1.1, valign: "middle", fontSize: 14, bold: true, color: NAVY });
s.addShape(pres.shapes.LINE, { x: 1.65, y: 2.5, w: 0, h: 0.5, line: { color: MUTED, width: 1.5, endArrowType: "triangle" } });
s.addShape(pres.shapes.LINE, { x: 2.8, y: 3.55, w: 0.9, h: 0, line: { color: MUTED, width: 1.5, endArrowType: "triangle" } });
card(s, 3.7, 1.2, 5.8, 3.9, NAVY);
T(s, "Ethereum Sepolia", { x: 3.9, y: 1.3, w: 3, h: 0.4, fontSize: 14, bold: true, color: YEL });
const cs = [["VaultManager", "coffres, émission, liquidation, frais"], ["CDFxToken", "ERC-20, créé uniquement par le VaultManager"], ["CDFxOracle", "prix ETH/CDF, contrôles d'intégrité"], ["CDFxFaucet", "CDFx de démonstration"]];
cs.forEach((c, i) => {
  const x = 3.9 + (i % 2) * 2.8, y = 1.8 + Math.floor(i / 2) * 1.55;
  card(s, x, y, 2.6, 1.35, PANEL);
  T(s, c[0], { x: x + 0.15, y: y + 0.12, w: 2.3, h: 0.35, fontSize: 16, bold: true, color: WHITE, fontFace: "Cambria" });
  T(s, c[1], { x: x + 0.15, y: y + 0.55, w: 2.3, h: 0.7, fontSize: 12, color: "CADCFC" });
});
T(s, "Hors chaîne : aucun serveur, aucune base de données, aucune donnée personnelle.", { x: 0.5, y: 4.4, w: 2.9, h: 0.9, fontSize: 12, color: MUTED });
s.addNotes("Seul le VaultManager a le droit de créer des CDFx (MINTER_ROLE). L'oracle combine Chainlink et un taux de démonstration.");

// 5 Oracle
s = base("Oracle : Chainlink × taux USD/CDF");
card(s, 0.5, 1.4, 9, 1.2, NAVY);
T(s, "Prix 1 ETH en CDF  =  ETH/USD (Chainlink)  ×  USD/CDF (démo)", { x: 0.5, y: 1.4, w: 9, h: 0.7, align: "center", valign: "middle", fontSize: 22, bold: true, color: WHITE, fontFace: "Cambria" });
T(s, "3 000 $ × 2 800 CDF/$ = 8 400 000 CDF", { x: 0.5, y: 2.05, w: 9, h: 0.45, align: "center", fontSize: 16, color: YEL });
const prot = [["Intégrité Chainlink", "prix > 0, round cohérent, donnée ≤ 3 h"], ["Taux borné", "entre 1 000 et 10 000, ±10 % par mise à jour"], ["Oracle périmé", "émission et liquidation bloquées ; remboursement toujours possible"]];
prot.forEach((p, i) => {
  const x = 0.5 + i * 3.1;
  card(s, x, 3.0, 2.9, 1.9);
  T(s, p[0], { x: x + 0.2, y: 3.15, w: 2.5, h: 0.4, fontSize: 16, bold: true, color: NAVY, fontFace: "Cambria" });
  T(s, p[1], { x: x + 0.2, y: 3.65, w: 2.5, h: 1.1, fontSize: 14 });
});
s.addNotes("Il n'existe pas de flux Chainlink USD/CDF : c'est la principale limite, à décentraliser en production.");

// 6 Paramètres
s = base("Les paramètres qui protègent le système", false);
const stats = [["150 %", "ratio minimal pour émettre ou retirer", BLUE], ["130 %", "seuil de liquidation", RED], ["10 %", "bonus du liquidateur", "B38F00"], ["2 %/an", "frais de stabilité", GREEN]];
stats.forEach((st, i) => {
  const x = 0.5 + i * 2.3;
  card(s, x, 1.5, 2.1, 2.3);
  T(s, st[0], { x, y: 1.75, w: 2.1, h: 0.9, align: "center", fontSize: 36, bold: true, color: st[2], fontFace: "Cambria" });
  T(s, st[1], { x: x + 0.15, y: 2.8, w: 1.8, h: 0.9, align: "center", fontSize: 14, color: INK });
});
T(s, "Tous bornés dans le contrat : un administrateur ne peut pas fixer des frais de 100 % ni un seuil de liquidation absurde. Dette minimale 10 000 CDFx, plafond global 1 milliard.", { x: 0.5, y: 4.1, w: 9, h: 0.9, fontSize: 15, color: INK });
s.addNotes("Les bornes sont codées dans setRiskParameters : seuil >= 110 %, pénalité <= 20 %, frais <= 20 %/an.");

// 7 Exemple chiffré (graphique)
s = base("Exemple : quand un coffre devient liquidable");
const prices = [1500, 2000, 2321, 2500, 3000, 3500, 4000, 4500];
const ratios = prices.map(p => Math.round(p * 2800 / 5000000 * 1000) / 10);
s.addChart(pres.charts.LINE, [{ name: "Ratio de collatéralisation (%)", labels: prices.map(p => p + " $"), values: ratios }], {
  x: 0.4, y: 1.3, w: 5.6, h: 3.9, chartColors: [BLUE], lineSize: 3, lineDataSymbolSize: 7,
  showTitle: true, title: "Ratio selon le prix de l'ETH (1 ETH, dette 5 000 000 CDFx)", titleFontSize: 12, titleColor: INK, titleFontFace: "Calibri",
  showValue: true, dataLabelPosition: "t", dataLabelFontSize: 10, dataLabelColor: INK, dataLabelFontFace: "Calibri",
  catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10, catAxisLabelFontFace: "Calibri", valAxisLabelFontFace: "Calibri",
  valGridLine: { color: "D9E0EE", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, valAxisMinVal: 0, valAxisMaxVal: 300,
});
card(s, 6.3, 1.4, 3.2, 3.7);
T(s, "1 ETH = 3 000 $ × 2 800\n= 8 400 000 CDF", { x: 6.5, y: 1.55, w: 2.8, h: 0.8, fontSize: 14, bold: true, color: NAVY });
T(s, [{ text: "Dette 5 000 000 CDFx", options: { breakLine: true } }, { text: "Ratio 168 %", options: { breakLine: true, bold: true, color: GREEN } }, { text: " ", options: { breakLine: true } }, { text: "Liquidable sous 130 %,", options: { breakLine: true } }, { text: "soit 1 ETH < 6 500 000 CDF", options: { breakLine: true } }, { text: "≈ 2 321 $ par ETH", options: { bold: true, color: RED } }], { x: 6.5, y: 2.5, w: 2.8, h: 2.4, fontSize: 14 });
s.addNotes("À 2 321 dollars l'ETH le ratio atteint 130 %. En dessous, n'importe qui peut liquider.");

// 8 DApp tableau de bord
s = base("Tableau de bord de solvabilité", false, 4.7, 28);
s.addImage({ path: SH + "01_dashboard.png", x: 5.4, y: 0.35, w: 4.4, h: 4.4 * 1151 / 1180, altText: "Capture du tableau de bord CDFx" });
const feat = ["Prix ETH en CDF (Chainlink × taux)", "Ratio de solvabilité global", "Excédent ou déficit de couverture", "Santé des coffres et plafond de dette", "Paramètres de risque lisibles"];
feat.forEach((f, i) => { num(s, 0.5, 1.4 + i * 0.7, i + 1, BLUE); T(s, f, { x: 1.15, y: 1.4 + i * 0.7, w: 4.0, h: 0.5, valign: "middle", fontSize: 15 }); });
T(s, "Capture sur réseau local de développement.", { x: 5.4, y: 4.95, w: 4.4, h: 0.3, fontSize: 10, color: MUTED });
s.addNotes("Remplacer cette capture par celle de la DApp déployée sur Sepolia.");

// 9 DApp coffre
s = base("Un coffre guidé, sans surprise", false, 5.3, 28);
s.addImage({ path: SH + "02_vault.png", x: 6.1, y: 0.3, w: 3.7, h: 3.7 * 1418 / 1180, altText: "Capture de la page Mon coffre" });
const f2 = [["Aperçu du ratio avant signature", "on voit l'effet de l'opération avant de confirmer"], ["Simulation de la transaction", "message d'erreur clair au lieu d'un échec brut"], ["Dépôt + émission en 1 transaction", "moins de gas, démarrage rapide"], ["Simulateur de stress et liquidations", "ETH −40 %, taux USD/CDF −10 %"]];
f2.forEach((f, i) => {
  const y = 1.3 + i * 0.95;
  card(s, 0.5, y, 5.3, 0.82);
  T(s, f[0], { x: 0.7, y: y + 0.07, w: 4.9, h: 0.35, fontSize: 15, bold: true, color: NAVY });
  T(s, f[1], { x: 0.7, y: y + 0.43, w: 4.9, h: 0.3, fontSize: 12, color: MUTED });
});
s.addNotes("Démonstration : déposer, émettre, voir le prix de liquidation, rembourser.");

// 10 Tests
s = base("Tests : 34 réussis, 4 invariants vérifiés");
const ts = [["34", "tests réussis, 0 échec"], ["98 %", "des lignes couvertes"], ["750", "actions aléatoires, 3 graines"]];
ts.forEach((t, i) => {
  const x = 0.5 + i * 3.1;
  card(s, x, 1.4, 2.9, 1.7);
  T(s, t[0], { x, y: 1.5, w: 2.9, h: 0.9, align: "center", fontSize: 44, bold: true, color: BLUE, fontFace: "Cambria" });
  T(s, t[1], { x, y: 2.45, w: 2.9, h: 0.5, align: "center", fontSize: 14 });
});
T(s, "Invariants vérifiés après chaque action", { x: 0.5, y: 3.35, w: 9, h: 0.4, fontSize: 16, bold: true, color: NAVY });
T(s, [{ text: "ETH détenu = collatéral enregistré", options: { bullet: true, breakLine: true } }, { text: "somme des collatéraux = total", options: { bullet: true, breakLine: true } }, { text: "offre de CDFx = dette totale", options: { bullet: true, breakLine: true } }, { text: "dettes individuelles cohérentes · attaque par réentrance bloquée", options: { bullet: true } }], { x: 0.5, y: 3.8, w: 9, h: 1.5, fontSize: 14, paraSpaceAfter: 4 });
s.addNotes("Hardhat accepté par le sujet. Le fuzzing Foundry est dans la feuille de route.");

// 11 Slither
s = base("Slither : aucune alerte de gravité haute");
const rows = [["Détecteur", "N", "Décision"], ["incorrect-equality", "16", "comparaisons exactes sur valeurs internes"], ["reentrancy-no-eth", "7", "appel à notre ERC-20 ; nonReentrant"], ["unused-return", "9", "fraîcheur validée dans l'oracle"], ["divide-before-multiply", "1", "précision 10^27, négligeable"], ["timestamp, autres (faible)", "29", "nécessaires ou voulus"]];
s.addTable(rows.map((r, i) => r.map((c, j) => ({ text: c, options: { bold: i === 0, color: i === 0 ? WHITE : INK, fill: { color: i === 0 ? NAVY : (i % 2 ? LIGHT : WHITE) }, align: j === 1 ? "center" : "left" } }))), { x: 0.5, y: 1.4, w: 9, colW: [3.0, 0.7, 5.3], fontSize: 13, fontFace: "Calibri", rowH: 0.42, border: { type: "solid", color: "D9E0EE", pt: 0.5 }, valign: "middle" });
T(s, "Correction issue de l'analyse : dans drip(), l'indice de dette est mis à jour avant l'appel externe (effets puis interactions).", { x: 0.5, y: 4.3, w: 9, h: 0.5, fontSize: 14, color: INK });
T(s, "Analyse statique + tests : ce n'est pas un audit.", { x: 0.5, y: 4.85, w: 9, h: 0.35, fontSize: 13, bold: true, color: RED });
s.addNotes("Détail dans docs/SECURITY_ANALYSIS.md.");

// 12 Risques
s = base("Risques : perte de parité et oracle");
card(s, 0.5, 1.3, 4.4, 3.0);
T(s, "Perte de parité", { x: 0.7, y: 1.4, w: 4, h: 0.4, fontSize: 18, bold: true, color: NAVY, fontFace: "Cambria" });
T(s, [{ text: "Surcollatéralisation 150 %", options: { bullet: true, breakLine: true } }, { text: "Sous 1 CDF : racheter pour solder sa dette", options: { bullet: true, breakLine: true } }, { text: "Au-dessus : émettre devient rentable", options: { bullet: true, breakLine: true } }, { text: "Liquidations des coffres risqués", options: { bullet: true, breakLine: true } }, { text: "Limite : aucun marché réel du CDFx", options: { bullet: true, bold: true, color: RED } }], { x: 0.7, y: 1.9, w: 4.0, h: 2.3, fontSize: 14, paraSpaceAfter: 6 });
card(s, 5.1, 1.3, 4.4, 3.0);
T(s, "Oracle", { x: 5.3, y: 1.4, w: 4, h: 0.4, fontSize: 18, bold: true, color: NAVY, fontFace: "Cambria" });
T(s, [{ text: "Donnée périmée : opérations sensibles bloquées", options: { bullet: true, breakLine: true } }, { text: "Prix invalide : rejeté", options: { bullet: true, breakLine: true } }, { text: "Taux manipulé : bornes et ±10 %", options: { bullet: true, breakLine: true } }, { text: "Prix ETH agrégé par Chainlink", options: { bullet: true, breakLine: true } }, { text: "Production : flux USD/CDF décentralisé", options: { bullet: true, bold: true, color: BLUE } }], { x: 5.3, y: 1.9, w: 4.0, h: 2.3, fontSize: 14, paraSpaceAfter: 6 });
s.addNotes("Un coffre à 150 % est liquidable après -13 % de l'ETH et insolvable après -33 %.");

// 13 Gas
s = base("Coûts en gas des opérations");
const ops = [["claim", 63938], ["repay", 90237], ["deposit", 95541], ["withdraw", 106384], ["liquidate", 121537], ["mint", 172316], ["depositAndMint", 177538]];
s.addChart(pres.charts.BAR, [{ name: "Gas", labels: ops.map(o => o[0]), values: ops.map(o => o[1]) }], {
  x: 0.4, y: 1.3, w: 6.0, h: 3.9, barDir: "bar", chartColors: [BLUE], showValue: true, dataLabelPosition: "outEnd", dataLabelFontSize: 10, dataLabelColor: INK, dataLabelFontFace: "Calibri", dataLabelFormatCode: "#,##0",
  catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, catAxisLabelFontSize: 11, valAxisLabelFontSize: 10, catAxisLabelFontFace: "Calibri", valAxisLabelFontFace: "Calibri",
  valGridLine: { color: "D9E0EE", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, valAxisMinVal: 0, valAxisMaxVal: 220000,
});
card(s, 6.7, 1.4, 2.8, 3.7);
T(s, "4,85 M", { x: 6.7, y: 1.6, w: 2.8, h: 0.8, align: "center", fontSize: 40, bold: true, color: NAVY, fontFace: "Cambria" });
T(s, "de gas pour déployer les 4 contrats", { x: 6.9, y: 2.45, w: 2.4, h: 0.7, align: "center", fontSize: 14 });
T(s, "À 20 gwei, une émission coûte environ 0,0034 ETH. Sur Sepolia, l'ETH n'a aucune valeur.", { x: 6.9, y: 3.4, w: 2.4, h: 1.5, align: "center", fontSize: 12, color: MUTED });
s.addNotes("Mesures avec l'optimiseur activé (200 runs). Voir docs/GAS_REPORT.md.");

// 14 Limites et feuille de route
s = base("Limites et feuille de route");
card(s, 0.5, 1.3, 4.4, 3.0, "FDECEE");
T(s, "Limites", { x: 0.7, y: 1.4, w: 4, h: 0.4, fontSize: 18, bold: true, color: RED, fontFace: "Cambria" });
T(s, [{ text: "Prototype non audité, réseau de test", options: { bullet: true, breakLine: true } }, { text: "Taux USD/CDF centralisé", options: { bullet: true, breakLine: true } }, { text: "Un seul collatéral (ETH)", options: { bullet: true, breakLine: true } }, { text: "Liquidation à prix fixe, sans enchères", options: { bullet: true, breakLine: true } }, { text: "Fuzzing en JavaScript, pas Foundry", options: { bullet: true } }], { x: 0.7, y: 1.9, w: 4.0, h: 2.3, fontSize: 14, paraSpaceAfter: 6 });
card(s, 5.1, 1.3, 4.4, 3.0, "E4EAF5");
T(s, "Vers la production", { x: 5.3, y: 1.4, w: 4, h: 0.4, fontSize: 18, bold: true, color: BLUE, fontFace: "Cambria" });
T(s, [{ text: "Audit externe, fuzzing Foundry", options: { bullet: true, breakLine: true } }, { text: "Oracle USD/CDF décentralisé", options: { bullet: true, breakLine: true } }, { text: "Multisignature + timelock", options: { bullet: true, breakLine: true } }, { text: "Module de stabilité, fonds de réserve", options: { bullet: true, breakLine: true } }, { text: "Cadre légal en RDC (LCB-FT)", options: { bullet: true } }], { x: 5.3, y: 1.9, w: 4.0, h: 2.3, fontSize: 14, paraSpaceAfter: 6 });

// 15 Conclusion
s = base(null, true);
T(s, "Ce que nous avons démontré", { x: 0.6, y: 0.5, w: 8.8, h: 0.8, fontSize: 32, bold: true, color: WHITE, fontFace: "Cambria" });
T(s, [{ text: "Un stablecoin local peut être conçu avec des contrats simples et vérifiables", options: { bullet: true, breakLine: true } }, { text: "34 tests, 4 invariants, Slither sans alerte haute", options: { bullet: true, breakLine: true } }, { text: "Le point faible reste l'oracle de change : à décentraliser en priorité", options: { bullet: true } }], { x: 0.6, y: 1.5, w: 8.8, h: 1.9, fontSize: 18, color: "CADCFC", paraSpaceAfter: 10 });
card(s, 0.6, 3.6, 8.8, 1.5, PANEL);
T(s, [{ text: "DApp : [URL Vercel]", options: { breakLine: true } }, { text: "Code : [lien GitHub]", options: { breakLine: true } }, { text: "Contrats : [liens Etherscan Sepolia]" }], { x: 0.9, y: 3.7, w: 8.2, h: 1.3, fontSize: 16, color: YEL, valign: "middle" });
s.addNotes("Remplacer les crochets par les vrais liens avant la défense. Merci.");

pres.writeFile({ fileName: "CDFx_Presentation_Groupe13.pptx" }).then(() => console.log("ok"));
