import { APP_USERSPACE } from "../config/constants";
import { isMissingKey } from "./kvdbClient";
import { normalizeError } from "./errorCatalog";
import { normalizeEmail, normalizeEmailDomain, normalizeHost, nowIso } from "../utils/validators";

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
    items: uniqueSorted(Array.isArray(value.items) ? value.items : []),
    version: Number(value.version || 0),
    updated_at: value.updated_at || null
  };
}

function uniqueSorted(items) {
  return Array.from(new Set(items.map(item => String(item || "").trim()).filter(Boolean))).sort();
}

function normalizeEmailList(items) {
  return uniqueSorted((items || []).map(normalizeEmail).filter(Boolean));
}

function normalizeEmailDomainList(items) {
  return uniqueSorted((items || []).map(normalizeEmailDomain).filter(Boolean));
}

function normalizeHostList(items) {
  return uniqueSorted((items || []).map(normalizeHost).filter(Boolean));
}

function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function isEmailGrantedByDomainAccess(email, access) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !access) return false;
  const allowedEmails = normalizeEmailList(access.allowed_emails || []);
  if (allowedEmails.includes(normalizedEmail)) return true;
  const emailDomain = normalizedEmail.split("@")[1] || "";
  return Boolean(emailDomain && normalizeEmailDomainList(access.allowed_email_domains || []).includes(emailDomain));
}

async function loadDomainAccessMap(client, hosts) {
  const entries = await Promise.all(hosts.map(async host => [host, await getOrEmpty(client, `access:domain:${host}`, null)]));
  return new Map(entries);
}

async function effectiveDomainsForEmail(client, email, hosts) {
  const domainAccessMap = await loadDomainAccessMap(client, hosts);
  return hosts.filter(host => isEmailGrantedByDomainAccess(email, domainAccessMap.get(host))).sort();
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
  return { domain, access: normalizeDomainAccess(host, access), origin };
}

export async function loadUserDetail(client, email) {
  return {
    user: await getOrEmpty(client, `user:${email}`, null),
    access: normalizeUserAccess(email, await getOrEmpty(client, `access:user:${email}`, null))
  };
}

function normalizeDomainAccess(host, access) {
  if (!access) return null;
  return {
    host,
    allowed_emails: normalizeEmailList(access.allowed_emails || []),
    allowed_email_domains: normalizeEmailDomainList(access.allowed_email_domains || []),
    updated_at: access.updated_at || null,
    version: Number(access.version || 0)
  };
}

function normalizeUserAccess(email, access) {
  if (!access) return null;
  return {
    email,
    domains: normalizeHostList(access.domains || []),
    updated_at: access.updated_at || null,
    version: Number(access.version || 0)
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
  return {
    domains: domainRecords.filter(item => item.domain),
    users: userRecords.filter(item => item.user),
    status: { kvdb, initialization, meta, integrity: buildIntegrityReport(domainRecords, userRecords) }
  };
}

function buildIntegrityReport(domainRecords, userRecords) {
  const issues = [];
  const domainAccessByHost = new Map();
  for (const item of domainRecords) {
    const host = item.domain?.host;
    if (!item.domain) issues.push(integrityIssue("error", "domains", "DOMAIN_INDEX_CONFIG_MISSING"));
    if (item.domain && !item.access) issues.push(integrityIssue("error", `access:domain:${host}`, "DOMAIN_ACCESS_POLICY_MISSING"));
    if (item.domain && !item.origin) issues.push(integrityIssue("error", `origin:${item.domain.origin_id || ""}`, "DOMAIN_ORIGIN_MISSING"));
    if (item.domain && item.access) domainAccessByHost.set(host, item.access);
  }
  const hosts = Array.from(domainAccessByHost.keys()).sort();
  for (const item of userRecords) {
    const email = item.user?.email;
    if (!item.user) issues.push(integrityIssue("error", "users", "USER_INDEX_CONFIG_MISSING"));
    if (item.user && !item.access) issues.push(integrityIssue("warning", `access:user:${email}`, "USER_ACCESS_INDEX_MISSING"));
    if (item.user && item.access) {
      const expected = hosts.filter(host => isEmailGrantedByDomainAccess(email, domainAccessByHost.get(host))).sort();
      if (!arraysEqual(item.access.domains || [], expected)) {
        issues.push(integrityIssue("warning", `access:user:${email}`, "USER_ACCESS_INDEX_MISMATCH"));
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

function integrityIssue(level, key, name) {
  const error = normalizeError(name);
  return { level, key, error_name: error.name, error_code: error.code, title: error.title };
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
        items: uniqueSorted([...domains.items, host]),
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
  const allDomainDetails = await Promise.all(domains.items.filter(item => item !== host).map(item => loadDomainDetail(client, item)));
  const ops = [
    {
      op: "PUT",
      key: "domains",
      id: "put-domains-index",
      value: { items: domains.items.filter(item => item !== host), updated_at: nowIso(), version: Number(domains.version || 0) + 1 }
    }
  ];
  if (detail.domain) ops.unshift({ op: "DELETE", key: `domain:${host}`, id: `delete-domain-${host}` });
  if (detail.access) ops.unshift({ op: "DELETE", key: `access:domain:${host}`, id: `delete-access-domain-${host}` });
  const originIsShared = detail.domain?.origin_id && allDomainDetails.some(item => item.domain?.origin_id === detail.domain.origin_id);
  if (detail.domain?.origin_id && detail.origin && !originIsShared) ops.push({ op: "DELETE", key: `origin:${detail.domain.origin_id}`, id: `delete-origin-${detail.domain.origin_id}` });
  for (const email of users.items) {
    const access = normalizeUserAccess(email, await getOrEmpty(client, `access:user:${email}`, null));
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
  const [users, domains] = await Promise.all([listKey(client, "users"), listKey(client, "domains")]);
  const access = normalizeUserAccess(email, await getOrEmpty(client, `access:user:${email}`, null));
  const effectiveDomains = await effectiveDomainsForEmail(client, email, domains.items);
  const usersChanged = !users.items.includes(email);
  const nextUserItems = uniqueSorted([...users.items, email]);
  const ops = [
    { op: "PUT", key: `user:${email}`, value: user, id: `put-user-${email}` },
    {
      op: "PUT",
      key: `access:user:${email}`,
      value: {
        email,
        domains: effectiveDomains,
        updated_at: nowIso(),
        version: Number(access?.version || 0) + 1
      },
      id: `put-access-user-${email}`
    }
  ];
  if (usersChanged) {
    ops.splice(1, 0, { op: "PUT", key: "users", value: { items: nextUserItems, updated_at: nowIso(), version: Number(users.version || 0) + 1 }, id: "put-users-index" });
  }
  await client.transaction(ops);
}

export async function deleteUser(client, email) {
  email = normalizeEmail(email);
  if (!email) throw new Error("BAD_EMAIL");
  const [access, domainsIndex] = await Promise.all([
    getOrEmpty(client, `access:user:${email}`, null),
    listKey(client, "domains")
  ]);
  const ops = [];
  const candidateHosts = uniqueSorted([...(access?.domains || []), ...domainsIndex.items]);
  for (const host of candidateHosts) {
    const domainAccess = normalizeDomainAccess(host, await getOrEmpty(client, `access:domain:${host}`, null));
    if (!domainAccess) continue;
    const nextAllowedEmails = normalizeEmailList(domainAccess.allowed_emails || []).filter(item => item !== email);
    if (nextAllowedEmails.length === domainAccess.allowed_emails.length) continue;
    ops.push({
      op: "PUT",
      key: `access:domain:${host}`,
      id: `put-access-domain-${host}`,
      value: {
        host,
        allowed_emails: nextAllowedEmails,
        allowed_email_domains: normalizeEmailDomainList(domainAccess.allowed_email_domains || []),
        updated_at: nowIso(),
        version: Number(domainAccess.version || 0) + 1
      }
    });
  }
  const users = await listKey(client, "users");
  const existingUser = await getOrEmpty(client, `user:${email}`, null);
  const existingUserAccess = await getOrEmpty(client, `access:user:${email}`, null);
  if (existingUser) ops.push({ op: "DELETE", key: `user:${email}`, id: `delete-user-${email}` });
  if (existingUserAccess) ops.push({ op: "DELETE", key: `access:user:${email}`, id: `delete-access-user-${email}` });
  ops.push({ op: "PUT", key: "users", id: "put-users-index", value: { items: users.items.filter(item => item !== email), updated_at: nowIso(), version: Number(users.version || 0) + 1 } });
  await client.transaction(ops);
}

export async function updateAccess(client, email, host, allow) {
  email = normalizeEmail(email);
  host = normalizeHost(host);
  if (!email || !host) throw new Error("BAD_ACCESS_INPUT");
  const [user, domain, userAccess, domainAccess] = await Promise.all([
    getOrEmpty(client, `user:${email}`, null),
    getOrEmpty(client, `domain:${host}`, null),
    getOrEmpty(client, `access:user:${email}`, { email, domains: [], version: 0 }),
    getOrEmpty(client, `access:domain:${host}`, { host, allowed_emails: [], allowed_email_domains: [], version: 0 })
  ]);
  if (!user) throw new Error("USER_NOT_FOUND");
  if (!domain) throw new Error("DOMAIN_NOT_FOUND");
  const domains = new Set(normalizeHostList(userAccess.domains || []));
  const emails = new Set(normalizeEmailList(domainAccess.allowed_emails || []));
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
        allowed_email_domains: normalizeEmailDomainList(domainAccess.allowed_email_domains || []),
        updated_at: nowIso(),
        version: Number(domainAccess.version || 0) + 1
      }
    }
  ]);
}

export async function saveDomainAccessPolicy(client, host, input) {
  host = normalizeHost(host);
  if (!host) throw new Error("BAD_HOST");
  const allowedEmails = normalizeEmailList(input.allowed_emails || []);
  const allowedEmailDomains = normalizeEmailDomainList(input.allowed_email_domains || []);
  const [domain, domainAccess, users] = await Promise.all([
    getOrEmpty(client, `domain:${host}`, null),
    getOrEmpty(client, `access:domain:${host}`, { host, allowed_emails: [], allowed_email_domains: [], version: 0 }),
    listKey(client, "users")
  ]);
  if (!domain) throw new Error("DOMAIN_NOT_FOUND");
  const ops = [
    {
      op: "PUT",
      key: `access:domain:${host}`,
      id: `put-access-domain-${host}`,
      value: {
        host,
        allowed_emails: allowedEmails,
        allowed_email_domains: allowedEmailDomains,
        updated_at: nowIso(),
        version: Number(domainAccess.version || 0) + 1
      }
    }
  ];

  for (const email of users.items) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) continue;
    const userAccess = await getOrEmpty(client, `access:user:${normalizedEmail}`, { email: normalizedEmail, domains: [], version: 0 });
    const currentDomains = new Set(normalizeHostList(userAccess.domains || []));
    const hadHost = currentDomains.has(host);
    const shouldHaveHost = isEmailGrantedByDomainAccess(normalizedEmail, {
      allowed_emails: allowedEmails,
      allowed_email_domains: allowedEmailDomains
    });
    if (shouldHaveHost) currentDomains.add(host);
    else currentDomains.delete(host);
    if (hadHost === shouldHaveHost) continue;
    ops.push({
      op: "PUT",
      key: `access:user:${normalizedEmail}`,
      id: `put-access-user-${normalizedEmail}`,
      value: {
        email: normalizedEmail,
        domains: [...currentDomains].sort(),
        updated_at: nowIso(),
        version: Number(userAccess.version || 0) + 1
      }
    });
  }

  await client.transaction(ops);
}

export async function repairDataConsistency(client) {
  const now = nowIso();
  const [domainsIndex, usersIndex] = await Promise.all([listKey(client, "domains"), listKey(client, "users")]);
  const [domainRecords, userRecords] = await Promise.all([
    Promise.all(domainsIndex.items.map(host => loadDomainDetail(client, host))),
    Promise.all(usersIndex.items.map(email => loadUserDetail(client, email)))
  ]);
  const validDomainRecords = domainRecords.filter(item => item.domain?.host).map(item => ({
    ...item,
    host: normalizeHost(item.domain.host)
  })).filter(item => item.host);
  const validUserRecords = userRecords.filter(item => item.user?.email).map(item => ({
    ...item,
    email: normalizeEmail(item.user.email)
  })).filter(item => item.email);
  const validHosts = uniqueSorted(validDomainRecords.map(item => item.host));
  const validEmails = uniqueSorted(validUserRecords.map(item => item.email));
  const ops = [];

  if (!arraysEqual(domainsIndex.items, validHosts)) {
    ops.push({ op: "PUT", key: "domains", id: "repair-domains-index", value: { items: validHosts, updated_at: now, version: Number(domainsIndex.version || 0) + 1 } });
  }
  if (!arraysEqual(usersIndex.items, validEmails)) {
    ops.push({ op: "PUT", key: "users", id: "repair-users-index", value: { items: validEmails, updated_at: now, version: Number(usersIndex.version || 0) + 1 } });
  }

  const accessByHost = new Map();
  for (const record of validDomainRecords) {
    const current = normalizeDomainAccess(record.host, record.access) || { host: record.host, allowed_emails: [], allowed_email_domains: [], version: 0 };
    accessByHost.set(record.host, current);
    const rawAllowedEmails = Array.isArray(record.access?.allowed_emails) ? record.access.allowed_emails : [];
    const rawAllowedDomains = Array.isArray(record.access?.allowed_email_domains) ? record.access.allowed_email_domains : [];
    const needsWrite = !record.access
      || record.access.host !== record.host
      || rawAllowedEmails.length !== current.allowed_emails.length
      || rawAllowedDomains.length !== current.allowed_email_domains.length;
    if (needsWrite) {
      ops.push({
        op: "PUT",
        key: `access:domain:${record.host}`,
        id: `repair-access-domain-${record.host}`,
        value: { ...current, updated_at: now, version: Number(current.version || 0) + 1 }
      });
    }
  }

  for (const record of validUserRecords) {
    const effectiveDomains = validHosts.filter(host => isEmailGrantedByDomainAccess(record.email, accessByHost.get(host)));
    const current = normalizeUserAccess(record.email, record.access) || { email: record.email, domains: [], version: 0 };
    if (!record.access || current.email !== record.email || !arraysEqual(current.domains, effectiveDomains)) {
      ops.push({
        op: "PUT",
        key: `access:user:${record.email}`,
        id: `repair-access-user-${record.email}`,
        value: { email: record.email, domains: effectiveDomains, updated_at: now, version: Number(current.version || 0) + 1 }
      });
    }
  }

  await client.transaction(ops);
  return { repaired: ops.length };
}

export async function domainStatus(client, host) {
  host = normalizeHost(host);
  if (!host) throw new Error("BAD_HOST");
  const detail = await loadDomainDetail(client, host);
  const head = detail.domain ? await client.head(`domain:${host}`) : { exists: false };
  const checks = [
    { name: "domain_config", ok: Boolean(detail.domain), message: detail.domain ? "域名配置已存在" : codedMessage("DOMAIN_NOT_FOUND") },
    { name: "domain_enabled", ok: detail.domain?.enabled !== false, message: detail.domain?.enabled === false ? "域名已禁用" : "域名已启用" },
    { name: "access_index", ok: Boolean(detail.access), message: detail.access ? "域名访问策略已存在" : codedMessage("DOMAIN_ACCESS_POLICY_MISSING") },
    { name: "origin_config", ok: Boolean(detail.origin), message: detail.origin ? "源站配置已存在" : codedMessage("DOMAIN_ORIGIN_MISSING") },
    { name: "kv_domain_head", ok: head.exists, message: head.exists ? `version ${head.version || "-"}` : codedMessage("DOMAIN_KEY_MISSING") }
  ];
  return { host, ok: checks.every(check => check.ok), checks, detail };
}

function codedMessage(name) {
  const error = normalizeError(name);
  return `${error.code} ${error.name}`;
}
