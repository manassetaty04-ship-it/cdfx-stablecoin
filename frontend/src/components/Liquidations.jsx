import { useMemo, useState } from "react";
import { formatUnits, isAddress } from "viem";
import { useAccount } from "wagmi";
import { Banner, Card, ExplorerLink } from "./ui";
import { useMyVault, useProtocol, useVaultOwners, useVaults } from "../hooks";
import { useTx } from "../useTx";
import { contracts, MAX_UINT, WAD } from "../config";
import { fmtCdf, fmtEth, health, healthLabel, parseInput, shortAddr } from "../format";

const VM = contracts.VaultManager;

function LiqRow({ v, stats, my, canAct, send }) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const price = stats.priceCdf;
  const minPct = Number(stats.minCollateralRatioBps) / 100;
  const liqPct = Number(stats.liquidationRatioBps) / 100;
  const ratio = v.debt === 0n ? Infinity : (Number((v.collateral * price) / WAD) / Number(v.debt)) * 100;
  const h = health(ratio, minPct, liqPct);
  const liquidatable = h === "danger" && stats.oracleOk && !stats.paused;
  const defaultAmt = my.cdfxBalance < v.debt ? my.cdfxBalance : v.debt;
  const amt = parseInput(amount) ?? defaultAmt;
  const cappedAmt = amt > v.debt ? v.debt : amt;
  let reward = stats.oracleOk && price > 0n ? (cappedAmt * (10000n + stats.liquidationPenaltyBps) * WAD) / (price * 10000n) : 0n;
  if (reward > v.collateral) reward = v.collateral;

  const act = async () => {
    setBusy(true);
    try {
      const isFull = cappedAmt >= v.debt;
      const arg = isFull ? MAX_UINT : cappedAmt;
      const need = isFull ? (v.debt * 101n) / 100n + WAD : cappedAmt;
      if (my.allowance < need) {
        const ok = await send({ label: "Autorisation du CDFx", contract: "CDFxToken", functionName: "approve", args: [VM.address, need] });
        if (!ok) return;
      }
      await send({ label: `Liquidation de ${shortAddr(v.owner)}`, contract: "VaultManager", functionName: "liquidate", args: [v.owner, arg] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={h === "danger" ? "row-danger" : ""}>
      <td><ExplorerLink address={v.owner} /></td>
      <td className="num">{fmtEth(v.collateral)} ETH</td>
      <td className="num">{fmtCdf(v.debt)} CDFx</td>
      <td className="num">{Number.isFinite(ratio) ? `${ratio.toFixed(1).replace(".", ",")} %` : "∞"}</td>
      <td><span className={`pill pill-${h}`}>{healthLabel[h]}</span></td>
      <td>
        {liquidatable ? (
          canAct ? (
            <div className="liq-action">
              <input
                inputMode="decimal"
                placeholder={`${formatUnits(defaultAmt, 18).slice(0, 12)} CDFx`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="CDFx à rembourser"
              />
              <button className="btn btn-danger" disabled={busy || cappedAmt === 0n} onClick={act}>
                {busy ? "…" : "Liquider"}
              </button>
              <div className="muted small">Gain estimé : ≈ {fmtEth(reward)} ETH (pénalité {Number(stats.liquidationPenaltyBps) / 100} % incluse)</div>
            </div>
          ) : (
            <span className="muted small">Connectez-vous pour liquider</span>
          )
        ) : (
          <span className="muted small">—</span>
        )}
      </td>
    </tr>
  );
}

export default function Liquidations() {
  const { isConnected } = useAccount();
  const p = useProtocol();
  const my = useMyVault();
  const send = useTx();
  const owners = useVaultOwners();
  const [extra, setExtra] = useState([]);
  const [addrInput, setAddrInput] = useState("");
  const [busyBad, setBusyBad] = useState(false);

  const list = useMemo(() => [...new Set([...(owners.data ?? []), ...extra])], [owners.data, extra]);
  const { vaults, loading } = useVaults(list);
  const s = p.stats;

  const rows = useMemo(() => {
    if (!s) return [];
    const price = s.priceCdf;
    return vaults
      .filter((v) => v.collateral > 0n || v.debt > 0n)
      .map((v) => ({ v, r: v.debt === 0n ? Infinity : (Number((v.collateral * price) / WAD) / Number(v.debt)) * 100 }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.v);
  }, [vaults, s]);

  if (!s) return <Card title="Liquidations"><p className="muted">Chargement…</p></Card>;

  const settleBad = async () => {
    setBusyBad(true);
    try {
      const amount = my.cdfxBalance < s.badDebt ? my.cdfxBalance : MAX_UINT;
      const need = amount === MAX_UINT ? (s.badDebt * 101n) / 100n + WAD : amount;
      if (my.allowance < need) {
        const ok = await send({ label: "Autorisation du CDFx", contract: "CDFxToken", functionName: "approve", args: [VM.address, need] });
        if (!ok) return;
      }
      await send({ label: "Effacement de la dette irrécouvrable", contract: "VaultManager", functionName: "settleBadDebt", args: [amount] });
    } finally {
      setBusyBad(false);
    }
  };

  return (
    <div className="stack">
      <Card
        title="Liquidations"
        subtitle={`Un coffre dont le ratio passe sous ${Number(s.liquidationRatioBps) / 100} % peut être liquidé par n'importe qui : le liquidateur rembourse la dette en CDFx et reçoit le collatéral correspondant avec une pénalité de ${Number(s.liquidationPenaltyBps) / 100} %. C'est ce mécanisme qui protège la parité du CDFx.`}
      >
        {!s.oracleOk && <Banner kind="warn">Oracle indisponible : les liquidations sont suspendues par sécurité.</Banner>}
        {owners.isLoading || loading ? (
          <p className="muted">Recherche des coffres sur la chaîne…</p>
        ) : rows.length === 0 ? (
          <p className="muted">Aucun coffre enregistré pour le moment.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Propriétaire</th>
                  <th>Collatéral</th>
                  <th>Dette</th>
                  <th>Ratio</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <LiqRow key={v.owner} v={v} stats={s} my={my} canAct={isConnected} send={send} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="add-addr">
          <input placeholder="Vérifier une adresse précise (0x…)" value={addrInput} onChange={(e) => setAddrInput(e.target.value.trim())} aria-label="Adresse à vérifier" />
          <button
            className="btn-ghost"
            disabled={!isAddress(addrInput)}
            onClick={() => {
              setExtra((x) => [...x, addrInput]);
              setAddrInput("");
            }}
          >
            Ajouter
          </button>
        </div>
        <p className="muted small">Pour essayer : vérifiez qu'un coffre devient liquidable après une baisse du taux USD/CDF (onglet « Démo & robinets ») ou dans le simulateur.</p>
      </Card>

      {s.badDebt > 0n && (
        <Card title="Dette irrécouvrable" subtitle="Dette restante après épuisement du collatéral d'un coffre.">
          <p>
            Montant : <b>{fmtCdf(s.badDebt)} CDFx</b>. N'importe quel détenteur de CDFx peut l'effacer en brûlant ses propres jetons.
          </p>
          <button className="btn" disabled={!isConnected || busyBad || my.cdfxBalance === 0n} onClick={settleBad}>
            {busyBad ? "En cours…" : "Effacer avec mes CDFx"}
          </button>
        </Card>
      )}
    </div>
  );
}
