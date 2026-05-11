import { getCookie } from "./cookies.js";
import { errorResponse, html } from "./http.js";
import { getRequestHost, safeReturnTo } from "./hosts.js";
import { loginPage } from "./login-page.js";
import { fetchOrigin } from "./origin.js";
import { verifyGatewayJwt } from "./jwt.js";
import { isEmailAllowed } from "./access.js";
import { kvGet, loadDomainBundle, requireEnv } from "./kvdb.js";

export async function handleGatewayRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const host = getRequestHost(request);
  if (!host) return errorResponse(request, 400, "BAD_HOST");

  if (url.pathname === "/_gateway/login") {
    return html(loginPage(host, safeReturnTo(url)));
  }
  if (url.pathname.indexOf("/cgi-oauth/") === 0) {
    return new Response("OAuth Endpoint", { status: 200 });
  }

  try {
    const bundle = await loadDomainBundle(env, host);
    if (!bundle) return errorResponse(request, 404, "DOMAIN_NOT_FOUND");
    if (!bundle.origin) return errorResponse(request, 502, "ORIGIN_NOT_CONFIGURED");

    const token = getCookie(request, env.GATEWAY_COOKIE_NAME || "df_oauth_token");
    const expectedIssuer = bundle.domain?.jwt?.issuer || "DreamReflex ZeroTrust";
    const verified = await verifyGatewayJwt(token, requireEnv(env, "GATEWAY_JWT_SECRET"), host, expectedIssuer);
    if (!verified.ok) {
      if ((request.headers.get("accept") || "").indexOf("text/html") >= 0) {
        return html(loginPage(host, safeReturnTo(url)));
      }
      return errorResponse(request, 401, "UNAUTHENTICATED");
    }

    if (verified.payload.access_version && bundle.access && bundle.access.version && verified.payload.access_version !== bundle.access.version) {
      return errorResponse(request, 401, "TOKEN_STALE");
    }
    if (verified.payload.config_version !== undefined && Number(verified.payload.config_version || 0) !== Number(bundle.domain.config_version || 0)) {
      return errorResponse(request, 401, "TOKEN_STALE");
    }
    const email = String(verified.payload.email || verified.payload.sub || "").toLowerCase();
    const user = await kvGet(env, `user:${email}`, Number(env.ACCESS_CACHE_TTL_SECONDS || 30));
    if (!isEmailAllowed(email, bundle.access, user)) {
      return errorResponse(request, 403, "ACCESS_DENIED");
    }
    return fetchOrigin(context, bundle.origin);
  } catch (error) {
    console.error("Gateway internal error", error);
    return errorResponse(request, 500, "GATEWAY_INTERNAL_ERROR");
  }
}
