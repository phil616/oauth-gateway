import { isEmailAllowed, normalizeEmail } from "./access.js";
import { getCookie, setCookie } from "./cookies.js";
import { base64UrlDecode, base64UrlEncode, decodeJson, hmacSign, randomId, sha256Base64Url } from "./crypto.js";
import { errorResponse, redirect } from "./http.js";
import { getRequestHost } from "./hosts.js";
import { createGatewayToken } from "./gateway-token.js";
import { kvGet, loadDomainBundle, requireEnv } from "./kvdb.js";

const TX_COOKIE = "__Host-df_oauth_tx";
const discoveryCache = new Map();
const jwksCache = new Map();

export async function oauthStart(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const host = getRequestHost(request);
  if (!host) return errorResponse(request, 400, "BAD_HOST");
  const bundle = await loadDomainBundle(env, host);
  if (!bundle) return errorResponse(request, 404, "DOMAIN_NOT_FOUND");
  if (!bundle.origin) return errorResponse(request, 502, "ORIGIN_NOT_CONFIGURED");
  if (!hasOAuthProvider(bundle.domain)) return errorResponse(request, 500, "OAUTH_NOT_CONFIGURED");
  const oauth = await loadOAuthFromEnv(env);
  if (!oauth) return errorResponse(request, 500, "OAUTH_NOT_CONFIGURED");

  const state = randomId(24);
  const nonce = randomId(24);
  const codeVerifier = randomId(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const returnToParam = url.searchParams.get("return_to") || "/";
  const returnTo = returnToParam.indexOf("/") === 0 && returnToParam.indexOf("//") !== 0 ? returnToParam : "/";
  const redirectUri = `${url.origin}/cgi-oauth/callback`;
  const tx = { state, nonce, code_verifier: codeVerifier, host, return_to: returnTo, created_at: Date.now() };
  const txValue = await signTransaction(tx, requireEnv(env, "OAUTH_TX_SECRET"));

  const authUrl = new URL(oauth.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", oauth.client_id);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", (oauth.scopes || ["openid", "email"]).join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return redirect(authUrl.toString(), { "set-cookie": setCookie(TX_COOKIE, txValue, 300) });
}

export async function oauthCallback(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const host = getRequestHost(request);
  if (!host) return errorResponse(request, 400, "BAD_HOST");
  const tx = await verifyTransaction(getCookie(request, TX_COOKIE), requireEnv(env, "OAUTH_TX_SECRET"));
  if (!tx || tx.host !== host || Date.now() - tx.created_at > 300000) {
    return errorResponse(request, 400, "OAUTH_STATE_INVALID");
  }
  if (url.searchParams.get("state") !== tx.state) {
    return errorResponse(request, 400, "OAUTH_STATE_INVALID");
  }
  const code = url.searchParams.get("code");
  if (!code) return errorResponse(request, 400, "OAUTH_CODE_MISSING");

  const bundle = await loadDomainBundle(env, host);
  if (!bundle) return errorResponse(request, 404, "DOMAIN_NOT_FOUND");
  if (!bundle.origin) return errorResponse(request, 502, "ORIGIN_NOT_CONFIGURED");
  if (!hasOAuthProvider(bundle.domain)) return errorResponse(request, 500, "OAUTH_NOT_CONFIGURED");
  const oauth = await loadOAuthFromEnv(env);
  if (!oauth) return errorResponse(request, 500, "OAUTH_NOT_CONFIGURED");

  const redirectUri = `${url.origin}/cgi-oauth/callback`;
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: tx.code_verifier
  });
  const tokenHeaders = { "content-type": "application/x-www-form-urlencoded" };
  if (oauth.client_secret && oauth.client_auth_method !== "none") {
    if (oauth.client_auth_method === "client_secret_basic") {
      tokenHeaders.authorization = `Basic ${basicClientCredential(oauth.client_id, oauth.client_secret)}`;
    } else {
      tokenBody.set("client_id", oauth.client_id);
      tokenBody.set("client_secret", oauth.client_secret);
    }
  } else {
    tokenBody.set("client_id", oauth.client_id);
  }
  const tokenResponse = await fetch(oauth.token_endpoint, {
    method: "POST",
    headers: tokenHeaders,
    body: tokenBody.toString()
  });
  if (!tokenResponse.ok) return errorResponse(request, 502, "OAUTH_TOKEN_FAILED");
  const tokenData = await tokenResponse.json();
  const idToken = await verifyIdToken(oauth, tokenData.id_token, tx.nonce);
  if (!idToken.ok) return errorResponse(request, 403, "ID_TOKEN_INVALID");
  if (idToken.payload.email_verified !== true) {
    return errorResponse(request, 403, "EMAIL_UNVERIFIED");
  }
  const email = normalizeEmail(idToken.payload.email);
  if (!email) return errorResponse(request, 403, "EMAIL_MISSING");
  const user = await kvGet(env, `user:${email}`, Number(env.ACCESS_CACHE_TTL_SECONDS || 30));
  if (!isEmailAllowed(email, bundle.access, user)) {
    return errorResponse(request, 403, "ACCESS_DENIED");
  }

  const jwtConfig = bundle.domain.jwt || {};
  const token = await createGatewayToken(env, { email, domain: bundle.domain, origin: bundle.origin, access: bundle.access });
  return new Response(null, {
    status: 302,
    headers: {
      "Location": tx.return_to || "/",
      "Cache-Control": "no-store",
      "Set-Cookie": setCookie(env.GATEWAY_COOKIE_NAME || "df_oauth_token", token, Number(jwtConfig.ttl_seconds || 900))
    }
  });
}

function hasOAuthProvider(domain) {
  const providers = Array.isArray(domain.auth_providers) ? domain.auth_providers : [];
  if (!providers.length) return true;
  return providers.some(item => item.type === "oauth" && item.primary !== false);
}

async function loadOAuthFromEnv(env) {
  const clientId = env.OAUTH_CLIENT_ID;
  if (!clientId) return null;
  const metadata = await loadOAuthMetadata(env);
  if (!metadata || !metadata.authorization_endpoint || !metadata.token_endpoint) return null;
  const scopes = String(env.OAUTH_SCOPES || "openid,email")
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
  if (scopes.indexOf("openid") < 0) scopes.unshift("openid");
  return {
    issuer: metadata.issuer || env.OAUTH_ISSUER_URL || env.OAUTH_ENDPOINT || "",
    authorization_endpoint: metadata.authorization_endpoint,
    token_endpoint: metadata.token_endpoint,
    userinfo_endpoint: metadata.userinfo_endpoint || "",
    jwks_uri: metadata.jwks_uri || "",
    client_id: clientId,
    client_secret: env.OAUTH_CLIENT_SECRET || "",
    client_auth_method: chooseClientAuthMethod(env, metadata),
    scopes: scopes.length ? scopes : ["openid", "email", "profile"]
  };
}

async function loadOAuthMetadata(env) {
  const ttlMs = Number(env.OAUTH_DISCOVERY_CACHE_TTL_SECONDS || 300) * 1000;
  const urls = discoveryUrls(env);
  for (const discoveryUrl of urls) {
    const cached = discoveryCache.get(discoveryUrl);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const response = await fetch(discoveryUrl, { headers: { accept: "application/json" } }).catch(() => null);
    if (!response || !response.ok) continue;
    const metadata = await response.json().catch(() => null);
    if (!metadata || !metadata.authorization_endpoint || !metadata.token_endpoint) continue;
    discoveryCache.set(discoveryUrl, { value: metadata, expiresAt: Date.now() + ttlMs });
    return metadata;
  }
  return null;
}

function discoveryUrls(env) {
  if (env.OAUTH_DISCOVERY_URL) return [String(env.OAUTH_DISCOVERY_URL).trim()];
  const issuer = String(env.OAUTH_ISSUER_URL || env.OAUTH_ENDPOINT || "").trim().replace(/\/+$/, "");
  if (!issuer) return [];
  const urls = [
    `${issuer}/.well-known/openid-configuration`,
    `${issuer}/.well-known/oauth-authorization-server`
  ];
  try {
    const parsed = new URL(issuer);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (path && path !== "/") urls.push(`${parsed.origin}/.well-known/oauth-authorization-server${path}`);
  } catch {
    return urls;
  }
  return Array.from(new Set(urls));
}

function chooseClientAuthMethod(env, metadata) {
  const configured = String(env.OAUTH_CLIENT_AUTH_METHOD || "").trim();
  if (configured) return configured;
  const supported = Array.isArray(metadata.token_endpoint_auth_methods_supported) ? metadata.token_endpoint_auth_methods_supported : [];
  if (supported.indexOf("client_secret_post") >= 0) return "client_secret_post";
  if (supported.indexOf("client_secret_basic") >= 0) return "client_secret_basic";
  return "client_secret_post";
}

async function verifyIdToken(oauth, token, nonce, now = Math.floor(Date.now() / 1000)) {
  if (!token || typeof token !== "string") return { ok: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "format" };
  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  let header;
  let payload;
  try {
    header = decodeJson(headerEncoded);
    payload = decodeJson(payloadEncoded);
  } catch {
    return { ok: false, reason: "decode" };
  }
  if (header.alg !== "RS256" || header.typ && header.typ !== "JWT") return { ok: false, reason: "alg" };
  const jwk = await loadJwk(oauth, header.kid);
  if (!jwk) return { ok: false, reason: "kid" };
  const valid = await verifyRs256(`${headerEncoded}.${payloadEncoded}`, base64UrlDecode(signatureEncoded), jwk).catch(() => false);
  if (!valid) return { ok: false, reason: "signature" };
  if (payload.iss !== oauth.issuer) return { ok: false, reason: "issuer" };
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (audiences.indexOf(oauth.client_id) < 0) return { ok: false, reason: "audience" };
  if (audiences.length > 1 && payload.azp !== oauth.client_id) return { ok: false, reason: "azp" };
  if (payload.nonce !== nonce) return { ok: false, reason: "nonce" };
  if (typeof payload.exp !== "number" || payload.exp <= now) return { ok: false, reason: "expired" };
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return { ok: false, reason: "not_before" };
  return { ok: true, payload };
}

async function loadJwk(oauth, kid) {
  if (!oauth.jwks_uri) return null;
  const cached = jwksCache.get(oauth.jwks_uri);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return selectJwk(cached.keys, kid);
  const response = await fetch(oauth.jwks_uri, { headers: { accept: "application/json" } }).catch(() => null);
  if (!response || !response.ok) return null;
  const jwks = await response.json().catch(() => null);
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  jwksCache.set(oauth.jwks_uri, { keys, expiresAt: now + 300000 });
  return selectJwk(keys, kid);
}

function selectJwk(keys, kid) {
  return keys.find(key => key.kty === "RSA" && key.use !== "enc" && key.alg === "RS256" && (!kid || key.kid === kid)) || null;
}

async function verifyRs256(data, signature, jwk) {
  const spki = rsaJwkToSpki(jwk);
  const key = await crypto.subtle.importKey(
    "spki",
    spki,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(data));
}

function rsaJwkToSpki(jwk) {
  const modulus = derInteger(base64UrlDecode(jwk.n));
  const exponent = derInteger(base64UrlDecode(jwk.e));
  const rsaPublicKey = derSequence(modulus, exponent);
  const algorithm = derSequence(
    Uint8Array.from([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]),
    Uint8Array.from([0x05, 0x00])
  );
  return derSequence(algorithm, derBitString(rsaPublicKey));
}

function derSequence(...parts) {
  return derWrap(0x30, concatBytes(parts));
}

function derInteger(value) {
  let bytes = value;
  while (bytes.length > 1 && bytes[0] === 0x00 && bytes[1] < 0x80) bytes = bytes.slice(1);
  if (bytes[0] >= 0x80) bytes = concatBytes([Uint8Array.from([0x00]), bytes]);
  return derWrap(0x02, bytes);
}

function derBitString(value) {
  return derWrap(0x03, concatBytes([Uint8Array.from([0x00]), value]));
}

function derWrap(tag, value) {
  return concatBytes([Uint8Array.from([tag]), derLength(value.length), value]);
}

function derLength(length) {
  if (length < 0x80) return Uint8Array.from([length]);
  const bytes = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>= 8;
  }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function basicClientCredential(clientId, clientSecret) {
  const encode = value => encodeURIComponent(value).replace(/%20/g, "+");
  return btoa(`${encode(clientId)}:${encode(clientSecret)}`);
}

async function signTransaction(tx, secret) {
  const payload = btoa(JSON.stringify(tx)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sig = base64UrlEncode(await hmacSign(payload, secret));
  return `${payload}.${sig}`;
}

async function verifyTransaction(value, secret) {
  if (!value) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = base64UrlEncode(await hmacSign(payload, secret));
  if (expected !== sig) return null;
  let padded = payload.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) padded += "=";
  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}
