# OAuth 和加密令牌流程

认证采用 OAuth 2.1 授权码模式和 PKCE S256。网关校验 OIDC ID Token 后，自己签发访问源站所需的 `df_oauth_token`，OAuth provider 的 access token 不下发给源站。

## Edge 环境变量

```env
OAUTH_ISSUER_URL=https://idp.example.com
OAUTH_CLIENT_ID=client_xxx
OAUTH_CLIENT_SECRET=secret_xxx
OAUTH_SCOPES=openid,email
OAUTH_CLIENT_AUTH_METHOD=client_secret_post
OAUTH_DISCOVERY_CACHE_TTL_SECONDS=300
GATEWAY_TOKEN_ACTIVE_KID=v1
GATEWAY_TOKEN_KEYS='{"v1":"<32-byte-base64url-key>"}'
```

当前实现依赖 token endpoint 返回 `id_token`，并要求 ID Token 中包含已验证邮箱。

也可以显式设置:

```env
OAUTH_DISCOVERY_URL=https://idp.example.com/.well-known/openid-configuration
```

未设置 `OAUTH_DISCOVERY_URL` 时，边缘函数会尝试:

```text
{issuer}/.well-known/openid-configuration
{issuer}/.well-known/oauth-authorization-server
```

如果 issuer 带路径，也会尝试 RFC 8414 路径形式:

```text
{origin}/.well-known/oauth-authorization-server{issuer-path}
```

## 登录流程

```text
1. 用户访问受保护域名
2. Edge 未找到有效 df_oauth_token
3. HTML 请求展示 /_gateway/login 登录页
4. 用户点击开始认证
5. /cgi-oauth/login 生成 state、nonce、code_verifier
6. Edge 设置 __Host-df_oauth_tx 临时 cookie
7. 302 跳转 OAuth authorization_endpoint
8. OAuth provider 回调 /cgi-oauth/callback?code=...&state=...
9. Edge 验证 state 和 transaction cookie
10. Edge 用 code + code_verifier 调 token_endpoint
11. Edge 校验 ID Token 的 RS256 签名、issuer、audience、nonce 和有效期，并读取已验证邮箱
12. Edge 读取 HTTPKVDB 授权数据并判断邮箱是否允许访问 host
13. Edge 签发加密 df_oauth_token 并 302 回原路径
```

## 加密令牌 Payload

`df_oauth_token` 是 AES-GCM 加密令牌，默认 Cookie 名称为 `df_oauth_token`。下方是解密后的内部 payload 示例，浏览器拿到的 Cookie 不能直接读取该 JSON。

```json
{
  "iss": "DreamReflex ZeroTrust",
  "sub": "alice@example.com",
  "email": "alice@example.com",
  "aud": "example.com",
  "iat": 1778198400,
  "nbf": 1778198395,
  "exp": 1778199300,
  "jti": "random",
  "auth_method": "oauth",
  "grant": {
    "host": "example.com",
    "allowed": true,
    "access_version": 1,
    "config_version": 1
  },
  "origin": {
    "origin_scheme": "https",
    "origin_ip": "203.0.113.10",
    "origin_host_header": "origin.example.com",
    "zta_token_env": "ORIGIN_ZTA_TOKEN"
  }
}
```

边缘验证要求:

- 令牌 header 必须是 `typ=gateway_access`、`alg=dir`、`enc=A256GCM`。
- `kid` 必须存在于 `GATEWAY_TOKEN_KEYS`。
- `iss` 必须是 `DreamReflex ZeroTrust`。
- `sub` 必须是邮箱。
- `exp` 未过期。
- `nbf` 未明显超前。
- `aud` 必须等于当前请求 Host。
- AES-GCM 解密和认证必须通过。
- `grant.allowed` 必须为 `true`，且 `grant.host` 必须等于当前请求 Host。
- `origin` 快照必须包含源站地址和 Host 头；真实 `X-ZTA-Token` 仍从边缘环境变量读取。

普通业务请求只执行上述加密令牌校验和回源，不再读取 HTTPKVDB。HTTPKVDB 读取发生在 `/cgi-oauth/login` 和 `/cgi-oauth/callback` 阶段，用于确认域名、源站、访问策略和用户状态。

## OAuth Client Authentication

`OAUTH_CLIENT_AUTH_METHOD` 支持:

- `client_secret_post`
- `client_secret_basic`
- `none`

默认根据 well-known metadata 的 `token_endpoint_auth_methods_supported` 选择，优先 `client_secret_post`，再回退到 `client_secret_basic`。
