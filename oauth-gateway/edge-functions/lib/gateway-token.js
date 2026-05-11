import { base64UrlDecode, base64UrlEncode, randomId } from "./crypto.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DEFAULT_ISSUER = "DreamReflex ZeroTrust";
const TOKEN_TYPE = "gateway_access";
const KEY_CACHE = new Map();

function jsonEncode(value) {
  return textEncoder.encode(JSON.stringify(value));
}

function jsonDecode(bytes) {
  return JSON.parse(textDecoder.decode(bytes));
}

function hexToBytes(value) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function decodeKeyMaterial(value) {
  const raw = String(value || "").trim();
  if (/^[a-f0-9]{64}$/i.test(raw)) return hexToBytes(raw);
  return base64UrlDecode(raw);
}

function readKeyConfig(env) {
  const rawKeys = String(env.GATEWAY_TOKEN_KEYS || "").trim();
  if (rawKeys) {
    const parsed = JSON.parse(rawKeys);
    const entries = Object.entries(parsed).filter(([, value]) => value);
    if (!entries.length) throw new Error("GATEWAY_TOKEN_KEYS is empty");
    const activeKid = String(env.GATEWAY_TOKEN_ACTIVE_KID || entries[0][0]).trim();
    return { raw: rawKeys, activeKid, entries };
  }
  const singleKey = String(env.GATEWAY_TOKEN_KEY || "").trim();
  if (!singleKey) throw new Error("Missing env GATEWAY_TOKEN_KEYS");
  const kid = String(env.GATEWAY_TOKEN_ACTIVE_KID || "v1").trim();
  return { raw: `${kid}:${singleKey}`, activeKid: kid, entries: [[kid, singleKey]] };
}

async function importAesKey(kid, material) {
  const bytes = decodeKeyMaterial(material);
  if (bytes.byteLength !== 32) throw new Error(`Gateway token key ${kid} must be 32 bytes`);
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function loadKeys(env) {
  const config = readKeyConfig(env);
  const cacheKey = `${config.activeKid}:${config.raw}`;
  const cached = KEY_CACHE.get(cacheKey);
  if (cached) return cached;
  const keys = new Map();
  for (const [kid, material] of config.entries) {
    keys.set(String(kid), await importAesKey(kid, material));
  }
  if (!keys.has(config.activeKid)) throw new Error("GATEWAY_TOKEN_ACTIVE_KID is not present in GATEWAY_TOKEN_KEYS");
  const loaded = { activeKid: config.activeKid, keys };
  KEY_CACHE.set(cacheKey, loaded);
  return loaded;
}

function originSnapshot(origin) {
  return {
    origin_id: origin.origin_id || "",
    origin_scheme: origin.origin_scheme || "https",
    origin_ip: origin.origin_ip,
    origin_host_header: origin.origin_host_header,
    zta_token_env: origin.zta_token_env || "ORIGIN_ZTA_TOKEN",
    timeout_ms: Number(origin.timeout_ms || 30000),
    tls_verify: origin.tls_verify !== false,
    origin_version: Number(origin.origin_version || 0)
  };
}

export async function createGatewayToken(env, { email, domain, origin, access }, now = Math.floor(Date.now() / 1000)) {
  const jwtConfig = domain.jwt || {};
  const ttl = Math.min(Number(jwtConfig.ttl_seconds || 900), 86400);
  const host = jwtConfig.audience || domain.host;
  const payload = {
    typ: TOKEN_TYPE,
    iss: jwtConfig.issuer || DEFAULT_ISSUER,
    sub: email,
    email,
    aud: host,
    iat: now,
    nbf: now - 5,
    exp: now + ttl,
    jti: randomId(16),
    auth_method: "oauth",
    grant: {
      host,
      allowed: true,
      access_version: Number(access?.version || 0),
      config_version: Number(domain.config_version || 0)
    },
    origin: originSnapshot(origin)
  };
  return encryptGatewayToken(env, payload);
}

export async function encryptGatewayToken(env, payload) {
  const loaded = await loadKeys(env);
  const header = { typ: TOKEN_TYPE, alg: "dir", enc: "A256GCM", kid: loaded.activeKid };
  const headerSegment = base64UrlEncode(jsonEncode(header));
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: textEncoder.encode(headerSegment), tagLength: 128 },
    loaded.keys.get(loaded.activeKid),
    jsonEncode(payload)
  );
  return `${headerSegment}.${base64UrlEncode(iv)}.${base64UrlEncode(ciphertext)}`;
}

export async function verifyGatewayToken(env, token, expectedHost, now = Math.floor(Date.now() / 1000)) {
  if (!token || typeof token !== "string") return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "format" };
  const [headerSegment, ivSegment, ciphertextSegment] = parts;
  let header;
  try {
    header = jsonDecode(base64UrlDecode(headerSegment));
  } catch {
    return { ok: false, reason: "header" };
  }
  if (header.typ !== TOKEN_TYPE || header.alg !== "dir" || header.enc !== "A256GCM" || !header.kid) {
    return { ok: false, reason: "header" };
  }
  const loaded = await loadKeys(env);
  const key = loaded.keys.get(String(header.kid));
  if (!key) return { ok: false, reason: "kid" };
  let payload;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlDecode(ivSegment), additionalData: textEncoder.encode(headerSegment), tagLength: 128 },
      key,
      base64UrlDecode(ciphertextSegment)
    );
    payload = jsonDecode(new Uint8Array(plaintext));
  } catch {
    return { ok: false, reason: "decrypt" };
  }
  if (payload.typ !== TOKEN_TYPE) return { ok: false, reason: "type" };
  if (!payload.iss || typeof payload.iss !== "string") return { ok: false, reason: "issuer" };
  if (!payload.sub || String(payload.sub).indexOf("@") < 0) return { ok: false, reason: "subject" };
  if (typeof payload.exp !== "number" || payload.exp <= now) return { ok: false, reason: "expired" };
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return { ok: false, reason: "not_before" };
  if (String(payload.aud || "").toLowerCase() !== expectedHost) return { ok: false, reason: "audience" };
  if (payload.grant?.allowed !== true || String(payload.grant?.host || "").toLowerCase() !== expectedHost) {
    return { ok: false, reason: "grant" };
  }
  if (!payload.origin?.origin_ip || !payload.origin?.origin_host_header) return { ok: false, reason: "origin" };
  return { ok: true, payload };
}
