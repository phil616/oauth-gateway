import { escapeHtml } from "./http.js";

const LOGO_URL = "https://dreamreflex.com/img/logo.png";

export function loginPage(host, returnTo) {
  const startUrl = `/cgi-oauth/login?return_to=${encodeURIComponent(returnTo)}`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>零信任认证</title>
  <style>
    :root{color-scheme:light;--ink:#101010;--charcoal:#2b2b2b;--steel:#6f7480;--stone:#8a8f98;--canvas:#fff;--surface:#f7f7f8;--hairline:#e5e7eb;--blue:#165dff;--coral:#ff5c45}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;color:var(--ink);font-family:"DM Sans",Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 18% 16%,rgba(22,93,255,.12),transparent 30%),radial-gradient(circle at 82% 84%,rgba(255,92,69,.13),transparent 30%),linear-gradient(180deg,#fff 0,#fafafa 50%,#f5f6f8 100%)}
    .shell{min-height:100vh;display:grid;grid-template-rows:auto 1fr auto}
    header,footer{width:min(1120px,calc(100vw - 40px));margin:0 auto}
    header{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(229,231,235,.72)}
    .brand{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:700}
    .mark{width:30px;height:30px;padding:4px;border-radius:999px;background:#fff;border:1px solid var(--hairline);object-fit:contain}
    .pill{display:inline-flex;align-items:center;min-height:30px;padding:5px 12px;border:1px solid var(--hairline);border-radius:999px;color:var(--steel);background:rgba(255,255,255,.72);font-size:12px;font-weight:600}
    main{width:min(560px,calc(100vw - 40px));margin:0 auto;display:grid;place-items:center;padding:72px 0}
    .eyebrow{color:var(--stone);font-size:12px;font-weight:600;line-height:1.5;text-transform:uppercase}
    .card{width:100%;background:var(--canvas);border:1px solid var(--hairline);border-radius:32px;padding:36px;box-shadow:rgba(0,0,0,.08) 0 12px 16px -4px}
    .card h1{margin:14px 0 0;font-size:clamp(34px,7vw,48px);line-height:1.1;font-weight:600;letter-spacing:-1.5px}
    .card p{margin:14px 0 26px;color:var(--steel);font-size:15px;line-height:1.6}
    .target{display:grid;gap:6px;margin-bottom:22px;padding:16px;border:1px solid var(--hairline);border-radius:16px;background:var(--surface)}
    .target span{color:var(--stone);font-size:12px;font-weight:600}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink);font-size:13px;overflow-wrap:anywhere}
    a{display:flex;align-items:center;justify-content:center;min-height:44px;padding:11px 22px;background:#050505;color:#fff;text-decoration:none;border-radius:999px;font-size:14px;font-weight:600}
    a:active{background:#2b2b2b}
    .status-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
    .status-row span{display:inline-flex;align-items:center;min-height:28px;padding:4px 10px;border-radius:999px;background:var(--surface);border:1px solid var(--hairline);color:var(--steel);font-size:12px;font-weight:600}
    .note{margin-top:16px;color:var(--steel);font-size:12px;line-height:1.7}
    .note a{display:inline;min-height:0;padding:0;background:transparent;color:var(--ink);border-radius:0;text-decoration:underline;text-underline-offset:3px;font-size:inherit;font-weight:600}
    .note a:active{background:transparent}
    footer{height:56px;display:flex;align-items:center;justify-content:space-between;color:var(--stone);font-size:12px}
    @media (max-width:820px){header,footer,main{width:min(100% - 32px,560px)}main{padding:40px 0}footer{height:auto;gap:8px;align-items:flex-start;flex-direction:column;padding:0 0 24px}}
    @media (max-width:480px){header{height:64px}.pill{display:none}.card{padding:26px;border-radius:24px}a{min-height:46px}}
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="brand"><img class="mark" src="${LOGO_URL}" alt="DreamReflex">DreamReflex ZeroTrust</div>
      <div class="pill">Edge Access Gateway</div>
    </header>
    <main>
      <section class="card">
        <div class="eyebrow">Authorization Required</div>
        <h1>需要完成身份认证</h1>
        <p>该站点受零信任网关保护。继续之前，请使用已授权的身份完成认证。</p>
        <div class="target">
          <span>Protected host</span>
          <code>${escapeHtml(host)}</code>
        </div>
        <a href="${escapeHtml(startUrl)}">开始认证</a>
        <div class="note">您只能在认证完成之后访问受保护的页面，更多请了解 <a href="https://doc.dreamreflex.com/info/%E4%BA%91%E6%A2%A6%E9%95%9C%E5%83%8F%E5%AE%89%E5%85%A8%E7%BD%91%E7%BB%9C/%E4%BD%93%E7%B3%BB%E6%9E%B6%E6%9E%84.html">云梦镜像安全网络</a>。</div>
      </section>
    </main>
    <footer>
      <span>DreamReflex ZeroTrust</span>
      <span>Copyright © 2025 Dream Reflex Inc. All Rights Reserved.</span>
    </footer>
  </div>
</body>
</html>
`;
}
