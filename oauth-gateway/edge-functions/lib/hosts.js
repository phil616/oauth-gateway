const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHost(rawHost) {
  if (!rawHost) return "";
  const value = String(rawHost).trim().toLowerCase();
  if (value.indexOf("@") >= 0 || value.indexOf("/") >= 0 || value.indexOf("\\") >= 0 || value.indexOf("\0") >= 0) return "";
  if (value.indexOf(",") >= 0) return "";
  const host = value.indexOf("[") === 0 ? "" : value.split(":")[0];
  if (!host || !HOST_RE.test(host)) return "";
  return host;
}

export function getRequestHost(request) {
  return normalizeHost(request.headers.get("host"));
}

export function safeReturnTo(url) {
  const path = `${url.pathname}${url.search}`;
  if (path.indexOf("/") !== 0) return "/";
  if (path.indexOf("//") === 0) return "/";
  if (path.indexOf("/cgi-oauth/callback") === 0) return "/";
  return path;
}
