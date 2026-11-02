import { formatUnits } from "viem";

const MAX = 2n ** 255n;

export const toNum = (v, decimals = 18) => (v === undefined || v === null ? 0 : Number(formatUnits(v, decimals)));

const nf = (max) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: max, minimumFractionDigits: 0 });
const nf0 = nf(0);
const nf2 = nf(2);
const nf4 = nf(4);

/** Montant en CDF / CDFx (18 decimales) */
export function fmtCdf(v) {
  const n = toNum(v);
  return Math.abs(n) >= 1000 ? nf0.format(n) : nf2.format(n);
}
export const fmtCdfNum = (n) => (Math.abs(n) >= 1000 ? nf0.format(n) : nf2.format(n));

export function fmtEth(v, digits = 4) {
  const n = toNum(v);
  return (digits === 4 ? nf4 : nf(digits)).format(n);
}

export const fmtUsd = (n) => nf2.format(n);

/** Ratio en points de base -> "168,0 %" */
export function fmtRatio(bps) {
  if (bps === undefined || bps === null) return "-";
  if (bps >= MAX) return "∞";
  return `${nf(1).format(Number(bps) / 100)} %`;
}
export const isInfinite = (bps) => bps !== undefined && bps !== null && bps >= MAX;

export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function fmtDateTime(ts) {
  if (!ts) return "-";
  return new Date(Number(ts) * 1000).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export function fmtAge(ts) {
  if (!ts) return "-";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - Number(ts));
  if (s < 90) return `il y a ${s} s`;
  if (s < 5400) return `il y a ${Math.round(s / 60)} min`;
  if (s < 172800) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}

/** Statut de sante d'un coffre selon son ratio (en %), le seuil minimal et le seuil de liquidation */
export function health(ratioPct, minPct, liqPct) {
  if (!Number.isFinite(ratioPct)) return "none";
  if (ratioPct < liqPct) return "danger";
  if (ratioPct < minPct) return "warn";
  if (ratioPct < minPct + 30) return "caution";
  return "ok";
}

export const healthLabel = {
  none: "Sans dette",
  ok: "Sain",
  caution: "Prudence",
  warn: "À risque",
  danger: "Liquidable",
};

/** parse un nombre saisi (virgule ou point) en bigint avec `decimals` decimales, ou null */
export function parseInput(str, decimals = 18) {
  if (!str) return null;
  const s = String(str).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [i, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const out = BigInt(i || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
  return out;
}
