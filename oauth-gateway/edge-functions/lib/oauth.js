import { isEmailAllowed, normalizeEmail } from "./access.js";
import { getCookie, setCookie } from "./cookies.js";
import { base64UrlEncode, hmacSign, randomId, sha256Base64Url } from "./crypto.js";
import { errorResponse, redirect } from "./http.js";
import { getRequestHost } from "./hosts.js";
import { signGatewayJwt } from "./jwt.js";
import { kvGet, loadDomainBundle, requireEnv } from "./kvdb.js";

const TX_COOKIE = "__Host-df_oauth_tx";
const discoveryCache = new Map();

export async function oauthStart(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const host = getRequestHost(request);
  if (!host) return errorResponse(request, 400, "BAD_HOST", "invalid host");
  const bundle = await loadDomainBundle(env, host);
  if (!bundle) return errorResponse(request, 404, "DOMAIN_NOT_FOUND", "domain is not configured");
  if (!hasOAuthProvider(bundle.domain)) return errorResponse(request, 500, "OAUTH_NOT_CONFIGURED", "oauth provider is not enabled for this domain");
  const oauth = await loadOAuthFromEnv(env);
  if (!oauth) return errorResponse(request, 500, "OAUTH_NOT_CONFIGURED", "oauth environment is not configured");

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
  if (!host) return errorResponse(request, 400, "BAD_HOST", "invalid host");
  const tx = await verifyTransaction(getCookie(request, TX_COOKIE), requireEnv(env, "OAUTH_TX_SECRET"));
  if (!tx || tx.host !== host || Date.now() - tx.created_at > 300000) {
    return errorResponse(request, 400, "OAUTH_STATE_INVALID", "oauth transaction is invalid");
  }
  if (url.searchParams.get("state") !== tx.state) {
    return errorResponse(request, 400, "OAUTH_STATE_INVALID", "oauth state is invalid");
  }
  const code = url.searchParams.get("code");
  if (!code) return errorResponse(request, 400, "OAUTH_CODE_MISSING", "oauth code is missing");

  const bundle = await loadDomainBundle(env, host);
  if (!bundle) return errorResponse(request, 404, "DOMAIN_NOT_FOUND", "domain is not configured");
  if (!hasOAuthProvider(bundle.domain)) return errorResponse(request, 500, "OAUTH_NOT_CONFIGURED", "oauth provider is not enabled for this domain");
  const oauth = await loadOAuthFromEnv(env);
  if (!oauth) return errorResponse(request, 500, "OAUTH_NOT_CONFIGURED", "oauth environment is not configured");

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
  if (!tokenResponse.ok) return errorResponse(request, 502, "OAUTH_TOKEN_FAILED", "oauth token exchange failed");
  const tokenData = await tokenResponse.json();
  const userInfo = await fetchUserInfo(oauth, tokenData);
  const email = normalizeEmail(userInfo.email || userInfo.sub);
  if (!email) return errorResponse(request, 403, "EMAIL_MISSING", "oauth identity has no email");
  const user = await kvGet(env, `user:${email}`, Number(env.ACCESS_CACHE_TTL_SECONDS || 30));
  if (!isEmailAllowed(email, bundle.access, user)) {
    return errorResponse(request, 403, "ACCESS_DENIED", "email is not allowed for this domain");
  }

  const jwt = await signGatewayJwt(
    { email, auth_method: "oauth", access_version: bundle.access && bundle.access.version ? bundle.access.version : 0 },
    bundle.domain,
    requireEnv(env, "GATEWAY_JWT_SECRET")
  );
  const jwtConfig = bundle.domain.jwt || {};
  return new Response(null, {
    status: 302,
    headers: {
      "Location": tx.return_to || "/",
      "Cache-Control": "no-store",
      "Set-Cookie": setCookie(env.GATEWAY_COOKIE_NAME || "df_oauth_token", jwt, Number(jwtConfig.ttl_seconds || 900))
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
  const scopes = String(env.OAUTH_SCOPES || "openid email profile")
    .split(/[,\s]+/)
    .map(item => item.trim())
    .filter(Boolean);
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

function basicClientCredential(clientId, clientSecret) {
  const encode = value => encodeURIComponent(value).replace(/%20/g, "+");
  return btoa(`${encode(clientId)}:${encode(clientSecret)}`);
}

async function fetchUserInfo(oauth, tokenData) {
  if (oauth.userinfo_endpoint && tokenData.access_token) {
    const response = await fetch(oauth.userinfo_endpoint, {
      headers: { authorization: `Bearer ${tokenData.access_token}` }
    });
    if (response.ok) return response.json();
  }
  return {};
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
