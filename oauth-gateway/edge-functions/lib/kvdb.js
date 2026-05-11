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

export async function loadDomainBundle(env, host) {
  const domain = await kvGet(env, `domain:${host}`, Number(env.DOMAIN_CACHE_TTL_SECONDS || 60));
  if (!domain || domain.enabled === false) return null;
  const [origin, access] = await Promise.all([
    kvGet(env, `origin:${domain.origin_id}`, Number(env.ORIGIN_CACHE_TTL_SECONDS || 60)),
    kvGet(env, `access:domain:${host}`, Number(env.ACCESS_CACHE_TTL_SECONDS || 30))
  ]);
  return { domain, origin, access };
}
