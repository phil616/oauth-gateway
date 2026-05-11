import { useMemo, useState } from "react";
import { CheckCircle2, CircleMinus, Save, Search, SlidersHorizontal } from "lucide-react";
import { Drawer, PanelHeader } from "../components/Common";
import { saveDomainAccessPolicy, updateAccess } from "../services/gatewayRepository";
import { normalizeEmail, normalizeEmailDomain, normalizeHost } from "../utils/validators";

function splitLines(value) {
  return String(value || "")
    .split(/[\n,;\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function domainFormFromRecord(record) {
  return {
    allowed_emails: (record.access?.allowed_emails || []).join("\n"),
    allowed_email_domains: (record.access?.allowed_email_domains || []).join("\n")
  };
}

function userEmail(item) {
  return item.user?.email || "";
}

function domainHost(item) {
  return item.domain?.host || "";
}

function grantState(user, domain) {
  const email = userEmail(user);
  const host = domainHost(domain);
  const domainAccess = domain.access || {};
  const explicit = (domainAccess.allowed_emails || []).map(normalizeEmail).includes(email);
  const emailDomain = email.split("@")[1] || "";
  const inherited = Boolean(emailDomain && (domainAccess.allowed_email_domains || []).map(normalizeEmailDomain).includes(emailDomain));
  if (explicit) return { kind: "explicit", label: "已授权" };
  if (inherited) return { kind: "inherited", label: "域名策略" };
  return { kind: "none", label: "未授权" };
}

export function PermissionsView({ client, state, refresh }) {
  const [userQuery, setUserQuery] = useState("");
  const [domainQuery, setDomainQuery] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [editingDomain, setEditingDomain] = useState(null);

  const users = useMemo(() => state.users
    .filter(item => item.user)
    .filter(item => !userQuery || userEmail(item).includes(userQuery.trim().toLowerCase())), [state.users, userQuery]);
  const domains = useMemo(() => state.domains
    .filter(item => item.domain)
    .filter(item => !domainQuery || domainHost(item).includes(domainQuery.trim().toLowerCase())), [state.domains, domainQuery]);
  const totals = useMemo(() => {
    let explicit = 0;
    let inherited = 0;
    for (const domain of state.domains) {
      explicit += domain.access?.allowed_emails?.length || 0;
      inherited += domain.access?.allowed_email_domains?.length || 0;
    }
    return { explicit, inherited };
  }, [state.domains]);

  async function setGrant(email, host, allow) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedHost = normalizeHost(host);
    if (!normalizedEmail || !normalizedHost) return setError("请选择有效用户和域名");
    const key = `${normalizedEmail}:${normalizedHost}`;
    setBusyKey(key);
    setError("");
    try {
      await updateAccess(client, normalizedEmail, normalizedHost, allow);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="content-grid permissions-layout">
      <section className="panel permission-summary-panel">
        <PanelHeader title="许可矩阵" />
        {error ? <div className="error-line">{error}</div> : null}
        <div className="permission-summary">
          <div><span>显式邮箱许可</span><strong>{totals.explicit}</strong></div>
          <div><span>邮箱域名策略</span><strong>{totals.inherited}</strong></div>
          <div><span>用户</span><strong>{state.users.length}</strong></div>
          <div><span>域名</span><strong>{state.domains.length}</strong></div>
        </div>
        <div className="permission-filters">
          <label><Search size={15} />用户<input value={userQuery} onChange={e => setUserQuery(e.target.value)} placeholder="user@example.com" /></label>
          <label><Search size={15} />域名<input value={domainQuery} onChange={e => setDomainQuery(e.target.value)} placeholder="example.com" /></label>
        </div>
        <div className="permission-legend">
          <span><i className="legend-dot explicit" />显式授权</span>
          <span><i className="legend-dot inherited" />邮箱域名策略</span>
          <span><i className="legend-dot none" />未授权</span>
        </div>
      </section>

      <section className="panel permission-policy-panel">
        <PanelHeader title="域名策略" />
        <div className="domain-policy-list">
          {state.domains.map(item => (
            <button key={domainHost(item)} className="domain-policy-card" onClick={() => setEditingDomain(item)}>
              <strong>{domainHost(item)}</strong>
              <span>{item.access?.allowed_emails?.length || 0} 个邮箱</span>
              <span>{item.access?.allowed_email_domains?.length || 0} 个邮箱域名</span>
              <SlidersHorizontal size={16} />
            </button>
          ))}
        </div>
      </section>

      <section className="panel permission-matrix-panel">
        <PanelHeader title="用户 × 域名" action={<span className="muted">{users.length} 用户 / {domains.length} 域名</span>} />
        <div className="permission-matrix-wrap">
          <table className="permission-matrix-table">
            <thead>
              <tr>
                <th className="sticky-col">用户</th>
                {domains.map(domain => <th key={domainHost(domain)}>{domainHost(domain)}</th>)}
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={userEmail(user)}>
                  <td className="sticky-col">
                    <strong>{userEmail(user)}</strong>
                    <small>{user.user?.display_name || (user.user?.enabled === false ? "已禁用用户" : "启用用户")}</small>
                  </td>
                  {domains.map(domain => {
                    const email = userEmail(user);
                    const host = domainHost(domain);
                    const stateForCell = grantState(user, domain);
                    const key = `${email}:${host}`;
                    const isBusy = busyKey === key;
                    if (stateForCell.kind === "inherited") {
                      return (
                        <td key={host}>
                          <button className="permission-cell inherited" onClick={() => setEditingDomain(domain)}>
                            <SlidersHorizontal size={15} />
                            <span>{stateForCell.label}</span>
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td key={host}>
                        <button
                          className={`permission-cell ${stateForCell.kind}`}
                          disabled={isBusy}
                          onClick={() => setGrant(email, host, stateForCell.kind !== "explicit")}
                        >
                          {stateForCell.kind === "explicit" ? <CircleMinus size={15} /> : <CheckCircle2 size={15} />}
                          <span>{isBusy ? "处理中" : stateForCell.kind === "explicit" ? "撤回" : "许可"}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length || !domains.length ? <div className="empty-state compact-empty">没有匹配的用户或域名。</div> : null}
        </div>
      </section>

      {editingDomain ? (
        <DomainPolicyDrawer
          client={client}
          domainRecord={editingDomain}
          onClose={() => setEditingDomain(null)}
          onSaved={async () => { setEditingDomain(null); await refresh(); }}
        />
      ) : null}
    </div>
  );
}

function DomainPolicyDrawer({ client, domainRecord, onClose, onSaved }) {
  const host = domainHost(domainRecord);
  const [form, setForm] = useState(domainFormFromRecord(domainRecord));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const parsedEmails = splitLines(form.allowed_emails).map(normalizeEmail).filter(Boolean);
  const parsedDomains = splitLines(form.allowed_email_domains).map(normalizeEmailDomain).filter(Boolean);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await saveDomainAccessPolicy(client, host, {
        allowed_emails: parsedEmails,
        allowed_email_domains: parsedDomains
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer title={`域名策略: ${host}`} onClose={onClose}>
      <div className="policy-editor">
        <label>
          显式许可邮箱
          <textarea
            value={form.allowed_emails}
            onChange={e => setForm({ ...form, allowed_emails: e.target.value })}
            placeholder={"alice@example.com\nbob@example.com"}
          />
          <small>每行一个邮箱。保存后会同步用户侧访问索引。</small>
        </label>
        <label>
          许可邮箱域名
          <textarea
            value={form.allowed_email_domains}
            onChange={e => setForm({ ...form, allowed_email_domains: e.target.value })}
            placeholder={"example.com\ncorp.example"}
          />
          <small>域名策略会允许该邮箱后缀下的所有用户访问此域名。</small>
        </label>
        <div className="policy-preview">
          <div><span>有效邮箱</span><strong>{new Set(parsedEmails).size}</strong></div>
          <div><span>有效邮箱域名</span><strong>{new Set(parsedDomains).size}</strong></div>
        </div>
      </div>
      {error ? <div className="error-line">{error}</div> : null}
      <div className="drawer-actions">
        <button className="primary" onClick={save} disabled={busy}><Save size={16} />{busy ? "保存中" : "保存策略"}</button>
      </div>
    </Drawer>
  );
}
