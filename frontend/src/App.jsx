import { useEffect, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import Dashboard from "./components/Dashboard";
import VaultPanel from "./components/VaultPanel";
import Liquidations from "./components/Liquidations";
import Simulator from "./components/Simulator";
import Demo from "./components/Demo";
import About from "./components/About";
import { Banner } from "./components/ui";
import { chain, isDeployed } from "./config";
import { shortAddr } from "./format";

const TABS = [
  { id: "dashboard", label: "Tableau de bord", C: Dashboard },
  { id: "vault", label: "Mon coffre", C: VaultPanel },
  { id: "liquidations", label: "Liquidations", C: Liquidations },
  { id: "simulator", label: "Simulateur", C: Simulator },
  { id: "demo", label: "Démo & robinets", C: Demo },
  { id: "about", label: "À propos", C: About },
];

function useHashTab() {
  const read = () => {
    const h = window.location.hash.replace("#/", "").replace("#", "");
    return TABS.some((t) => t.id === h) ? h : "dashboard";
  };
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [tab, (id) => (window.location.hash = `#/${id}`)];
}

function Wallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrong = isConnected && chainId !== chain.id;
  const hasWallet = typeof window !== "undefined" && Boolean(window.ethereum);

  if (isConnected) {
    return (
      <div className="wallet">
        {wrong ? (
          <button className="btn btn-warn" onClick={() => switchChain({ chainId: chain.id })}>
            Passer sur {chain.name}
          </button>
        ) : (
          <span className="net-pill"><i /> {chain.name}</span>
        )}
        <button className="btn-ghost" onClick={() => disconnect()} title="Se déconnecter">
          {shortAddr(address)} ✕
        </button>
      </div>
    );
  }

  const list = connectors.filter((c, i, a) => a.findIndex((x) => x.name === c.name) === i);
  return (
    <div className="wallet">
      {!hasWallet && (
        <a className="btn-ghost" href="https://metamask.io/download/" target="_blank" rel="noreferrer">Installer MetaMask ↗</a>
      )}
      {list.map((c) => (
        <button key={c.uid} className="btn" disabled={isPending} onClick={() => connect({ connector: c })}>
          {isPending ? "Connexion…" : list.length > 1 || c.name !== "Injected" ? `Connecter ${c.name}` : "Connecter le portefeuille"}
        </button>
      ))}
      {error && <span className="tone-text-danger small">{error.message.slice(0, 80)}</span>}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useHashTab();
  const { isConnected, chainId } = useAccount();
  const Active = TABS.find((t) => t.id === tab).C;
  const wrong = isConnected && chainId !== chain.id;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <i className="s1" /><i className="s2" /><i className="s3" />
          </span>
          <div>
            <h1>CDFx</h1>
            <p>Stablecoin simulé du franc congolais · réseau de test</p>
          </div>
        </div>
        <Wallet />
      </header>

      <nav className="tabs" aria-label="Navigation">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {!isDeployed ? (
          <Banner kind="warn">
            Les contrats ne sont pas encore déployés (fichier <code>src/deployment.json</code> vide). Lancez le déploiement puis reconstruisez l'application : voir GUIDE_DEPLOIEMENT.md.
          </Banner>
        ) : (
          <>
            {wrong && <Banner kind="warn">Votre portefeuille est sur un autre réseau. Passez sur {chain.name} pour envoyer des transactions.</Banner>}
            <Active />
          </>
        )}
      </main>

      <footer className="foot">
        Projet académique · Master 1, UNIKIN, cours Blockchain et cryptomonnaies · Aucune valeur réelle · Code source et rapport dans le dépôt GitHub.
      </footer>
    </div>
  );
}
