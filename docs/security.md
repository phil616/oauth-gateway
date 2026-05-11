# 安全边界

## 已实现的关键控制

- JWT 使用 `HttpOnly`、`Secure`、`SameSite=Lax` Cookie。
- JWT 验证签名、issuer、audience、exp、nbf、domain config version 和 access version。
- 每次受保护请求都会按 KVDB 缓存重新校验当前用户存在、用户启用状态和域名授权策略。
- OAuth 使用授权码模式和 PKCE S256。
- OAuth state 和 code verifier 存在签名 transaction cookie 中，默认 5 分钟有效。
- 回源时过滤 hop-by-hop headers，并强制注入 `Host` 和 `X-ZTA-Token`。
- 默认拒绝回源到本机、私网和 metadata 网段，除非 `ALLOW_PRIVATE_ORIGIN_IPS=true`。
- 控制面不存储 API Key 到服务端，只保存在当前浏览器 localStorage。

## 需要部署侧保证

- `GATEWAY_JWT_SECRET` 和 `OAUTH_TX_SECRET` 必须是强随机密钥。
- `KVDB_API_KEY` 应按用途分权。网关使用只读 key，控制面使用可写 key。
- HTTPKVDB 必须通过 HTTPS 暴露，并正确配置 CORS。
- OAuth redirect URI 必须精确登记为 `https://{protected-host}/cgi-oauth/callback`。
- 源站必须验证 `X-ZTA-Token`，不能只依赖隐藏 IP。

## 当前限制

- 网关 JWT 当前为 HS256 环境变量密钥，尚未实现按 `kid` 多密钥轮换。
- OAuth ID Token 签名验证尚未实现；当前优先通过 userinfo endpoint 获取邮箱。
- 控制面是无状态前端，任何拿到可写 KVDB API Key 的人都能修改授权数据。
- 控制面不会托管密钥管理系统，OAuth secret 和网关密钥仍由 Edge 环境变量承载。

## 后续建议

- 增加 JWKS 验证 ID Token，并校验 nonce、issuer、audience。
- 增加 JWT signing key 轮换和吊销列表。
- 为 HTTPKVDB API Key 增加最小权限策略。
- 源站侧增加 mTLS 或 EdgeOne 专用私网链路。
