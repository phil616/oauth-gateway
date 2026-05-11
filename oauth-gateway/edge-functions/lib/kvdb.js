const cache = new Map();
const APP_USERSPACE = "ztafirewall";

function kvPath(key) {
  return `/api/v1/${APP_USERSPACE}/${encodeURIComponent(key)}`;
}

export function requireEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export async function kvGet(env, key, ttlSeconds = 60) {
  const baseUrl = requireEnv(env, "KVDB_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv(env, "KVDB_API_KEY");
  const cacheKey = `${baseUrl}:${APP_USERSPACE}:${key}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;
  const response = await fetch(`${baseUrl}${kvPath(key)}`, {
    headers: {
      APIKey: apiKey,
      accept: "application/json"
    }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`KVDB GET ${key} failed: ${response.status}`);
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
