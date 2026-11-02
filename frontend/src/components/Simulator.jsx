import { useEffect, useMemo, useState } from "react";
import { Card, Meter, Stat } from "./ui";
import { useMyVault, useProtocol } from "../hooks";
import { fmtCdfNum, fmtUsd, health, healthLabel, toNum } from "../format";

function Slider({ label, value, min, max, step, onChange, unit }) {
  return (
    <label className="slider">
      <div className="slider-head">
        <span>{label}</span>
        <b>{fmtCdfNum(value)} {unit}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Courbe ratio = f(prix ETH/USD) avec reperes aux seuils */
function Curve({ coll, debt, rate, price, minPct, liqPct }) {
  const W = 560, H = 220, P = { l: 44, r: 12, t: 12, b: 28 };
  const xmin = 300, xmax = 6000;
  const ratioAt = (usd) => (debt > 0 ? ((coll * usd * rate) / debt) * 100 : 0);
  const ymax = Math.max(400, Math.min(900, ratioAt(xmax)));
  const x = (v) => P.l + ((v - xmin) / (xmax - xmin)) * (W - P.l - P.r);
  const y = (v) => H - P.b - (Math.min(v, ymax) / ymax) * (H - P.t - P.b);
  const pts = [];
  for (let u = xmin; u <= xmax; u += 100) pts.push(`${x(u).toFixed(1)},${y(ratioAt(u)).toFixed(1)}`);
  const cur = ratioAt(price);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="curve" role="img" aria-label="Ratio de collatéralisation selon le prix de l'ETH">
      <rect x={P.l} y={y(liqPct)} width={W - P.l - P.r} height={H - P.b - y(liqPct)} className="zone-danger" />
      <rect x={P.l} y={y(minPct)} width={W - P.l - P.r} height={y(liqPct) - y(minPct)} className="zone-warn" />
      <line x1={P.l} y1={y(liqPct)} x2={W - P.r} y2={y(liqPct)} className="ln-liq" />
      <line x1={P.l} y1={y(minPct)} x2={W - P.r} y2={y(minPct)} className="ln-min" />
      <text x={W - P.r - 4} y={y(liqPct) - 4} textAnchor="end" className="t-liq">liquidation {liqPct} %</text>
      <text x={W - P.r - 4} y={y(minPct) - 4} textAnchor="end" className="t-min">minimum {minPct} %</text>
      <polyline points={pts.join(" ")} className="ln-curve" fill="none" />
      <circle cx={x(Math.min(Math.max(price, xmin), xmax))} cy={y(cur)} r="5" className="dot" />
      {[500, 1500, 3000, 4500, 6000].map((u) => (
        <g key={u}>
          <line x1={x(u)} y1={H - P.b} x2={x(u)} y2={H - P.b + 4} className="axis" />
          <text x={x(u)} y={H - 8} textAnchor="middle" className="t-axis">{u} $</text>
        </g>
      ))}
      <line x1={P.l} y1={H - P.b} x2={W - P.r} y2={H - P.b} className="axis" />
      <line x1={P.l} y1={P.t} x2={P.l} y2={H - P.b} className="axis" />
      {[100, 200, 300, 400].filter((v) => v <= ymax).map((v) => (
        <text key={v} x={P.l - 6} y={y(v) + 4} textAnchor="end" className="t-axis">{v}%</text>
      ))}
    </svg>
  );
}

export default function Simulator() {
  const p = useProtocol();
  const my = useMyVault();
  const s = p.stats;
  const minPct = s ? Number(s.minCollateralRatioBps) / 100 : 150;
  const liqPct = s ? Number(s.liquidationRatioBps) / 100 : 130;
  const penPct = s ? Number(s.liquidationPenaltyBps) / 100 : 10;
  const liveUsd = p.ethUsd ? Math.round(toNum(p.ethUsd.price)) : 3000;
  const liveRate = p.usdCdfRate ? Math.round(toNum(p.usdCdfRate)) : 2800;

  const [coll, setColl] = useState(1);
  const [debt, setDebt] = useState(5_000_000);
  const [usd, setUsd] = useState(liveUsd);
  const [rate, setRate] = useState(liveRate);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (touched) return;
    setUsd(liveUsd);
    setRate(liveRate);
    if (my.collateral > 0n) setColl(Number(toNum(my.collateral).toFixed(4)));
    if (my.debt > 0n) setDebt(Math.round(toNum(my.debt)));
  }, [liveUsd, liveRate, my.collateral, my.debt, touched]);

  const t = (fn) => (v) => {
    setTouched(true);
    fn(v);
  };

  const r = useMemo(() => {
    const priceCdf = usd * rate;
    const value = coll * priceCdf;
    const ratio = debt > 0 ? (value / debt) * 100 : Infinity;
    const liqUsd = coll > 0 ? (debt * (liqPct / 100)) / (coll * rate) : Infinity;
    const dropPct = Number.isFinite(liqUsd) ? (1 - liqUsd / usd) * 100 : NaN;
    return { priceCdf, value, ratio, liqUsd, dropPct };
  }, [coll, debt, usd, rate, liqPct]);

  const tone = health(r.ratio, minPct, liqPct);
  const verdict =
    debt === 0
      ? "Aucune dette : aucun risque de liquidation."
      : r.ratio < 100
        ? "Coffre insolvable : le collatéral vaut moins que la dette. Perte pour le protocole (dette irrécouvrable)."
        : r.ratio < 100 + penPct
          ? `Liquidation peu rentable : le collatéral ne couvre plus dette + pénalité de ${penPct} %. Risque de dette irrécouvrable.`
          : r.ratio < liqPct
            ? "Coffre liquidable : n'importe qui peut le liquider avec une pénalité."
            : r.ratio < minPct
              ? "Zone de prudence : au-dessus du seuil de liquidation, mais impossible d'émettre ou de retirer."
              : "Coffre sain.";

  const scenarios = [
    { label: "ETH −20 %", f: () => setUsd(Math.round(usd * 0.8)) },
    { label: "ETH −40 %", f: () => setUsd(Math.round(usd * 0.6)) },
    { label: "ETH −60 %", f: () => setUsd(Math.round(usd * 0.4)) },
    { label: "CDF +10 % (taux −10 %)", f: () => setRate(Math.round(rate * 0.9)) },
    { label: "Retour au marché actuel", f: () => { setUsd(liveUsd); setRate(liveRate); } },
  ];

  return (
    <div className="stack">
      <Card
        title="Simulateur de stress"
        subtitle="Calcul 100 % local (aucune transaction) : que devient un coffre si le prix de l'ETH ou le taux USD/CDF change ? Utile pour l'analyse des risques (perte de parité, chocs de prix, oracle)."
      >
        <div className="grid two">
          <div className="stack-sm">
            <Slider label="Collatéral" value={coll} min={0.01} max={50} step={0.01} unit="ETH" onChange={t(setColl)} />
            <Slider label="Dette" value={debt} min={0} max={200_000_000} step={10_000} unit="CDFx" onChange={t(setDebt)} />
            <Slider label="ETH / USD" value={usd} min={300} max={6000} step={10} unit="$" onChange={t(setUsd)} />
            <Slider label="USD / CDF" value={rate} min={1000} max={5000} step={10} unit="CDF" onChange={t(setRate)} />
            <div className="chips">
              {scenarios.map((sc) => (
                <button key={sc.label} className="chip" onClick={() => { setTouched(true); sc.f(); }}>{sc.label}</button>
              ))}
            </div>
          </div>
          <div className="stack-sm">
            <div>
              <div className={`big tone-text-${tone}`}>{Number.isFinite(r.ratio) ? `${r.ratio.toFixed(1).replace(".", ",")} %` : "∞"}</div>
              <div className="muted small">ratio de collatéralisation · <span className={`pill pill-${tone}`}>{healthLabel[tone]}</span></div>
            </div>
            <Meter ratioPct={r.ratio} minPct={minPct} liqPct={liqPct} tone={tone} />
            <p className={`verdict tone-text-${tone === "ok" || tone === "none" ? "ok" : tone === "caution" ? "warn" : tone}`}>{verdict}</p>
            <div className="grid cols-2">
              <Stat label="Prix de 1 ETH" value={`${fmtCdfNum(r.priceCdf)} CDF`} />
              <Stat label="Valeur du collatéral" value={`${fmtCdfNum(r.value)} CDF`} />
              <Stat label="ETH/USD de liquidation" value={Number.isFinite(r.liqUsd) ? `${fmtUsd(r.liqUsd)} $` : "-"} hint={Number.isFinite(r.dropPct) ? (r.dropPct > 0 ? `baisse de ${r.dropPct.toFixed(1).replace(".", ",")} % nécessaire` : "déjà atteint") : ""} />
              <Stat label="Dette à couvrir" value={`${fmtCdfNum(debt)} CDFx`} />
            </div>
          </div>
        </div>
      </Card>
      <Card title="Ratio selon le prix de l'ETH" subtitle="La zone rouge est celle où le coffre peut être liquidé ; la zone orange interdit toute nouvelle émission.">
        <Curve coll={coll} debt={debt} rate={rate} price={usd} minPct={minPct} liqPct={liqPct} />
      </Card>
    </div>
  );
}
