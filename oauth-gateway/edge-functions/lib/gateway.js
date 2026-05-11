import { getCookie } from "./cookies.js";
import { errorResponse, html } from "./http.js";
import { getRequestHost, safeReturnTo } from "./hosts.js";
import { loginPage } from "./login-page.js";
import { fetchOrigin } from "./origin.js";
import { verifyGatewayToken } from "./gateway-token.js";

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
    const token = getCookie(request, env.GATEWAY_COOKIE_NAME || "df_oauth_token");
    const verified = await verifyGatewayToken(env, token, host);
    if (!verified.ok) {
      if ((request.headers.get("accept") || "").indexOf("text/html") >= 0) {
        return html(loginPage(host, safeReturnTo(url)));
      }
      return errorResponse(request, 401, "UNAUTHENTICATED");
    }
    return fetchOrigin(context, verified.payload.origin);
  } catch (error) {
    console.error("Gateway internal error", error);
    return errorResponse(request, 500, "GATEWAY_INTERNAL_ERROR");
  }
}
