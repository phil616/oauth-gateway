const cache = new Map();
export const APP_USERSPACE = "ztafirewall";

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function encodeKey(key) {
  return encodeURIComponent(String(key));
}

function kvUrl(baseUrl, key) {
  return `${baseUrl}/api/v1/${APP_USERSPACE}/${encodeKey(key)}`;
}

function authHeaders(apiKey, extra = {}) {
  return {
    APIKey: apiKey,
    ...extra
  };
}

export function requireEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

async function parseKvdbError(response, key) {
  let data = null;
  const text = await response.text().catch(() => "");
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const code = data?.error || `HTTP_${response.status}`;
  const detail = data?.message || response.statusText || "request failed";
  const requestId = data?.request_id ? ` request_id=${data.request_id}` : "";
  if (response.status === 403) {
    return new Error(`KVDB GET ${key} failed: FORBIDDEN userspace=${APP_USERSPACE}; verify KVDB_API_KEY principal matches this userspace.${requestId}`);
  }
  return new Error(`KVDB GET ${key} failed: ${response.status} ${code}: ${detail}${requestId}`);
}

export async function kvGet(env, key, ttlSeconds = 60) {
  const baseUrl = normalizeBaseUrl(requireEnv(env, "KVDB_BASE_URL"));
  const apiKey = requireEnv(env, "KVDB_API_KEY");
  const cacheKey = `${baseUrl}:${APP_USERSPACE}:${key}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const response = await fetch(kvUrl(baseUrl, key), {
    headers: authHeaders(apiKey, { Accept: "application/json" })
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await parseKvdbError(response, key);
  const value = await response.json();
  cache.set(cacheKey, { value, expiresAt: now + ttlSeconds * 1000 });
  return value;
}

function validObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeDomainConfig(host, domain) {
  if (!validObject(domain)) return null;
  if (domain.host && String(domain.host).toLowerCase() !== host) return null;
  if (domain.enabled === false) return null;
  if (!domain.origin_id) return null;
  return {
    ...domain,
    host,
    config_version: Number(domain.config_version || 0)
  };
}

function normalizeAccessConfig(host, access) {
  if (!validObject(access)) {
    return { host, allowed_emails: [], allowed_email_domains: [], version: 0 };
  }
  return {
    host,
    allowed_emails: Array.isArray(access.allowed_emails) ? access.allowed_emails : [],
    allowed_email_domains: Array.isArray(access.allowed_email_domains) ? access.allowed_email_domains : [],
    version: Number(access.version || 0)
  };
}

function normalizeOriginConfig(origin) {
  if (!validObject(origin)) return null;
  if (!origin.origin_ip || !origin.origin_host_header) return null;
  return origin;
}

export async function loadDomainBundle(env, host) {
  const domain = normalizeDomainConfig(host, await kvGet(env, `domain:${host}`, Number(env.DOMAIN_CACHE_TTL_SECONDS || 60)));
  if (!domain) return null;
  const [originRaw, accessRaw] = await Promise.all([
    kvGet(env, `origin:${domain.origin_id}`, Number(env.ORIGIN_CACHE_TTL_SECONDS || 60)),
    kvGet(env, `access:domain:${host}`, Number(env.ACCESS_CACHE_TTL_SECONDS || 30))
  ]);
  const origin = normalizeOriginConfig(originRaw);
  const access = normalizeAccessConfig(host, accessRaw);
  return { domain, origin, access };
}
