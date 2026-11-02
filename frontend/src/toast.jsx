import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { txUrl } from "./config";

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const push = useCallback((t) => {
    const id = nextId.current++;
    setItems((x) => [...x, { id, ...t }]);
    return id;
  }, []);
  const update = useCallback((id, patch) => {
    setItems((x) => x.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    if (patch.kind === "success") setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 9000);
  }, []);
  const dismiss = useCallback((id) => setItems((x) => x.filter((i) => i.id !== id)), []);
  const value = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <div className="toast-icon">{t.kind === "pending" ? <span className="spinner" /> : t.kind === "success" ? "✔" : "!"}</div>
            <div className="toast-body">
              <div>{t.text}</div>
              {t.hash && txUrl(t.hash) && (
                <a href={txUrl(t.hash)} target="_blank" rel="noreferrer">
                  Voir la transaction sur Etherscan ↗
                </a>
              )}
            </div>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fermer">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
