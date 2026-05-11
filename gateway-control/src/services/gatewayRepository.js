import { APP_USERSPACE } from "../config/constants";
import { isMissingKey } from "./kvdbClient";
import { normalizeEmail, normalizeHost, nowIso } from "../utils/validators";

export async function getOrEmpty(client, key, fallback) {
  try {
    const value = await client.get(key);
    return value ?? fallback;
  } catch (error) {
    if (isMissingKey(error)) return fallback;
    throw error;
  }
}

export async function initializeDataSpace(client) {
  const now = nowIso();
  const [meta, domains, users] = await Promise.all([client.head("meta"), client.head("domains"), client.head("users")]);
  const ops = [];
  if (!meta.exists) {
    ops.push({
      op: "PUT",
      key: "meta",
      id: "init-meta",
      value: {
        app_name: APP_USERSPACE,
        userspace: APP_USERSPACE,
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
    created: ops.map(op => op.key),
    checks: {
      meta: meta.exists || ops.some(op => op.key === "meta"),
      domains: domains.exists || ops.some(op => op.key === "domains"),
      users: users.exists || ops.some(op => op.key === "users")
    }
  };
}

export async function listKey(client, key) {
  const value = await getOrEmpty(client, key, { items: [], version: 0 });
  return {
    items: Array.isArray(value.items) ? value.items : [],
    version: Number(value.version || 0),
    updated_at: value.updated_at || null
  };
}

export function emptyDomain() {
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

export function defaultDomain(host, input = {}) {
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

export function defaultOrigin(input = {}) {
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

export async function loadDomainDetail(client, host) {
  const domain = await getOrEmpty(client, `domain:${host}`, null);
  const access = await getOrEmpty(client, `access:domain:${host}`, null);
  const origin = domain?.origin_id ? await getOrEmpty(client, `origin:${domain.origin_id}`, null) : null;
  return { domain, access, origin };
}

export async function loadUserDetail(client, email) {
  return {
    user: await getOrEmpty(client, `user:${email}`, null),
    access: await getOrEmpty(client, `access:user:${email}`, null)
  };
}

export async function loadAll(client) {
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

export async function upsertDomain(client, input) {
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

export async function deleteDomain(client, host) {
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

export async function upsertUser(client, input) {
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

export async function deleteUser(client, email) {
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

export async function updateAccess(client, email, host, allow) {
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

export async function domainStatus(client, host) {
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

