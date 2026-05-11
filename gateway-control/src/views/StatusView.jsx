import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { CheckLine, PanelHeader } from "../components/Common";
import { domainStatus } from "../services/gatewayRepository";

export function StatusView({ client, state, refresh }) {
  const [domainResult, setDomainResult] = useState(null);

  async function checkDomain(host) {
    setDomainResult(await domainStatus(client, host));
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

