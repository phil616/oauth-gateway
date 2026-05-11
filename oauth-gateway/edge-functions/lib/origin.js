import { errorResponse } from "./http.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "x-zta-token"
]);

function isSafeOriginIp(ip, env) {
  if (!ip) return false;
  if (env.ALLOW_PRIVATE_ORIGIN_IPS === "true") return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|localhost$)/i.test(ip)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return false;
  return /^[a-z0-9.-]+$/i.test(ip);
}

export async function fetchOrigin(context, origin) {
  const { request, env } = context;
  if (!origin || !origin.origin_ip || !origin.origin_host_header) {
    return errorResponse(request, 502, "ORIGIN_NOT_CONFIGURED");
  }
  const scheme = origin.origin_scheme || "https";
  if (!(scheme === "http" || scheme === "https")) {
    return errorResponse(request, 502, "ORIGIN_SCHEME_DENIED");
  }
  if (!isSafeOriginIp(origin.origin_ip, env)) {
    return errorResponse(request, 502, "ORIGIN_DENIED");
  }
  const tokenEnv = origin.zta_token_env || "ORIGIN_ZTA_TOKEN";
  const ztaToken = env[tokenEnv];
  if (!ztaToken) return errorResponse(request, 500, "ORIGIN_TOKEN_MISSING");

  const url = new URL(request.url);
  const target = new URL(`${url.pathname}${url.search}`, `${scheme}://${origin.origin_ip}`);
  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  }
  headers.set("Host", origin.origin_host_header);
  headers.set("X-ZTA-Token", ztaToken);
  headers.set("X-Forwarded-Proto", "https");

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  return fetch(new Request(target, init));
}
