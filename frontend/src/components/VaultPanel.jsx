import { useState } from "react";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { ActionCard, Banner, Card, Meter, Stat } from "./ui";
import { useMyVault, useProtocol } from "../hooks";
import { useTx } from "../useTx";
import { contracts, MAX_UINT, WAD } from "../config";
import { fmtCdf, fmtEth, fmtRatio, fmtUsd, health, healthLabel, isInfinite, parseInput, toNum } from "../format";

const VM = contracts.VaultManager;

export default function VaultPanel() {
  const { isConnected } = useAccount();
  const p = useProtocol();
  const my = useMyVault();
  const send = useTx();
  const [busy, setBusy] = useState("");
  const [dep, setDep] = useState("");
  const [wd, setWd] = useState("");
  const [mint, setMint] = useState("");
  const [rep, setRep] = useState("");
  const [repayAll, setRepayAll] = useState(false);
  const [comboEth, setComboEth] = useState("");
  const [comboMint, setComboMint] = useState("");

  if (!isConnected) return <Banner kind="info">Connectez votre portefeuille (MetaMask) pour ouvrir et gérer votre coffre.</Banner>;
  const s = p.stats;
  if (!s) return <Card title="Mon coffre"><p className="muted">Chargement…</p></Card>;

  const price = s.oracleOk ? s.priceCdf : 0n;
  const minPct = Number(s.minCollateralRatioBps) / 100;
  const liqPct = Number(s.liquidationRatioBps) / 100;
  const ratioPct = (coll, debt) => (debt === 0n ? Infinity : (Number((coll * price) / WAD) / Number(debt)) * 100);
  const nowPct = my.debt === 0n ? Infinity : my.ratioBps !== null ? Number(my.ratioBps) / 100 : ratioPct(my.collateral, my.debt);
  const tone = health(nowPct, minPct, liqPct);
  const collValue = (my.collateral * price) / WAD;

  const fmtPct = (r) => (Number.isFinite(r) ? `${r.toFixed(1).replace(".", ",")} %` : "∞");
  const toneOf = (r) => health(r, minPct, liqPct);

  const preview = (newColl, newDebt, extra) => {
    if (!s.oracleOk) return <span className="muted">Aperçu indisponible (oracle périmé).</span>;
    const r = ratioPct(newColl, newDebt);
    return (
      <span>
        Ratio après l'opération : <b className={`tone-text-${toneOf(r)}`}>{fmtPct(r)}</b>
        {Number.isFinite(r) && r < minPct && newDebt > 0n ? <span className="tone-text-danger"> (sous le minimum de {minPct} %)</span> : null}
        {extra}
      </span>
    );
  };

  const run = async (key, fn) => {
    setBusy(key);
    try {
      return await fn();
    } finally {
      setBusy("");
    }
  };

  const depAmt = parseInput(dep);
  const wdAmt = parseInput(wd);
  const mintAmt = parseInput(mint);
  const repAmt = parseInput(rep);
  const cEth = parseInput(comboEth);
  const cMint = parseInput(comboMint);

  const margin = (v) => (v * 999n) / 1000n; // marge de securite pour les frais qui courent entre l'apercu et l'execution

  const onRepay = async () => {
    const isMax = repayAll && my.cdfxBalance >= my.debt;
    const amount = isMax ? MAX_UINT : repAmt;
    const need = isMax ? (my.debt * 101n) / 100n + WAD : repAmt;
    if (my.allowance < need) {
      const ok = await send({ label: "Autorisation du CDFx", contract: "CDFxToken", functionName: "approve", args: [VM.address, need] });
      if (!ok) return;
    }
    const r = await send({ label: "Remboursement", contract: "VaultManager", functionName: "repay", args: [amount] });
    if (r) {
      setRep("");
      setRepayAll(false);
    }
  };

  const missing = my.debt > my.cdfxBalance ? my.debt - my.cdfxBalance : 0n;

  return (
    <div className="stack">
      <Card title="Mon coffre" subtitle="Votre position : collatéral en ETH de test et dette en CDFx.">
        <div className="vault-top">
          <div>
            <div className={`big tone-text-${tone}`}>{my.debt === 0n ? "Aucune dette" : fmtRatio(my.ratioBps ?? BigInt(Math.round(nowPct * 100)))}</div>
            <div className="muted small">
              ratio de collatéralisation · <span className={`pill pill-${tone}`}>{healthLabel[tone]}</span>
            </div>
          </div>
          <Meter ratioPct={nowPct} minPct={minPct} liqPct={liqPct} tone={tone} />
        </div>
        <div className="grid cols-4 gap-top">
          <Stat label="Collatéral" value={`${fmtEth(my.collateral)} ETH`} hint={s.oracleOk ? `≈ ${fmtCdf(collValue)} CDF` : ""} />
          <Stat label="Dette" value={`${fmtCdf(my.debt)} CDFx`} hint="frais de stabilité inclus" />
          <Stat
            label="Prix de liquidation"
            value={my.debt > 0n && my.liquidationPrice !== null && p.usdCdfRate ? `${fmtUsd(toNum(my.liquidationPrice) / toNum(p.usdCdfRate))} $` : "-"}
            hint="ETH/USD sous lequel le coffre est liquidable"
          />
          <Stat label="Votre portefeuille" value={`${fmtEth(my.ethBalance)} ETH`} hint={`${fmtCdf(my.cdfxBalance)} CDFx`} />
        </div>
        {my.ethBalance === 0n && <Banner kind="warn">Votre portefeuille n'a pas d'ETH Sepolia. Obtenez-en gratuitement dans l'onglet « Démo & robinets ».</Banner>}
      </Card>

      <div className="grid two">
        <ActionCard
          title="Déposer du collatéral"
          help="Ajoutez des ETH de test à votre coffre."
          unit="ETH"
          value={dep}
          onChange={setDep}
          onMax={() => setDep(formatUnits(my.ethBalance > 2n * 10n ** 15n ? my.ethBalance - 2n * 10n ** 15n : 0n, 18))}
          maxLabel="Max"
          button="Déposer"
          disabled={!depAmt || depAmt <= 0n}
          busy={busy === "dep"}
          preview={depAmt ? preview(my.collateral + depAmt, my.debt) : null}
          onSubmit={() => run("dep", async () => (await send({ label: "Dépôt", contract: "VaultManager", functionName: "depositCollateral", value: depAmt })) && setDep(""))}
        />
        <ActionCard
          title="Émettre des CDFx"
          help={`Empruntez des CDFx contre votre collatéral (ratio minimal ${minPct} %).`}
          unit="CDFx"
          value={mint}
          onChange={setMint}
          onMax={() => my.maxMintable !== null && setMint(formatUnits(margin(my.maxMintable), 18))}
          button="Émettre"
          disabled={!mintAmt || mintAmt <= 0n}
          busy={busy === "mint"}
          preview={mintAmt ? preview(my.collateral, my.debt + mintAmt) : my.maxMintable !== null ? <span className="muted">Maximum émettable : {fmtCdf(my.maxMintable)} CDFx</span> : null}
          onSubmit={() => run("mint", async () => (await send({ label: "Émission de CDFx", contract: "VaultManager", functionName: "mint", args: [mintAmt] })) && setMint(""))}
        />
        <ActionCard
          title="Rembourser la dette"
          help="Brûle des CDFx pour réduire votre dette. Une autorisation (approve) est demandée si nécessaire."
          unit="CDFx"
          value={rep}
          onChange={(v) => {
            setRep(v);
            setRepayAll(false);
          }}
          onMax={() => {
            setRep(formatUnits(my.cdfxBalance < my.debt ? my.cdfxBalance : my.debt, 18));
            setRepayAll(true);
          }}
          maxLabel="Tout"
          button={repayAll ? "Tout rembourser" : "Rembourser"}
          disabled={!repAmt || repAmt <= 0n || my.debt === 0n}
          busy={busy === "rep"}
          preview={
            repAmt && my.debt > 0n
              ? preview(my.collateral, repAmt >= my.debt ? 0n : my.debt - repAmt)
              : missing > 0n && my.debt > 0n
                ? <span className="tone-text-warn">Il vous manque {missing < WAD ? "un peu de" : `${fmtCdf(missing)}`} CDFx pour tout rembourser (frais de stabilité) : voir le robinet, onglet « Démo & robinets ».</span>
                : null
          }
          onSubmit={() => run("rep", onRepay)}
        />
        <ActionCard
          title="Retirer du collatéral"
          help="Récupérez des ETH tant que le ratio minimal reste respecté."
          unit="ETH"
          value={wd}
          onChange={setWd}
          onMax={() => my.maxWithdrawable !== null && setWd(formatUnits(my.debt === 0n ? my.collateral : margin(my.maxWithdrawable), 18))}
          button="Retirer"
          disabled={!wdAmt || wdAmt <= 0n}
          busy={busy === "wd"}
          preview={wdAmt ? preview(my.collateral > wdAmt ? my.collateral - wdAmt : 0n, my.debt) : my.maxWithdrawable !== null ? <span className="muted">Maximum retirable : {fmtEth(my.maxWithdrawable)} ETH</span> : null}
          onSubmit={() => run("wd", async () => (await send({ label: "Retrait", contract: "VaultManager", functionName: "withdrawCollateral", args: [wdAmt] })) && setWd(""))}
        />
      </div>

      <Card title="Démarrage rapide : déposer et émettre en une transaction" subtitle="Idéal pour ouvrir votre premier coffre.">
        <div className="combo">
          <div className="input-row">
            <input inputMode="decimal" placeholder="ETH à déposer" value={comboEth} onChange={(e) => setComboEth(e.target.value)} aria-label="ETH à déposer" />
            <span className="unit">ETH</span>
          </div>
          <div className="input-row">
            <input inputMode="decimal" placeholder="CDFx à émettre" value={comboMint} onChange={(e) => setComboMint(e.target.value)} aria-label="CDFx à émettre" />
            <span className="unit">CDFx</span>
          </div>
          <button
            className="btn"
            disabled={!cEth || !cMint || cEth <= 0n || cMint <= 0n || busy === "combo"}
            onClick={() =>
              run("combo", async () => {
                const r = await send({ label: "Dépôt + émission", contract: "VaultManager", functionName: "depositAndMint", args: [cMint], value: cEth });
                if (r) {
                  setComboEth("");
                  setComboMint("");
                }
              })
            }
          >
            {busy === "combo" ? "En cours…" : "Déposer et émettre"}
          </button>
        </div>
        {cEth && cMint && <div className="preview">{preview(my.collateral + cEth, my.debt + cMint)}</div>}
        <p className="muted small">
          Exemple : 0,02 ETH de test valent environ {s.oracleOk ? fmtCdf((2n * 10n ** 16n * s.priceCdf) / WAD) : "-"} CDF ; vous pouvez émettre jusqu'à{" "}
          {s.oracleOk ? fmtCdf((((2n * 10n ** 16n * s.priceCdf) / WAD) * 10000n) / s.minCollateralRatioBps) : "-"} CDFx (limite stricte {minPct} %). Gardez de la marge !
        </p>
      </Card>
    </div>
  );
}
