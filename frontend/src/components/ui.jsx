import { addressUrl } from "../config";
import { shortAddr } from "../format";

export function Card({ title, subtitle, children, className = "", right }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }) {
  return (
    <div className={`stat ${tone ? `tone-${tone}` : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Banner({ kind = "info", children }) {
  return <div className={`banner banner-${kind}`}>{children}</div>;
}

export function ExplorerLink({ address, label }) {
  const url = addressUrl(address);
  const text = label ?? shortAddr(address);
  if (!url) return <code>{text}</code>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mono">
      {text} ↗
    </a>
  );
}

/** Barre de sante : position du ratio entre 100 % et `max` %, avec reperes aux seuils de liquidation et d'emission */
export function Meter({ ratioPct, minPct, liqPct, max = 300, tone }) {
  const pos = (v) => `${Math.min(100, Math.max(0, ((v - 100) / (max - 100)) * 100))}%`;
  const infinite = !Number.isFinite(ratioPct);
  return (
    <div className="meter" aria-hidden="true">
      <div className="meter-track">
        <div className={`meter-fill tone-${tone}`} style={{ width: infinite ? "100%" : pos(ratioPct) }} />
        <div className="meter-mark mark-liq" style={{ left: pos(liqPct) }}>
          <span>{liqPct} %</span>
        </div>
        <div className="meter-mark mark-min" style={{ left: pos(minPct) }}>
          <span>{minPct} %</span>
        </div>
      </div>
      <div className="meter-scale">
        <span>100 %</span>
        <span>{max} %+</span>
      </div>
    </div>
  );
}

export function ActionCard({ title, help, unit, value, onChange, onMax, maxLabel = "Max", button, onSubmit, disabled, busy, preview, children }) {
  return (
    <div className="action">
      <h3>{title}</h3>
      {help && <p className="muted small">{help}</p>}
      <div className="input-row">
        <input
          inputMode="decimal"
          placeholder="0,0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${title} (${unit})`}
        />
        <span className="unit">{unit}</span>
        {onMax && (
          <button type="button" className="btn-ghost" onClick={onMax}>
            {maxLabel}
          </button>
        )}
      </div>
      {children}
      {preview && <div className="preview">{preview}</div>}
      <button className="btn" disabled={disabled || busy} onClick={onSubmit}>
        {busy ? "En cours…" : button}
      </button>
    </div>
  );
}
