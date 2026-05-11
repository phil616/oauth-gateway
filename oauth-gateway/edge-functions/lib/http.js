import { resolveGatewayError } from "./error-catalog.js";

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }, headers)
  });
}

export function html(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: Object.assign({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'self'; img-src https://dreamreflex.com https://doc.dreamreflex.com data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff"
    }, headers)
  });
}

export function redirect(location, headers = {}) {
  return new Response(null, {
    status: 302,
    headers: Object.assign({
      location,
      "cache-control": "no-store"
    }, headers)
  });
}

export function isHtmlRequest(request) {
  const accept = request.headers.get("accept") || "";
  return accept.indexOf("text/html") >= 0 || accept.indexOf("*/*") >= 0;
}

export function errorResponse(request, status, code) {
  const error = resolveGatewayError(code);
  if (!isHtmlRequest(request)) {
    return json({
      error: error.name,
      code: error.code,
      title: error.title,
      documentation_url: error.documentation_url
    }, status);
  }
  return html(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(error.code)} ${escapeHtml(error.name)}</title>
  <style>
    :root{color-scheme:light;--ink:#101010;--charcoal:#2b2b2b;--steel:#6f7480;--stone:#8a8f98;--canvas:#fff;--surface:#f7f7f8;--hairline:#e5e7eb;--danger:#d45656;--danger-bg:#fff1f1}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;color:var(--ink);font-family:"DM Sans",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 18% 16%,rgba(212,86,86,.14),transparent 30%),radial-gradient(circle at 82% 84%,rgba(22,93,255,.10),transparent 30%),linear-gradient(180deg,#fff 0,#fafafa 52%,#f5f6f8 100%)}
    .shell{min-height:100vh;display:grid;grid-template-rows:auto 1fr auto}
    header,main,footer{width:min(960px,calc(100vw - 40px));margin:0 auto}
    header{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(229,231,235,.72)}
    .brand{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700}
    .mark{width:30px;height:30px;padding:4px;border-radius:999px;background:#fff;border:1px solid var(--hairline);object-fit:contain}
    .pill{display:inline-flex;align-items:center;min-height:30px;padding:5px 12px;border:1px solid var(--hairline);border-radius:999px;color:var(--steel);background:rgba(255,255,255,.72);font-size:12px;font-weight:600}
    main{display:grid;place-items:center;padding:72px 0}
    .card{width:min(620px,100%);background:var(--canvas);border:1px solid var(--hairline);border-radius:8px;padding:40px;box-shadow:rgba(0,0,0,.08) 0 12px 16px -4px}
    .status{display:inline-flex;align-items:center;min-height:30px;padding:5px 12px;border-radius:999px;background:var(--danger-bg);color:#a13b3b;font-size:12px;font-weight:600}
    h1{margin:24px 0 0;font-size:clamp(34px,8vw,56px);line-height:1.1;font-weight:600;letter-spacing:0}
    p{margin:16px 0 0;color:var(--steel);font-size:16px;line-height:1.6}
    .detail{display:grid;gap:6px;margin-top:28px;padding:16px;border:1px solid var(--hairline);border-radius:16px;background:var(--surface)}
    .detail span{color:var(--stone);font-size:12px;font-weight:600}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink);font-size:13px;overflow-wrap:anywhere}
    .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
    a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:11px 22px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:600}
    .primary{background:#050505;color:#fff}
    .secondary{background:#fff;color:#101010;border:1px solid var(--hairline)}
    footer{height:56px;display:flex;align-items:center;justify-content:space-between;color:var(--stone);font-size:12px}
    @media (max-width:640px){header,main,footer{width:min(100% - 32px,620px)}main{padding:40px 0}.card{padding:28px;border-radius:24px}footer{height:auto;gap:8px;align-items:flex-start;flex-direction:column;padding:0 0 24px}.pill{display:none}}
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand"><img class="mark" src="https://dreamreflex.com/img/logo.png" alt="DreamReflex">DreamReflex ZeroTrust</div>
      <div class="pill">Edge Access Gateway</div>
    </header>
    <main>
      <section class="card">
        <div class="status">请求未通过</div>
        <h1>${escapeHtml(error.title)}</h1>
        <p>边缘节点没有放行此请求。请将下方错误码提供给管理员，或查看错误码文档获取处理建议。</p>
        <div class="detail">
          <span>错误码</span>
          <code>${escapeHtml(error.code)} · ${escapeHtml(error.name)} · HTTP ${escapeHtml(status)}</code>
        </div>
        <div class="actions">
          <a class="primary" href="/_gateway/login">重新认证</a>
          <a class="secondary" href="${escapeHtml(error.documentation_url)}">错误码说明</a>
        </div>
      </section>
    </main>
    <footer>
      <span>DreamReflex ZeroTrust</span>
      <span>Access decisions are enforced at the edge.</span>
    </footer>
  </div>
</body>
</html>`, status);
}

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
