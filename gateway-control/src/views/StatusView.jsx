import { useState } from "react";
import { RefreshCw, Wrench } from "lucide-react";
import { CheckLine, PanelHeader } from "../components/Common";
import { domainStatus, repairDataConsistency } from "../services/gatewayRepository";

export function StatusView({ client, state, refresh }) {
  const [domainResult, setDomainResult] = useState(null);
  const [repairResult, setRepairResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function checkDomain(host) {
    setDomainResult(await domainStatus(client, host));
  }

  async function repair() {
    setBusy(true);
    try {
      const result = await repairDataConsistency(client);
      setRepairResult(result);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-grid">
      <section className="panel">
        <PanelHeader title="系统状态" action={<button className="ghost" onClick={refresh}><RefreshCw size={16} />重新检查</button>} />
        <CheckLine label="KVDB Ready" ok={state.status?.kvdb?.ready?.ok} message={`${state.status?.kvdb?.ready?.status || "-"}`} />
        <CheckLine label="KVDB Health" ok={state.status?.kvdb?.health?.ok} message={`${state.status?.kvdb?.health?.status || "-"}`} />
        <CheckLine label="KVDB Base URL" ok={Boolean(state.status?.kvdb?.base_url)} message={state.status?.kvdb?.base_url || "-"} />
        <CheckLine label="ztafirewall/meta" ok={state.status?.initialization?.checks?.meta} message={state.status?.meta ? `schema v${state.status.meta.schema_version || 1}` : "auto-created if missing"} />
        <CheckLine label="ztafirewall/domains" ok={state.status?.initialization?.checks?.domains} message={`${state.domains.length} domains`} />
        <CheckLine label="ztafirewall/users" ok={state.status?.initialization?.checks?.users} message={`${state.users.length} users`} />
        <CheckLine label="数据一致性" ok={state.status?.integrity?.ok} message={state.status?.integrity?.ok ? "indexes and records are consistent" : `${state.status?.integrity?.issues?.length || 0} issues`} />
        <div className="status-actions">
          <button className="ghost" onClick={repair} disabled={busy}><Wrench size={16} />{busy ? "修复中" : "修复索引一致性"}</button>
          {repairResult ? <span className="muted">已提交 {repairResult.repaired} 个修复操作</span> : null}
        </div>
        {state.status?.integrity?.issues?.length ? <pre className="json-block compact-json">{JSON.stringify(state.status.integrity.issues, null, 2)}</pre> : null}
      </section>
      <section className="panel status-domain-panel">
        <PanelHeader title="域名状态检查" />
        <div className="status-list">
          {state.domains.map(item => <button key={item.domain?.host} className="domain-check" onClick={() => checkDomain(item.domain?.host)}>{item.domain?.host}</button>)}
        </div>
        {domainResult ? <pre className="json-block">{JSON.stringify(domainResult, null, 2)}</pre> : null}
      </section>
    </div>
  );
}
