import { useEffect, useMemo, useState } from "react";
import { Activity, Database, Globe2, KeyRound, Link2, LogOut, RefreshCw, Search, UsersRound } from "lucide-react";
import { ErrorNotice } from "../components/Common";
import { LOGO_URL } from "../config/constants";
import { makeClient } from "../services/kvdbClient";
import { loadAll } from "../services/gatewayRepository";
import { Dashboard } from "../views/Dashboard";
import { DomainsView } from "../views/DomainsView";
import { UsersView } from "../views/UsersView";
import { PermissionsView } from "../views/PermissionsView";
import { KvdbReadView } from "../views/KvdbReadView";
import { StatusView } from "../views/StatusView";
import { TokenDebugView } from "../views/TokenDebugView";

const TABS = [
  { id: "dashboard", label: "概览", icon: Activity },
  { id: "domains", label: "域名库", icon: Globe2 },
  { id: "users", label: "用户库", icon: UsersRound },
  { id: "permissions", label: "许可矩阵", icon: Link2 },
  { id: "kvdb", label: "KVDB 查询", icon: Search },
  { id: "token-debug", label: "令牌调试", icon: KeyRound },
  { id: "status", label: "状态检查", icon: Database }
];

export function Shell({ config, onReset }) {
  const client = useMemo(() => makeClient(config), [config]);
  const [tab, setTab] = useState("dashboard");
  const [state, setState] = useState({ domains: [], users: [], status: null, loading: true, error: "" });

  async function refresh() {
    setState(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const loaded = await loadAll(client);
      setState({ ...loaded, loading: false, error: "" });
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: err }));
    }
  }

  useEffect(() => {
    refresh();
  }, [client]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-title"><img src={LOGO_URL} alt="DreamReflex" />Gateway Control</div>
        <nav>
          {TABS.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><Icon size={18} />{item.label}</button>;
          })}
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">Client-side HTTPKVDB Console</div>
            <h1>{TABS.find(item => item.id === tab)?.label}</h1>
          </div>
          <div className="top-actions">
            <button className="ghost" onClick={refresh}><RefreshCw size={16} />刷新</button>
            <span className="user-pill"><Database size={16} />{client.baseUrl}</span>
            <button className="ghost danger" onClick={onReset}><LogOut size={16} />清除凭据</button>
          </div>
        </header>
        <ErrorNotice error={state.error} fallbackName="DATA_LOAD_FAILED" className="banner error" />
        {tab === "dashboard" && <Dashboard state={state} setTab={setTab} />}
        {tab === "domains" && <DomainsView client={client} state={state} refresh={refresh} />}
        {tab === "users" && <UsersView client={client} state={state} refresh={refresh} />}
        {tab === "permissions" && <PermissionsView client={client} state={state} refresh={refresh} />}
        {tab === "kvdb" && <KvdbReadView client={client} state={state} />}
        {tab === "token-debug" && <TokenDebugView />}
        {tab === "status" && <StatusView client={client} state={state} refresh={refresh} />}
      </section>
    </div>
  );
}
