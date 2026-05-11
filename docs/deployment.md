# 部署和运行

## 子项目

```text
oauth-gateway/      # EdgeOne Pages / Edge Functions 项目
gateway-control/    # 静态 React 控制面
docs/               # 架构和运维文档
```

`edge-functions` 必须位于 `oauth-gateway/` 子项目内，不能放在仓库根目录。

## Edge 网关环境变量

复制示例:

```bash
cp oauth-gateway/.env.example oauth-gateway/.env
```

生产环境应在 EdgeOne 控制台配置环境变量，不要提交 `.env`。

必需变量:

| 变量 | 说明 |
|---|---|
| `KVDB_BASE_URL` | HTTPKVDB 服务地址 |
| `KVDB_API_KEY` | 网关读取 `ztafirewall` userspace 的 API Key |
| `GATEWAY_TOKEN_ACTIVE_KID` | 当前签发加密访问令牌使用的 key id |
| `GATEWAY_TOKEN_KEYS` | 网关 AES-GCM 加密令牌密钥 JSON，详见 `docs/gateway-token-keys.md` |
| `OAUTH_TX_SECRET` | OAuth transaction cookie 签名密钥 |
| `ORIGIN_ZTA_TOKEN` | 默认回源密钥 |
| `OAUTH_ISSUER_URL` | OAuth/OIDC issuer |
| `OAUTH_CLIENT_ID` | OAuth client id |
| `OAUTH_CLIENT_SECRET` | confidential client secret |

常用可选变量:

| 变量 | 说明 |
|---|---|
| `GATEWAY_COOKIE_NAME` | 网关访问 Cookie 名称，默认 `df_oauth_token` |
| `OAUTH_DISCOVERY_URL` | 显式 OAuth/OIDC discovery endpoint |
| `OAUTH_SCOPES` | OAuth scope，默认应包含 `openid,email` |
| `OAUTH_CLIENT_AUTH_METHOD` | `client_secret_post`、`client_secret_basic` 或 `none` |
| `DOMAIN_CACHE_TTL_SECONDS` | 登录/回调阶段读取域名配置的内存缓存 TTL |
| `ORIGIN_CACHE_TTL_SECONDS` | 登录/回调阶段读取源站配置的内存缓存 TTL |
| `ACCESS_CACHE_TTL_SECONDS` | 登录/回调阶段读取访问策略和用户状态的内存缓存 TTL |
| `OAUTH_DISCOVERY_CACHE_TTL_SECONDS` | OAuth discovery metadata 缓存 TTL |
| `ALLOW_PRIVATE_ORIGIN_IPS` | 是否允许回源到私网、回环或本机地址，默认 `false` |

`DOMAIN_CACHE_TTL_SECONDS`、`ORIGIN_CACHE_TTL_SECONDS` 和 `ACCESS_CACHE_TTL_SECONDS` 只影响登录/令牌签发阶段。普通已认证业务请求不读取 HTTPKVDB，因此不会使用这些 KVDB 缓存。

## 控制面

```bash
cd gateway-control
npm install
npm run dev
```

构建静态文件:

```bash
cd gateway-control
npm run build
```

控制面不需要后端服务。部署 `gateway-control/dist/` 到任意静态托管后，管理员在浏览器中填写 `KVDB_BASE_URL` 和 `KVDB_API_KEY`。

## HTTPKVDB 准备

HTTPKVDB 管理员需要创建应用 userspace `ztafirewall`，并为网关和控制面配置属于该 userspace 的 API Key。边缘函数在登录、OAuth callback 和令牌签发阶段读取 `/api/v1/ztafirewall/{url-encoded-key}`，并发送 `APIKey: <KVDB_API_KEY>`；普通已认证业务请求只解密短期网关令牌，不读取 HTTPKVDB。控制面首次连接会在 `ztafirewall` 中自动初始化 `meta`、`domains`、`users`。随后在控制面新增:

1. 域名配置。
2. 源站 IP 和 Host 头。
3. 用户邮箱。
4. 用户到域名的许可关系。

## 源站要求

源站应验证 `X-ZTA-Token`，缺失或错误时拒绝请求。建议配合:

- 防火墙只允许 EdgeOne 出口 IP。
- 私网或隧道回源。
- mTLS。
- 源站不直接暴露公网入口。
