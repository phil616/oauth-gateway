import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Database,
  Globe2,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UsersRound,
  X
} from "lucide-react";
import "./styles.css";

const CONFIG_KEY = "gateway_control_kvdb_config";
const FIXED_USERSPACE = "ztadata";
const LOGO_URL = "https://dreamreflex.com/img/logo.png";

function scopedKey(key) {
  return `${FIXED_USERSPACE}:${key}`;
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
  } catch {
    return null;
  }
}

function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : "";
}

function normalizeHost(host) {
  const value = String(host || "").trim().toLowerCase();
  if (value.includes("/") || value.includes("@") || value.includes(",")) return "";
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) ? value : "";
}

function nowIso() {
  return new Date().toISOString();
}

function makeClient(config) {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const apiKey = config.apiKey;
  const headers = extra => ({
    Authorization: `ApiKey ${apiKey}`,
    ...extra
  });
  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      const message = data?.message || data?.error || `${response.status} ${path}`;
      const error = new Error(message);
      error.status = response.status;
      error.code = data?.error || "";
      error.path = path;
      throw error;
    }
    return { response, data };
  }
  return {
    baseUrl,
    authHeaders(extra = {}) {
      return headers(extra);
    },
    async request(path, options = {}) {
      return request(path, options);
    },
    async get(key) {
      const { data } = await request(`/v1/kv/${encodeURIComponent(scopedKey(key))}`, {
        headers: headers({ Accept: "application/json" })
      });
      return data;
    },
    async head(key) {
      const response = await fetch(`${baseUrl}/v1/kv/${encodeURIComponent(scopedKey(key))}`, {
        method: "HEAD",
        headers: headers()
      });
      if (response.status === 404) return { exists: false };
      if (!response.ok) throw new Error(`HEAD ${key} failed: ${response.status}`);
      return {
        exists: true,
        version: response.headers.get("x-kv-version"),
        size: response.headers.get("x-kv-size"),
        checksum: response.headers.get("x-kv-checksum")
      };
    },
    async put(key, value) {
      await request(`/v1/kv/${encodeURIComponent(scopedKey(key))}`, {
        method: "PUT",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify(value)
      });
    },
    async delete(key) {
      const response = await fetch(`${baseUrl}/v1/kv/${encodeURIComponent(scopedKey(key))}`, {
        method: "DELETE",
        headers: headers()
      });
      if (response.status === 404) return false;
      if (!response.ok && response.status !== 204) throw new Error(`DELETE ${key} failed: ${response.status}`);
      return true;
    },
    async probe() {
      const ready = await fetch(`${baseUrl}/readyz`).catch(error => ({ ok: false, status: 0, error: error.message }));
      const health = await fetch(`${baseUrl}/healthz`).catch(error => ({ ok: false, status: 0, error: error.message }));
      return {
        base_url: baseUrl,
        ready: { ok: ready.ok, status: ready.status, error: ready.error || null },
        health: { ok: health.ok, status: health.status, error: health.error || null }
      };
    },
    async transaction(ops) {
      if (!ops.length) return { status: "noop", results: [] };
      const totalOps = ops.length;
      const create = await request("/v1/tx", {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ total_ops: totalOps, timeout_ms: 30000 })
      });
      const txId = create.data.tx_id;
      for (let index = 0; index < ops.length; index += 1) {
        const op = ops[index];
        const body = op.value == null ? "" : JSON.stringify(op.value);
        await request(`/v1/tx/${encodeURIComponent(txId)}/ops/${index + 1}`, {
          method: "POST",
          headers: headers({
            "X-KV-Op": op.op,
            "X-KV-Key": scopedKey(op.key),
            "X-KV-Op-Id": op.id || `${op.op.toLowerCase()}-${index + 1}`,
            ...(op.value == null ? {} : { "Content-Type": "application/json" })
          }),
          body: op.value == null ? undefined : body
        });
      }
      const commit = await request(`/v1/tx/${encodeURIComponent(txId)}/commit`, {
        method: "POST",
        headers: headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ total_ops: totalOps })
      });
      return commit.data;
    }
  };
}

function isMissingKey(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.status === 404 || error?.code === "KEY_NOT_FOUND" || message.includes("key not found");
}

async function getOrEmpty(client, key, fallback) {
  try {
    const value = await client.get(key);
    return value ?? fallback;
  } catch (error) {
    if (isMissingKey(error)) return fallback;
    throw error;
  }
}

async function initializeDataSpace(client) {
  const now = nowIso();
  const [meta, domains, users] = await Promise.all([client.head("meta"), client.head("domains"), client.head("users")]);
  const ops = [];
  if (!meta.exists) {
    ops.push({
      op: "PUT",
      key: "meta",
      id: "init-meta",
      value: {
        namespace: FIXED_USERSPACE,
        schema_version: 1,
        initialized_at: now,
        updated_at: now
      }
    });
  }
  if (!domains.exists) {
    ops.push({
      op: "PUT",
      key: "domains",
      id: "init-domains",
      value: { items: [], updated_at: now, version: 1 }
    });
  }
  if (!users.exists) {
    ops.push({
      op: "PUT",
      key: "users",
      id: "init-users",
      value: { items: [], updated_at: now, version: 1 }
    });
  }
  await client.transaction(ops);
  return {
    created: ops.map(op => scopedKey(op.key)),
    checks: {
      meta: meta.exists || ops.some(op => op.key === "meta"),
      domains: domains.exists || ops.some(op => op.key === "domains"),
      users: users.exists || ops.some(op => op.key === "users")
    }
  };
}

async function listKey(client, key) {
  const value = await getOrEmpty(client, key, { items: [], version: 0 });
  return {
    items: Array.isArray(value.items) ? value.items : [],
    version: Number(value.version || 0),
    updated_at: value.updated_at || null
  };
}

async function saveList(client, key, items, version) {
  await client.put(key, {
    items: Array.from(new Set(items)).filter(Boolean).sort(),
    updated_at: nowIso(),
    version: Number(version || 0) + 1
  });
}

function emptyDomain() {
  return {
    host: "",
    enabled: true,
    ttl_seconds: 900,
    origin_scheme: "https",
    origin_ip: "",
    origin_host_header: "",
    zta_token_env: "ORIGIN_ZTA_TOKEN"
  };
}

function defaultDomain(host, input = {}) {
  const originId = input.origin_id || `origin_${host.replace(/[^a-z0-9]/g, "_")}`;
  return {
    host,
    enabled: input.enabled !== false,
    auth_providers: [{ id: "dreamreflex_oauth", type: "oauth", primary: true }],
    login_path: "/_gateway/login",
    callback_path: "/cgi-oauth/callback",
    logout_path: "/_gateway/logout",
    origin_id: originId,
    policy_id: input.policy_id || "default",
    jwt: {
      issuer: "DreamReflex ZeroTrust",
      audience: host,
      ttl_seconds: Number(input.ttl_seconds || 900),
      signing_key_id: "env"
    },
    config_version: Date.now()
  };
}

function defaultOrigin(input = {}) {
  const originId = String(input.origin_id || "").trim();
  return {
    origin_id: originId,
    origin_scheme: input.origin_scheme === "http" ? "http" : "https",
    origin_ip: String(input.origin_ip || "").trim(),
    origin_host_header: String(input.origin_host_header || "").trim().toLowerCase(),
    zta_token_env: String(input.zta_token_env || "ORIGIN_ZTA_TOKEN").trim(),
    timeout_ms: Number(input.timeout_ms || 30000),
    tls_verify: input.tls_verify !== false,
    origin_version: Date.now()
  };
}

async function loadDomainDetail(client, host) {
  const domain = await getOrEmpty(client, `domain:${host}`, null);
  const access = await getOrEmpty(client, `access:domain:${host}`, null);
  const origin = domain?.origin_id ? await getOrEmpty(client, `origin:${domain.origin_id}`, null) : null;
  return { domain, access, origin };
}

async function loadUserDetail(client, email) {
  return {
    user: await getOrEmpty(client, `user:${email}`, null),
    access: await getOrEmpty(client, `access:user:${email}`, null)
  };
}

async function loadAll(client) {
  const initialization = await initializeDataSpace(client);
  const [meta, domains, users, kvdb] = await Promise.all([
    getOrEmpty(client, "meta", null),
    listKey(client, "domains"),
    listKey(client, "users"),
    client.probe()
  ]);
  const [domainRecords, userRecords] = await Promise.all([
    Promise.all(domains.items.map(host => loadDomainDetail(client, host))),
    Promise.all(users.items.map(email => loadUserDetail(client, email)))
  ]);
  return { domains: domainRecords, users: userRecords, status: { kvdb, initialization, meta } };
}

async function upsertDomain(client, input) {
  const host = normalizeHost(input.host);
  if (!host) throw new Error("BAD_HOST");
  const domain = defaultDomain(host, input);
  const origin = defaultOrigin({
    origin_id: domain.origin_id,
    origin_scheme: input.origin_scheme,
    origin_ip: input.origin_ip,
    origin_host_header: input.origin_host_header,
    zta_token_env: input.zta_token_env,
    timeout_ms: input.timeout_ms,
    tls_verify: input.tls_verify
  });
  if (!origin.origin_ip || !origin.origin_host_header) throw new Error("BAD_ORIGIN");
  const domains = await listKey(client, "domains");
  const access = await getOrEmpty(client, `access:domain:${host}`, null);
  const ops = [
    { op: "PUT", key: `domain:${host}`, value: domain, id: `put-domain-${host}` },
    { op: "PUT", key: `origin:${origin.origin_id}`, value: origin, id: `put-origin-${origin.origin_id}` },
    {
      op: "PUT",
      key: "domains",
      id: "put-domains-index",
      value: {
        items: Array.from(new Set([...domains.items, host])).sort(),
        updated_at: nowIso(),
        version: Number(domains.version || 0) + 1
      }
    }
  ];
  if (!access) {
    ops.push({
      op: "PUT",
      key: `access:domain:${host}`,
      id: `put-access-domain-${host}`,
      value: {
      host,
      allowed_emails: [],
      allowed_email_domains: [],
      updated_at: nowIso(),
      version: 1
      }
    });
  }
  await client.transaction(ops);
}

async function deleteDomain(client, host) {
  host = normalizeHost(host);
  if (!host) throw new Error("BAD_HOST");
  const detail = await loadDomainDetail(client, host);
  const domains = await listKey(client, "domains");
  const users = await listKey(client, "users");
  const ops = [
    { op: "DELETE", key: `domain:${host}`, id: `delete-domain-${host}` },
    { op: "DELETE", key: `access:domain:${host}`, id: `delete-access-domain-${host}` },
    {
      op: "PUT",
      key: "domains",
      id: "put-domains-index",
      value: { items: domains.items.filter(item => item !== host), updated_at: nowIso(), version: Number(domains.version || 0) + 1 }
    }
  ];
  if (detail.domain?.origin_id) ops.push({ op: "DELETE", key: `origin:${detail.domain.origin_id}`, id: `delete-origin-${detail.domain.origin_id}` });
  for (const email of users.items) {
    const access = await getOrEmpty(client, `access:user:${email}`, null);
    if (!access?.domains?.includes(host)) continue;
    ops.push({
      op: "PUT",
      key: `access:user:${email}`,
      id: `put-access-user-${email}`,
      value: { email, domains: access.domains.filter(item => item !== host).sort(), updated_at: nowIso(), version: Number(access.version || 0) + 1 }
    });
  }
  await client.transaction(ops);
}

async function upsertUser(client, input) {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("BAD_EMAIL");
  const existing = await getOrEmpty(client, `user:${email}`, null);
  const user = {
    email,
    display_name: String(input.display_name || "").trim(),
    enabled: input.enabled !== false,
    created_at: existing?.created_at || nowIso(),
    updated_at: nowIso(),
    metadata: typeof input.metadata === "object" && input.metadata ? input.metadata : {}
  };
  const users = await listKey(client, "users");
  const access = await getOrEmpty(client, `access:user:${email}`, null);
  const ops = [
    { op: "PUT", key: `user:${email}`, value: user, id: `put-user-${email}` },
    { op: "PUT", key: "users", value: { items: Array.from(new Set([...users.items, email])).sort(), updated_at: nowIso(), version: Number(users.version || 0) + 1 }, id: "put-users-index" }
  ];
  if (!access) {
    ops.push({ op: "PUT", key: `access:user:${email}`, value: { email, domains: [], updated_at: nowIso(), version: 1 }, id: `put-access-user-${email}` });
  }
  await client.transaction(ops);
}

async function deleteUser(client, email) {
  email = normalizeEmail(email);
  if (!email) throw new Error("BAD_EMAIL");
  const access = await getOrEmpty(client, `access:user:${email}`, null);
  const ops = [];
  for (const host of access?.domains || []) {
    const domainAccess = await getOrEmpty(client, `access:domain:${host}`, null);
    if (!domainAccess) continue;
    ops.push({
      op: "PUT",
      key: `access:domain:${host}`,
      id: `put-access-domain-${host}`,
      value: {
        host,
        allowed_emails: (domainAccess.allowed_emails || []).map(normalizeEmail).filter(item => item && item !== email).sort(),
        allowed_email_domains: domainAccess.allowed_email_domains || [],
        updated_at: nowIso(),
        version: Number(domainAccess.version || 0) + 1
      }
    });
  }
  const users = await listKey(client, "users");
  ops.push({ op: "DELETE", key: `user:${email}`, id: `delete-user-${email}` });
  ops.push({ op: "DELETE", key: `access:user:${email}`, id: `delete-access-user-${email}` });
  ops.push({ op: "PUT", key: "users", id: "put-users-index", value: { items: users.items.filter(item => item !== email), updated_at: nowIso(), version: Number(users.version || 0) + 1 } });
  await client.transaction(ops);
}

async function updateAccess(client, email, host, allow) {
  email = normalizeEmail(email);
  host = normalizeHost(host);
  if (!email || !host) throw new Error("BAD_ACCESS_INPUT");
  const [userAccess, domainAccess] = await Promise.all([
    getOrEmpty(client, `access:user:${email}`, { email, domains: [], version: 0 }),
    getOrEmpty(client, `access:domain:${host}`, { host, allowed_emails: [], allowed_email_domains: [], version: 0 })
  ]);
  const domains = new Set(userAccess.domains || []);
  const emails = new Set((domainAccess.allowed_emails || []).map(normalizeEmail));
  if (allow) {
    domains.add(host);
    emails.add(email);
  } else {
    domains.delete(host);
    emails.delete(email);
  }
  await client.transaction([
    { op: "PUT", key: `access:user:${email}`, id: `put-access-user-${email}`, value: { email, domains: [...domains].sort(), updated_at: nowIso(), version: Number(userAccess.version || 0) + 1 } },
    {
      op: "PUT",
      key: `access:domain:${host}`,
      id: `put-access-domain-${host}`,
      value: {
        host,
        allowed_emails: [...emails].sort(),
        allowed_email_domains: domainAccess.allowed_email_domains || [],
        updated_at: nowIso(),
        version: Number(domainAccess.version || 0) + 1
      }
    }
  ]);
}

async function domainStatus(client, host) {
  host = normalizeHost(host);
  if (!host) throw new Error("BAD_HOST");
  const detail = await loadDomainDetail(client, host);
  const head = detail.domain ? await client.head(`domain:${host}`) : { exists: false };
  const checks = [
    { name: "domain_config", ok: Boolean(detail.domain), message: detail.domain ? "domain config exists" : "missing domain config" },
    { name: "domain_enabled", ok: detail.domain?.enabled !== false, message: detail.domain?.enabled === false ? "domain disabled" : "domain enabled" },
    { name: "access_index", ok: Boolean(detail.access), message: detail.access ? "domain access index exists" : "missing access:domain key" },
    { name: "origin_config", ok: Boolean(detail.origin), message: detail.origin ? "origin config exists" : "missing origin config" },
    { name: "kv_domain_head", ok: head.exists, message: head.exists ? `version ${head.version || "-"}` : "domain key missing" }
  ];
  return { host, ok: checks.every(check => check.ok), checks, detail };
}

function App() {
  const [config, setConfig] = useState(loadConfig());
  if (!config?.baseUrl || !config?.apiKey) return <ConfigScreen onSave={value => { saveConfig(value); setConfig(value); }} />;
  return <Shell config={config} onReset={() => { clearConfig(); setConfig(null); }} />;
}

function ConfigScreen({ onSave }) {
  const [baseUrl, setBaseUrl] = useState(import.meta.env.VITE_DEFAULT_KVDB_BASE_URL || "");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    const next = { baseUrl: normalizeBaseUrl(baseUrl), apiKey: apiKey.trim() };
    if (!next.baseUrl || !next.apiKey) return setError("数据源地址和访问密钥都必须填写");
    try {
      const client = makeClient(next);
      await client.probe();
      await initializeDataSpace(client);
      onSave(next);
    } catch (err) {
      setError(`登录检查失败: ${err.message}`);
    }
  }
  return (
    <main className="config-page">
      <section className="config-panel">
        <div className="brand-mark"><img src={LOGO_URL} alt="DreamReflex" /></div>
        <h1>云梦镜像零信任网关</h1>
        <form onSubmit={submit} className="form-stack">
          <label>数据源地址<input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://gateway-admin.example.com" /></label>
          <label>访问密钥<input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="请输入访问密钥" /></label>
          {error ? <div className="error-line">{error}</div> : null}
          <button className="primary">登录</button>
        </form>
      </section>
    </main>
  );
}

function Shell({ config, onReset }) {
  const client = useMemo(() => makeClient(config), [config]);
  const tabs = [
    { id: "dashboard", label: "概览", icon: Activity },
    { id: "domains", label: "域名库", icon: Globe2 },
    { id: "users", label: "用户库", icon: UsersRound },
    { id: "permissions", label: "许可矩阵", icon: Link2 },
    { id: "kvdb", label: "KVDB 查询", icon: Search },
    { id: "status", label: "状态检查", icon: Database }
  ];
  const [tab, setTab] = useState("dashboard");
  const [state, setState] = useState({ domains: [], users: [], status: null, loading: true, error: "" });

  async function refresh() {
    setState(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const loaded = await loadAll(client);
      setState({ ...loaded, loading: false, error: "" });
    } catch (err) {
      setState(prev => ({ ...prev, loading: false, error: err.message }));
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
          {tabs.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><Icon size={18} />{item.label}</button>;
          })}
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">Client-side HTTPKVDB Console</div>
            <h1>{tabs.find(item => item.id === tab)?.label}</h1>
          </div>
          <div className="top-actions">
            <button className="ghost" onClick={refresh}><RefreshCw size={16} />刷新</button>
            <span className="user-pill"><Database size={16} />{client.baseUrl}</span>
            <button className="ghost danger" onClick={onReset}><LogOut size={16} />清除凭据</button>
          </div>
        </header>
        {state.error ? <div className="banner error"><CircleAlert size={16} />{state.error}</div> : null}
        {tab === "dashboard" && <Dashboard state={state} setTab={setTab} />}
        {tab === "domains" && <DomainsView client={client} state={state} refresh={refresh} />}
        {tab === "users" && <UsersView client={client} state={state} refresh={refresh} />}
        {tab === "permissions" && <PermissionsView client={client} state={state} refresh={refresh} />}
        {tab === "kvdb" && <KvdbReadView client={client} state={state} />}
        {tab === "status" && <StatusView client={client} state={state} refresh={refresh} />}
      </section>
    </div>
  );
}

function Dashboard({ state, setTab }) {
  const enabledDomains = state.domains.filter(item => item.domain?.enabled !== false).length;
  const enabledUsers = state.users.filter(item => item.user?.enabled !== false).length;
  const permissionCount = state.domains.reduce((sum, item) => sum + (item.access?.allowed_emails?.length || 0), 0);
  return (
    <div className="content-grid">
      <section className="panel wide app-summary">
        <div>
          <div className="eyebrow">固定 KVDB Userspace</div>
          <h2>{FIXED_USERSPACE}</h2>
          <p>控制面和边缘函数固定读取 `ztadata:*` 这一组数据，不再允许前端切换应用空间。</p>
        </div>
        <button className="ghost" onClick={() => setTab("status")}><ShieldCheck size={16} />状态检查</button>
      </section>
      <Metric icon={Globe2} label="域名" value={state.domains.length} sub={`${enabledDomains} 个启用`} />
      <Metric icon={UsersRound} label="用户" value={state.users.length} sub={`${enabledUsers} 个启用`} />
      <Metric icon={Link2} label="邮箱许可" value={permissionCount} sub="domain email grants" />
      <Metric icon={Database} label="KVDB" value={state.status?.kvdb?.ready?.ok ? "Ready" : "Unknown"} sub={state.status?.kvdb?.base_url || "未连接"} />
      <section className="panel wide">
        <PanelHeader title="快速操作" />
        <div className="quick-actions">
          <button onClick={() => setTab("domains")}><Globe2 size={18} />配置域名库</button>
          <button onClick={() => setTab("users")}><UsersRound size={18} />配置用户库</button>
          <button onClick={() => setTab("permissions")}><Link2 size={18} />配置用户域名许可</button>
          <button onClick={() => setTab("kvdb")}><Search size={18} />只读查询 KVDB</button>
          <button onClick={() => setTab("status")}><Activity size={18} />运行状态检查</button>
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub }) {
  return <section className="metric"><Icon size={20} /><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></section>;
}

function DomainsView({ client, state, refresh }) {
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

function UsersView({ client, state, refresh }) {
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
      setError(err.message);
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
      {error ? <div className="error-line">{error}</div> : null}
      <div className="drawer-actions">
        <button className="primary" onClick={save}><Save size={16} />保存</button>
        {initial.email ? <button className="ghost danger" onClick={remove}><Trash2 size={16} />删除</button> : null}
      </div>
    </Drawer>
  );
}

function PermissionsView({ client, state, refresh }) {
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

function normalizeQueryKey(key) {
  const value = String(key || "").trim();
  return value.startsWith(`${FIXED_USERSPACE}:`) ? value.slice(FIXED_USERSPACE.length + 1) : value;
}

function kvdbSuggestions(state) {
  const keys = ["meta", "domains", "users"];
  for (const item of state.domains) {
    const host = item.domain?.host;
    if (!host) continue;
    keys.push(`domain:${host}`, `access:domain:${host}`);
    if (item.domain?.origin_id) keys.push(`origin:${item.domain.origin_id}`);
  }
  for (const item of state.users) {
    const email = item.user?.email;
    if (!email) continue;
    keys.push(`user:${email}`, `access:user:${email}`);
  }
  return Array.from(new Set(keys)).sort();
}

function KvdbReadView({ client, state }) {
  const suggestions = useMemo(() => kvdbSuggestions(state), [state]);
  const [key, setKey] = useState("domains");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function query(event) {
    event?.preventDefault();
    const logicalKey = normalizeQueryKey(key);
    if (!logicalKey) return setError("请输入要查询的 KVDB key");
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const [head, value] = await Promise.all([client.head(logicalKey), client.get(logicalKey)]);
      setResult({
        key: logicalKey,
        effective_key: scopedKey(logicalKey),
        metadata: head,
        value,
        raw: typeof value === "string" ? value : JSON.stringify(value, null, 2)
      });
    } catch (err) {
      if (isMissingKey(err)) {
        setError(`key 不存在: ${scopedKey(logicalKey)}`);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function choose(nextKey) {
    setKey(nextKey);
    setError("");
    setResult(null);
  }

  return (
    <div className="content-grid">
      <section className="panel kvdb-query-panel">
        <PanelHeader title="KVDB 原始内容查询" />
        <p className="panel-copy">只读视图。这里仅调用 HTTPKVDB GET/HEAD 展示原始 key 内容，不提供保存、删除或事务操作。</p>
        <form className="kvdb-query-form" onSubmit={query}>
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="domains 或 ztadata:domains" />
          <button className="primary" disabled={busy}><Search size={16} />{busy ? "查询中" : "查询"}</button>
        </form>
        <div className="kvdb-key-list">
          {suggestions.map(item => <button key={item} className={item === normalizeQueryKey(key) ? "active" : ""} onClick={() => choose(item)}>{scopedKey(item)}</button>)}
        </div>
      </section>
      <section className="panel kvdb-result-panel">
        <PanelHeader title="查询结果" />
        {error ? <div className="banner error"><CircleAlert size={16} />{error}</div> : null}
        {result ? (
          <>
            <div className="kvdb-meta">
              <div><span>Key</span><strong>{result.effective_key}</strong></div>
              <div><span>Version</span><strong>{result.metadata.version || "-"}</strong></div>
              <div><span>Size</span><strong>{result.metadata.size || "-"}</strong></div>
              <div><span>Checksum</span><strong>{result.metadata.checksum || "-"}</strong></div>
            </div>
            <pre className="json-block kvdb-json-block">{result.raw}</pre>
          </>
        ) : (
          <div className="empty-state">选择或输入一个 key 后查询，结果会以只读原始内容展示。</div>
        )}
      </section>
    </div>
  );
}

function StatusView({ client, state, refresh }) {
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
        <CheckLine label="ztadata:meta" ok={state.status?.initialization?.checks?.meta} message={state.status?.meta ? `schema v${state.status.meta.schema_version || 1}` : "auto-created if missing"} />
        <CheckLine label="ztadata:domains" ok={state.status?.initialization?.checks?.domains} message={`${state.domains.length} domains`} />
        <CheckLine label="ztadata:users" ok={state.status?.initialization?.checks?.users} message={`${state.users.length} users`} />
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

function CheckLine({ label, ok, message }) {
  return <div className="check-line">{ok ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}<strong>{label}</strong><span>{message}</span></div>;
}
function PanelHeader({ title, action }) { return <div className="panel-header"><h2>{title}</h2>{action}</div>; }
function Toolbar({ query, setQuery, placeholder }) { return <div className="toolbar"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder} /></div>; }
function StatusBadge({ ok, text }) { return <span className={ok ? "badge ok" : "badge off"}>{text}</span>; }
function Field({ label, value, setValue, type = "text" }) { return <label>{label}<input type={type} value={value} onChange={e => setValue(e.target.value)} /></label>; }
function Drawer({ title, children, onClose }) {
  return <div className="drawer-backdrop"><aside className="drawer"><header><h2>{title}</h2><button className="icon" onClick={onClose}><X size={18} /></button></header>{children}</aside></div>;
}

createRoot(document.getElementById("root")).render(<App />);
