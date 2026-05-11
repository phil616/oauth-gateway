import { CheckCircle2, CircleAlert, Search, X } from "lucide-react";
import { normalizeError } from "../services/errorCatalog";

export function Metric({ icon: Icon, label, value, sub }) {
  return <section className="metric"><Icon size={20} /><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></section>;
}

export function CheckLine({ label, ok, message }) {
  return <div className="check-line">{ok ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}<strong>{label}</strong><span>{message}</span></div>;
}

export function PanelHeader({ title, action }) {
  return <div className="panel-header"><h2>{title}</h2>{action}</div>;
}

export function Toolbar({ query, setQuery, placeholder }) {
  return <div className="toolbar"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} /></div>;
}

export function StatusBadge({ ok, text }) {
  return <span className={ok ? "badge ok" : "badge off"}>{text}</span>;
}

export function Field({ label, value, setValue, type = "text" }) {
  return <label>{label}<input type={type} value={value} onChange={e => setValue(e.target.value)} /></label>;
}

export function Drawer({ title, children, onClose }) {
  return <div className="drawer-backdrop"><aside className="drawer"><header><h2>{title}</h2><button className="icon" onClick={onClose}><X size={18} /></button></header>{children}</aside></div>;
}

export function ErrorNotice({ error, fallbackName = "OPERATION_FAILED", className = "error-line" }) {
  if (!error) return null;
  const normalized = normalizeError(error, fallbackName);
  return (
    <div className={className}>
      <CircleAlert size={16} />
      <span><strong>{normalized.code}</strong> {normalized.name} · {normalized.title}</span>
      <a href={normalized.documentation_url} target="_blank" rel="noreferrer">错误码说明</a>
    </div>
  );
}
