import { getCookie } from "./cookies.js";
import { errorResponse, html } from "./http.js";
import { getRequestHost, safeReturnTo } from "./hosts.js";
import { loginPage } from "./login-page.js";
import { fetchOrigin } from "./origin.js";
import { verifyGatewayJwt } from "./jwt.js";
import { loadDomainBundle, requireEnv } from "./kvdb.js";

export async function handleGatewayRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const host = getRequestHost(request);
  if (!host) return errorResponse(request, 400, "BAD_HOST", "invalid host");

  if (url.pathname === "/_gateway/login") {
    return html(loginPage(host, safeReturnTo(url)));
  }
  if (url.pathname.indexOf("/cgi-oauth/") === 0) {
    return new Response("OAuth Endpoint", { status: 200 });
  }

  try {
    const bundle = await loadDomainBundle(env, host);
    if (!bundle) return errorResponse(request, 404, "DOMAIN_NOT_FOUND", "domain is not configured");

    const token = getCookie(request, env.GATEWAY_COOKIE_NAME || "df_oauth_token");
    const expectedIssuer = bundle.domain?.jwt?.issuer || "DreamReflex ZeroTrust";
    const verified = await verifyGatewayJwt(token, requireEnv(env, "GATEWAY_JWT_SECRET"), host, expectedIssuer);
    if (!verified.ok) {
      if ((request.headers.get("accept") || "").indexOf("text/html") >= 0) {
        return html(loginPage(host, safeReturnTo(url)));
      }
      return errorResponse(request, 401, "UNAUTHENTICATED", "authentication required");
    }

    if (verified.payload.access_version && bundle.access && bundle.access.version && verified.payload.access_version !== bundle.access.version) {
      return errorResponse(request, 401, "TOKEN_STALE", "authentication token is stale");
    }
    return fetchOrigin(context, bundle.origin);
  } catch (error) {
    return new Response("Gateway Error: " + error.message, { status: 500 });
  }
}
