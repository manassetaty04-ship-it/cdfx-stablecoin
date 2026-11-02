import { useMemo } from "react";
import { Banner, Card, Meter, Stat } from "./ui";
import { useProtocol, useVaultOwners, useVaults } from "../hooks";
import { fmtAge, fmtCdf, fmtEth, fmtRatio, fmtUsd, health, healthLabel, isInfinite, toNum } from "../format";
import { WAD } from "../config";

export function useBuckets(stats, vaults) {
  return useMemo(() => {
    const price = stats?.priceCdf ?? 0n;
    const out = { none: 0, ok: 0, caution: 0, warn: 0, danger: 0, riskyEth: 0n, total: 0 };
    if (!stats || price === 0n) return out;
    const min = Number(stats.minCollateralRatioBps) / 100;
    const liq = Number(stats.liquidationRatioBps) / 100;
    for (const v of vaults) {
      if (v.collateral === 0n && v.debt === 0n) continue;
      out.total++;
      if (v.debt === 0n) {
        out.none++;
        continue;
      }
      const ratio = (Number((v.collateral * price) / WAD) / Number(v.debt)) * 100;
      const h = health(ratio, min, liq);
      out[h]++;
      if (h === "danger" || h === "warn") out.riskyEth += v.collateral;
    }
    return out;
  }, [stats, vaults]);
}

export default function Dashboard() {
  const p = useProtocol();
  const owners = useVaultOwners();
  const { vaults } = useVaults(owners.data);
  const s = p.stats;
  const buckets = useBuckets(s, vaults);

  if (p.loading) return <Card title="Tableau de bord"><p className="muted">Chargement des données de la blockchain…</p></Card>;
  if (!s) return <Banner kind="danger">Impossible de lire les contrats. Vérifiez le réseau (Sepolia) et la connexion RPC.</Banner>;

  const minPct = Number(s.minCollateralRatioBps) / 100;
  const liqPct = Number(s.liquidationRatioBps) / 100;
  const collValue = s.oracleOk ? (s.totalCollateral * s.priceCdf) / WAD : 0n;
  const global = s.oracleOk ? s.globalRatioBps : null;
  const globalPct = global === null ? NaN : isInfinite(global) ? Infinity : Number(global) / 100;
  const tone = health(globalPct, minPct, liqPct);
  const surplus = collValue - s.totalDebt;
  const ceilingUse = s.debtCeiling > 0n ? Math.min(100, (toNum(s.totalDebt) / toNum(s.debtCeiling)) * 100) : 0;
  const ethUsd = p.ethUsd ? toNum(p.ethUsd.price) : null;

  const bars = [
    { key: "danger", label: `Liquidables (< ${liqPct} %)`, n: buckets.danger },
    { key: "warn", label: `À risque (${liqPct}–${minPct} %)`, n: buckets.warn },
    { key: "caution", label: `Prudence (${minPct}–${minPct + 30} %)`, n: buckets.caution },
    { key: "ok", label: `Sains (≥ ${minPct + 30} %)`, n: buckets.ok },
    { key: "none", label: "Sans dette", n: buckets.none },
  ];
  const maxBar = Math.max(1, ...bars.map((b) => b.n));

  return (
    <div className="stack">
      {s.paused && <Banner kind="danger">Protocole en pause d'urgence : dépôts, émissions et liquidations sont suspendus. Remboursements et retraits restent possibles.</Banner>}
      {!s.oracleOk && (
        <Banner kind="warn">
          L'oracle est indisponible ou périmé (donnée Chainlink trop ancienne). Les émissions, retraits avec dette et liquidations sont bloqués par sécurité ; dépôts et remboursements restent possibles.
        </Banner>
      )}

      <div className="grid stats">
        <Stat label="Prix de 1 ETH" value={s.oracleOk ? `${fmtCdf(s.priceCdf)} CDF` : "indisponible"} hint="ETH/USD Chainlink × USD/CDF de démo" />
        <Stat
          label="ETH/USD (Chainlink)"
          value={ethUsd ? `${fmtUsd(ethUsd)} $` : "indisponible"}
          hint={p.ethUsd ? `mis à jour ${fmtAge(p.ethUsd.updatedAt)}` : "donnée périmée ou invalide"}
        />
        <Stat label="USD/CDF (taux de démo)" value={p.usdCdfRate ? `${fmtCdf(p.usdCdfRate)} CDF` : "-"} hint={p.rateUpdatedAt ? `mis à jour ${fmtAge(p.rateUpdatedAt)}` : ""} />
        <Stat label="Frais de stabilité" value={`${Number(s.stabilityFeeBps) / 100} % / an`} hint="ajoutés à la dette en continu" />
      </div>

      <Card
        title="Solvabilité globale du protocole"
        subtitle="Valeur du collatéral (ETH de test) rapportée à la dette en CDFx. Plus le ratio est élevé, plus le système est solide."
        right={<span className={`pill pill-${tone}`}>{healthLabel[tone] ?? "-"}</span>}
      >
        <div className="solv">
          <div className="solv-ratio">
            <div className={`big tone-text-${tone}`}>{global === null ? "-" : fmtRatio(global)}</div>
            <div className="muted small">ratio de collatéralisation global</div>
          </div>
          <div className="solv-meter">
            <Meter ratioPct={globalPct} minPct={minPct} liqPct={liqPct} tone={tone} max={Math.max(300, Math.ceil(Math.min(globalPct || 0, 600) / 50) * 50)} />
          </div>
        </div>
        <div className="grid cols-4 gap-top">
          <Stat label="Collatéral total" value={`${fmtEth(s.totalCollateral)} ETH`} hint={s.oracleOk ? `≈ ${fmtCdf(collValue)} CDF` : ""} />
          <Stat label="Dette totale" value={`${fmtCdf(s.totalDebt)} CDFx`} hint="frais courus inclus" />
          <Stat label="Offre de CDFx" value={`${fmtCdf(s.supply)} CDFx`} hint="doit rester ≈ dette totale" />
          <Stat
            label={surplus >= 0n ? "Excédent de couverture" : "Déficit de couverture"}
            value={s.oracleOk ? `${fmtCdf(surplus < 0n ? -surplus : surplus)} CDF` : "-"}
            tone={surplus >= 0n ? "ok" : "danger"}
            hint="valeur du collatéral − dette"
          />
        </div>
        {s.badDebt > 0n && (
          <Banner kind="danger">
            Dette irrécouvrable : {fmtCdf(s.badDebt)} CDFx (collatéral épuisé lors d'une liquidation). Elle peut être effacée dans l'onglet « Liquidations ».
          </Banner>
        )}
      </Card>

      <div className="grid two">
        <Card title="Santé des coffres" subtitle={`${buckets.total} coffre(s) enregistré(s) sur la chaîne`}>
          {buckets.total === 0 ? (
            <p className="muted">Aucun coffre pour le moment. Ouvrez le premier dans l'onglet « Mon coffre ».</p>
          ) : (
            <div className="bars">
              {bars.map((b) => (
                <div className="bar-row" key={b.key}>
                  <div className="bar-label">{b.label}</div>
                  <div className="bar-track">
                    <div className={`bar-fill tone-${b.key}`} style={{ width: `${(b.n / maxBar) * 100}%` }} />
                  </div>
                  <div className="bar-n">{b.n}</div>
                </div>
              ))}
              {buckets.riskyEth > 0n && <p className="muted small">Collatéral des coffres à risque ou liquidables : {fmtEth(buckets.riskyEth)} ETH</p>}
            </div>
          )}
        </Card>

        <Card title="Plafond de dette" subtitle="Limite globale d'émission de CDFx">
          <div className="big-sm">{ceilingUse.toFixed(ceilingUse < 1 ? 4 : 1)} %</div>
          <div className="bar-track tall">
            <div className="bar-fill tone-ok" style={{ width: `${Math.max(ceilingUse, 0.5)}%` }} />
          </div>
          <p className="muted small">
            {fmtCdf(s.totalDebt)} / {fmtCdf(s.debtCeiling)} CDFx émis
          </p>
        </Card>
      </div>

      <Card title="Paramètres de risque" subtitle="Définis dans le contrat VaultManager, modifiables uniquement par le rôle d'administration des risques.">
        <div className="grid cols-4">
          <Stat label="Ratio minimal (émission)" value={`${minPct} %`} hint="pour émettre ou retirer" />
          <Stat label="Seuil de liquidation" value={`${liqPct} %`} hint="en dessous : liquidable" />
          <Stat label="Pénalité de liquidation" value={`${Number(s.liquidationPenaltyBps) / 100} %`} hint="bonus du liquidateur" />
          <Stat label="Dette minimale" value={`${fmtCdf(s.minDebt)} CDFx`} hint="anti-poussière" />
        </div>
      </Card>
    </div>
  );
}
