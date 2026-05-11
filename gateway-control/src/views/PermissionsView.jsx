import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { PanelHeader } from "../components/Common";
import { updateAccess } from "../services/gatewayRepository";

export function PermissionsView({ client, state, refresh }) {
  const [email, setEmail] = useState("");
  const [host, setHost] = useState("");
  const [allow, setAllow] = useState(true);
  const matrix = useMemo(() => state.domains.map(domain => ({
    host: domain.domain?.host,
    emails: domain.access?.allowed_emails || []
  })), [state.domains]);

  async function submit(event) {
    event.preventDefault();
    await updateAccess(client, email, host, allow);
    await refresh();
  }

  return (
    <section className="panel">
      <PanelHeader title="用户域名许可" />
      <form className="inline-form" onSubmit={submit}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
        <select value={host} onChange={e => setHost(e.target.value)}>
          <option value="">选择域名</option>
          {state.domains.map(item => <option key={item.domain?.host} value={item.domain?.host}>{item.domain?.host}</option>)}
        </select>
        <select value={allow ? "allow" : "deny"} onChange={e => setAllow(e.target.value === "allow")}>
          <option value="allow">授权</option>
          <option value="deny">取消授权</option>
        </select>
        <button className="primary"><Save size={16} />保存许可</button>
      </form>
      <div className="matrix">
        {matrix.map(row => <section key={row.host} className="matrix-row">
          <strong>{row.host}</strong>
          <div>{row.emails.length ? row.emails.map(item => <span key={item} className="tag">{item}</span>) : <span className="muted">暂无邮箱许可</span>}</div>
        </section>)}
      </div>
    </section>
  );
}

