import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Drawer, ErrorNotice, Field, PanelHeader, StatusBadge, Toolbar } from "../components/Common";
import { deleteUser, upsertUser } from "../services/gatewayRepository";

export function UsersView({ client, state, refresh }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const rows = state.users.filter(item => !query || item.user?.email?.includes(query));

  return (
    <section className="panel">
      <PanelHeader title="用户库" action={<button className="primary compact" onClick={() => setEditing({ email: "", display_name: "", enabled: true })}><Plus size={16} />新增用户</button>} />
      <Toolbar query={query} setQuery={setQuery} placeholder="搜索邮箱" />
      <table>
        <thead><tr><th>邮箱</th><th>名称</th><th>可访问域名</th><th>状态</th><th></th></tr></thead>
        <tbody>
          {rows.map(item => <tr key={item.user?.email}>
            <td><strong>{item.user?.email}</strong></td>
            <td>{item.user?.display_name || "-"}</td>
            <td>{item.access?.domains?.length || 0}</td>
            <td><StatusBadge ok={item.user?.enabled !== false} text={item.user?.enabled === false ? "禁用" : "启用"} /></td>
            <td><button className="ghost" onClick={() => setEditing({ ...item.user })}>编辑</button></td>
          </tr>)}
        </tbody>
      </table>
      {editing && <UserDrawer client={client} initial={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} />}
    </section>
  );
}

function UserDrawer({ client, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");

  async function save() {
    try {
      await upsertUser(client, form);
      await onSaved();
    } catch (err) {
      setError(err);
    }
  }

  async function remove() {
    if (!confirm(`删除用户 ${form.email}?`)) return;
    await deleteUser(client, form.email);
    await onSaved();
  }

  return (
    <Drawer title={form.email ? "编辑用户" : "新增用户"} onClose={onClose}>
      <div className="form-grid">
        <Field label="邮箱" value={form.email} setValue={v => setForm({ ...form, email: v })} />
        <Field label="显示名称" value={form.display_name || ""} setValue={v => setForm({ ...form, display_name: v })} />
        <label className="check-row"><input type="checkbox" checked={form.enabled !== false} onChange={e => setForm({ ...form, enabled: e.target.checked })} />启用用户</label>
      </div>
      <ErrorNotice error={error} fallbackName="OPERATION_FAILED" />
      <div className="drawer-actions">
        <button className="primary" onClick={save}><Save size={16} />保存</button>
        {initial.email ? <button className="ghost danger" onClick={remove}><Trash2 size={16} />删除</button> : null}
      </div>
    </Drawer>
  );
}
