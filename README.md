# OAuth Gateway

基于 Tencent Cloud EdgeOne Edge Functions 的零信任访问网关。边缘函数拦截受保护域名的请求，完成 OAuth 登录、邮箱授权校验和 JWT Cookie 会话校验，通过后再代理到源站。

## 目录

```text
.
├── oauth-gateway/       # EdgeOne Pages / Edge Functions 网关项目
├── gateway-control/     # 静态 React/Vite 控制面
├── docs/                # 架构、数据模型、部署和安全文档
└── DESIGN.md            # 设计说明草案
```

`edge-functions` 必须位于 `oauth-gateway/` 子项目内。

## 当前实现

- 网关读取 HTTPKVDB 中的 `ztadata:*` 数据，按域名加载源站和授权配置。
- 未认证的 HTML 请求展示登录页；登录入口为 `/cgi-oauth/login`，回调为 `/cgi-oauth/callback`。
- OAuth 使用授权码 + PKCE，issuer discovery 来自 `OAUTH_ISSUER_URL` 或 `OAUTH_DISCOVERY_URL`。
- 登录成功后签发 `df_oauth_token` JWT Cookie；后续请求校验 JWT 的 host、签名和 access version。
- 授权按邮箱和邮箱域名判断，数据来自 `ztadata:access:domain:{host}` 和 `ztadata:user:{email}`。
- 回源时转发原请求方法、路径、查询和大部分请求头，并注入 `Host`、`X-ZTA-Token`、`X-Forwarded-Proto`。
- 控制面是无状态前端，浏览器直连 HTTPKVDB 管理域名、源站、用户和许可关系。

## 快速开始

### Edge 网关

```bash
cp oauth-gateway/.env.example oauth-gateway/.env
```

生产环境应在 EdgeOne 控制台配置环境变量，不要提交 `.env`。常用变量:

```text
KVDB_BASE_URL
KVDB_API_KEY
GATEWAY_JWT_SECRET
OAUTH_TX_SECRET
ORIGIN_ZTA_TOKEN
OAUTH_ISSUER_URL 或 OAUTH_DISCOVERY_URL
OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET
```

`OAUTH_CLIENT_SECRET` 是否需要取决于 OAuth client 类型和 `OAUTH_CLIENT_AUTH_METHOD`。完整示例见 [oauth-gateway/.env.example](oauth-gateway/.env.example)。

### IDP 配置

在 IDP 中新增一个 OAuth/OIDC 应用，callback/redirect URI 配置为:

```text
https://你的受保护域名/cgi-oauth/callback
```

推荐使用 `https://api.dreamreflex.com` 作为 `OAUTH_ISSUER_URL`。`OAUTH_SCOPES` 配置为 `openid,email`，网关只使用已验证邮箱做访问控制，`profile`、`offline_access` 等其他 scope 不必要。

### 控制面

```bash
cd gateway-control
npm install
npm run dev
```

控制面要求 Node.js 20+。页面会要求填写:

```text
KVDB_BASE_URL
KVDB_API_KEY
```

首次连接会自动初始化 `ztadata:meta`、`ztadata:domains`、`ztadata:users`。之后在页面配置域名、源站、用户和访问许可。

## 验证

```bash
find oauth-gateway/edge-functions -name '*.js' -print -exec node --check {} \;
cd gateway-control && npm run check
```

## 文档

- [技术架构](docs/architecture.md)
- [KVDB 数据模型](docs/kvdb-schema.md)
- [OAuth 和 JWT 流程](docs/oauth-flow.md)
- [部署和运行](docs/deployment.md)
- [安全边界](docs/security.md)
- [仓库维护](docs/repository.md)

## 安全提示

- 网关建议使用只读 KVDB API Key，控制面使用可写 Key。
- HTTPKVDB 需要 HTTPS，并为控制面静态站点正确配置 CORS。
- 源站应校验 `X-ZTA-Token`，并限制直接公网访问。
- 禁用用户不会立即吊销已经签发的 JWT；这是当前无状态 Cookie 设计的取舍，已有会话会在 JWT TTL 到期或 access version 变化后失效。
- 不要提交真实密钥、API Key、OAuth secret、JWT secret 或 `.env`。

Nginx 源站可以这样校验网关注入的密钥:

```nginx
# 需要保护的路径
location / {
    if ($http_x_zta_token != "a362afe2813bb25d89506eb0fee9e4a9038caf94916ec8089752cdd721dfe2fd" ) {
        return 401;
    }

    try_files $uri $uri/ /index.html;
    root /www/sites/zta.dreamreflex.com/index;
    index index.html index.htm;
}
```

## 许可证

[MIT](LICENSE) © dreamreflex
