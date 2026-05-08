import { base64UrlDecode, base64UrlEncode, decodeJson, encodeJson, hmacSign, hmacVerify, randomId } from "./crypto.js";

export const DEFAULT_ISSUER = "DreamReflex ZeroTrust";

export async function signGatewayJwt(identity, domainConfig, secret, now = Math.floor(Date.now() / 1000)) {
  const jwtConfig = domainConfig.jwt || {};
  const ttl = Number(jwtConfig.ttl_seconds || 900);
  const host = jwtConfig.audience || domainConfig.host;
  const header = { alg: "HS256", typ: "JWT", kid: jwtConfig.signing_key_id || "env" };
  const payload = {
    iss: jwtConfig.issuer || DEFAULT_ISSUER,
    sub: identity.email,
    email: identity.email,
    aud: host,
    iat: now,
    nbf: now - 5,
    exp: now + Math.min(ttl, 86400),
    jti: randomId(16),
    auth_method: identity.auth_method || "oauth",
    access_version: identity.access_version || 0,
    config_version: domainConfig.config_version || 0
  };
  const data = `${encodeJson(header)}.${encodeJson(payload)}`;
  const signature = await hmacSign(data, secret);
  return `${data}.${base64UrlEncode(signature)}`;
}

export async function verifyGatewayJwt(token, secret, expectedHost, expectedIssuer = DEFAULT_ISSUER, now = Math.floor(Date.now() / 1000)) {
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
  if (header.alg !== "HS256" || header.typ !== "JWT") return { ok: false, reason: "alg" };
  const valid = await hmacVerify(`${headerEncoded}.${payloadEncoded}`, base64UrlDecode(signatureEncoded), secret);
  if (!valid) return { ok: false, reason: "signature" };
  if (payload.iss !== expectedIssuer) return { ok: false, reason: "issuer" };
  if (!payload.sub || String(payload.sub).indexOf("@") < 0) return { ok: false, reason: "subject" };
  if (typeof payload.exp !== "number" || payload.exp <= now) return { ok: false, reason: "expired" };
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return { ok: false, reason: "not_before" };
  if (String(payload.aud || "").toLowerCase() !== expectedHost) return { ok: false, reason: "audience" };
  return { ok: true, payload };
}
