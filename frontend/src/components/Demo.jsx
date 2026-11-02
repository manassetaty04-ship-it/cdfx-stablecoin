import { useState } from "react";
import { useAccount } from "wagmi";
import { Banner, Card, Stat } from "./ui";
import { useFaucet, useProtocol, useRoles } from "../hooks";
import { useTx } from "../useTx";
import { fmtCdf, fmtDateTime, parseInput, toNum } from "../format";

const FAUCETS = [
  { name: "Google Cloud Web3 (Sepolia)", url: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia" },
  { name: "Alchemy (Sepolia)", url: "https://www.alchemy.com/faucets/ethereum-sepolia" },
  { name: "Chainlink (Sepolia)", url: "https://faucets.chain.link/sepolia" },
];

export default function Demo() {
  const { isConnected } = useAccount();
  const p = useProtocol();
  const f = useFaucet();
  const roles = useRoles();
  const send = useTx();
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState("");

  const now = Math.floor(Date.now() / 1000);
  const next = f.nextClaimAt ? Number(f.nextClaimAt) : 0;
  const waiting = next > now;
  const cur = p.usdCdfRate ? toNum(p.usdCdfRate) : null;
  const run = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy("");
    }
  };
  const rateVal = parseInput(rate);

  return (
    <div className="stack">
      <Banner kind="info">
        Tout ce projet fonctionne sur le réseau de test <b>Sepolia</b> : l'ETH et le CDFx n'ont <b>aucune valeur réelle</b>. N'utilisez jamais de fonds réels.
      </Banner>

      <Card title="1. Obtenir des ETH Sepolia (gratuits)" subtitle="Nécessaires pour déposer du collatéral et payer le gas. Utilisez un portefeuille dédié au projet.">
        <ul className="links">
          {FAUCETS.map((x) => (
            <li key={x.url}>
              <a href={x.url} target="_blank" rel="noreferrer">{x.name} ↗</a>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="2. Robinet de CDFx" subtitle="Les frais de stabilité s'ajoutent à la dette : pour rembourser tout, il faut un peu plus de CDFx que le montant émis. Le robinet en distribue gratuitement.">
        <div className="grid cols-3">
          <Stat label="Par réclamation" value={f.claimAmount !== null ? `${fmtCdf(f.claimAmount)} CDFx` : "-"} />
          <Stat label="Réserve du robinet" value={f.balance !== null ? `${fmtCdf(f.balance)} CDFx` : "-"} />
          <Stat label="Prochaine réclamation" value={waiting ? fmtDateTime(next) : "disponible"} />
        </div>
        <button
          className="btn gap-top"
          disabled={!isConnected || waiting || busy === "claim"}
          onClick={() => run("claim", () => send({ label: "Réclamation de CDFx", contract: "CDFxFaucet", functionName: "claim" }))}
        >
          {!isConnected ? "Connectez votre portefeuille" : busy === "claim" ? "En cours…" : "Réclamer des CDFx"}
        </button>
      </Card>

      {(roles.canSetRate || roles.canPause) && (
        <Card title="Administration de démonstration" subtitle="Visible uniquement pour le compte administrateur (celui qui a déployé les contrats).">
          {roles.canSetRate && (
            <div className="admin-block">
              <h3>Taux USD/CDF de démonstration</h3>
              <p className="muted small">
                Valeur actuelle : <b>{cur ? fmtCdf(p.usdCdfRate) : "-"}</b> CDF pour 1 USD. Variation maximale autorisée : ±10 % par mise à jour. Baisser le taux fait baisser la valeur de l'ETH en CDF : deux baisses successives suffisent pour rendre liquidable un coffre à 150 %.
              </p>
              <div className="input-row">
                <input inputMode="decimal" placeholder="Nouveau taux (ex. 2520)" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Nouveau taux USD/CDF" />
                <span className="unit">CDF/USD</span>
                {cur && (
                  <>
                    <button className="btn-ghost" onClick={() => setRate(String(Math.round(cur * 0.9)))}>−10 %</button>
                    <button className="btn-ghost" onClick={() => setRate(String(Math.round(cur * 1.1)))}>+10 %</button>
                  </>
                )}
              </div>
              <button
                className="btn"
                disabled={!rateVal || busy === "rate"}
                onClick={() => run("rate", async () => (await send({ label: "Mise à jour du taux USD/CDF", contract: "CDFxOracle", functionName: "setUsdCdfRate", args: [rateVal] })) && setRate(""))}
              >
                {busy === "rate" ? "En cours…" : "Mettre à jour le taux"}
              </button>
            </div>
          )}
          {roles.canPause && (
            <div className="admin-block">
              <h3>Pause d'urgence</h3>
              <p className="muted small">Bloque dépôts, émissions et liquidations. Remboursements et retraits restent possibles.</p>
              <button
                className={`btn ${p.stats?.paused ? "" : "btn-danger"}`}
                disabled={busy === "pause"}
                onClick={() => run("pause", () => send({ label: p.stats?.paused ? "Reprise" : "Pause d'urgence", contract: "VaultManager", functionName: p.stats?.paused ? "unpause" : "pause" }))}
              >
                {p.stats?.paused ? "Reprendre le protocole" : "Activer la pause"}
              </button>
            </div>
          )}
        </Card>
      )}

      <Card title="Scénario de démonstration conseillé">
        <ol className="steps">
          <li>Obtenez des ETH Sepolia, connectez MetaMask, puis déposez 0,02 ETH et émettez des CDFx (onglet « Mon coffre »).</li>
          <li>Observez le ratio global dans le tableau de bord et le prix de liquidation de votre coffre.</li>
          <li>Testez un choc dans le « Simulateur » (ETH −40 %, taux USD/CDF −10 %).</li>
          <li>En administrateur, baissez le taux USD/CDF de 10 % deux fois : le coffre passe sous 130 %.</li>
          <li>Depuis un second compte, liquidez-le (onglet « Liquidations ») et constatez la pénalité de 10 %.</li>
        </ol>
      </Card>
    </div>
  );
}
