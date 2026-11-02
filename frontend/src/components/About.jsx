import { Card, ExplorerLink } from "./ui";
import { addresses, chain, explorer } from "../config";

const ROWS = [
  ["CDFxToken", "Jeton ERC-20 CDFx (OpenZeppelin). Seul le VaultManager peut en créer."],
  ["VaultManager", "Coffres surcollatéralisés, émission, remboursement, frais de stabilité, liquidation."],
  ["CDFxOracle", "Prix ETH/CDF = flux Chainlink ETH/USD × taux USD/CDF de démonstration."],
  ["CDFxFaucet", "Robinet de CDFx de démonstration (sans valeur)."],
];

export default function About() {
  return (
    <div className="stack">
      <Card title="Contrats déployés" subtitle={`Réseau : ${chain.name}${explorer ? " · code source vérifié sur Etherscan" : ""}`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Contrat</th><th>Adresse</th><th>Rôle</th></tr>
            </thead>
            <tbody>
              {ROWS.map(([name, desc]) => (
                <tr key={name}>
                  <td><b>{name}</b></td>
                  <td>{addresses[name] ? <ExplorerLink address={addresses[name]} label={addresses[name]} /> : "non déployé"}</td>
                  <td className="muted small">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Comment fonctionne le CDFx ?">
        <ol className="steps">
          <li><b>Collatéral :</b> l'utilisateur dépose de l'ETH de test dans un coffre personnel.</li>
          <li><b>Émission :</b> il peut créer des CDFx tant que la valeur de son collatéral reste au moins 150 % de sa dette. 1 CDFx est conçu pour valoir 1 franc congolais (CDF).</li>
          <li><b>Oracle :</b> le prix de l'ETH en CDF combine le flux Chainlink ETH/USD et un taux USD/CDF de démonstration (il n'existe pas de flux Chainlink USD/CDF).</li>
          <li><b>Frais de stabilité :</b> 2 % par an, ajoutés à la dette ; ils sont créés en CDFx pour la trésorerie, de sorte que l'offre reste égale à la dette.</li>
          <li><b>Liquidation :</b> sous 130 %, n'importe qui peut rembourser la dette d'un coffre et recevoir son collatéral avec 10 % de bonus. Cela maintient le système surcollatéralisé.</li>
          <li><b>Parité :</b> si 1 CDFx cote moins de 1 CDF, rembourser sa dette devient avantageux (on rachète pas cher) ; s'il cote plus, émettre devient avantageux. Ces arbitrages ramènent le prix vers 1 CDF.</li>
        </ol>
      </Card>

      <Card title="Limites et avertissements">
        <ul className="bullets">
          <li>Prototype pédagogique <b>non audité</b>, sur réseau de test, sans valeur réelle ni vente de jetons.</li>
          <li>Le taux USD/CDF est une donnée de démonstration contrôlée par un administrateur (bornée à ±10 % par mise à jour) : en production, il faudrait un flux décentralisé.</li>
          <li>Aucun marché n'échange réellement le CDFx : la parité 1:1 est ici un objectif de conception, démontré par les mécanismes, pas par un prix de marché.</li>
          <li>Aucune donnée personnelle n'est stockée sur la chaîne : uniquement des adresses de portefeuille, des montants et des événements.</li>
          <li>Références : OpenZeppelin Contracts v5, Chainlink Data Feeds, protocole MakerDAO (Sky) pour l'inspiration du modèle de coffres.</li>
        </ul>
      </Card>
    </div>
  );
}
