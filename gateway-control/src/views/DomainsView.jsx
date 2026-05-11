import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Drawer, Field, PanelHeader, StatusBadge, Toolbar } from "../components/Common";
import { deleteDomain, emptyDomain, upsertDomain } from "../services/gatewayRepository";

function toDomainForm(item) {
  return {
    host: item.domain?.host || "",
    enabled: item.domain?.enabled !== false,
    ttl_seconds: item.domain?.jwt?.ttl_seconds || 900,
    origin_scheme: item.origin?.origin_scheme || "https",
    origin_ip: item.origin?.origin_ip || "",
    origin_host_header: item.origin?.origin_host_header || "",
    zta_token_env: item.origin?.zta_token_env || "ORIGIN_ZTA_TOKEN"
  };
}

export function DomainsView({ client, state, refresh }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const rows = state.domains.filter(item => !query || item.domain?.host?.includes(query));

  return (
    <section className="panel">
      <PanelHeader title="域名库" action={<button className="primary compact" onClick={() => setEditing(emptyDomain())}><Plus size={16} />新增域名</button>} />
      <Toolbar query={query} setQuery={setQuery} placeholder="搜索域名" />
      <table>
        <thead><tr><th>域名</th><th>源站</th><th>JWT TTL</th><th>授权邮箱</th><th>状态</th><th></th></tr></thead>
        <tbody>
          {rows.map(item => <tr key={item.domain?.host}>
            <td><strong>{item.domain?.host}</strong><small>{item.domain?.policy_id || "default policy"}</small></td>
            <td>{item.origin?.origin_ip || "-"}<small>{item.origin?.origin_host_header || ""}</small></td>
            <td>{item.domain?.jwt?.ttl_seconds || "-"}</td>
            <td>{item.access?.allowed_emails?.length || 0}</td>
            <td><StatusBadge ok={item.domain?.enabled !== false} text={item.domain?.enabled === false ? "禁用" : "启用"} /></td>
            <td><button className="ghost" onClick={() => setEditing(toDomainForm(item))}>编辑</button></td>
          </tr>)}
        </tbody>
      </table>
      {editing && <DomainDrawer client={client} initial={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} />}
    </section>
  );
}

function DomainDrawer({ client, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await upsertDomain(client, form);
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`删除域名 ${form.host}?`)) return;
    await deleteDomain(client, form.host);
    await onSaved();
  }

  return (
    <Drawer title={form.host ? "编辑域名" : "新增域名"} onClose={onClose}>
      <div className="form-grid">
        <Field label="域名" value={form.host} setValue={v => setForm({ ...form, host: v })} />
        <Field label="JWT TTL 秒" type="number" value={form.ttl_seconds} setValue={v => setForm({ ...form, ttl_seconds: Number(v) })} />
        <Field label="源站 IP/主机" value={form.origin_ip} setValue={v => setForm({ ...form, origin_ip: v })} />
        <Field label="源站 Host 头" value={form.origin_host_header} setValue={v => setForm({ ...form, origin_host_header: v })} />
        <Field label="X-ZTA-Token 环境变量" value={form.zta_token_env} setValue={v => setForm({ ...form, zta_token_env: v })} />
        <label className="check-row"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />启用域名</label>
      </div>
      {error ? <div className="error-line">{error}</div> : null}
      <div className="drawer-actions">
        <button className="primary" onClick={save} disabled={busy}><Save size={16} />保存</button>
        {initial.host ? <button className="ghost danger" onClick={remove}><Trash2 size={16} />删除</button> : null}
      </div>
    </Drawer>
  );
}

