# 安全边界

## 已实现的关键控制

- 网关访问令牌使用 `HttpOnly`、`Secure`、`SameSite=Lax` Cookie。
- 网关访问令牌使用 AES-GCM 加密，验证 `kid`、issuer、audience、exp、nbf、授权快照和源站路由快照。
- 登录和 OAuth callback 阶段读取 KVDB 并生成短期授权快照；普通已认证业务请求不读取 KVDB。
- OAuth 使用授权码模式和 PKCE S256。
- OAuth state 和 code verifier 存在签名 transaction cookie 中，默认 5 分钟有效。
- OAuth ID Token 使用 JWKS 校验 RS256 签名，并检查 issuer、audience、nonce、exp、nbf 和邮箱验证状态。
- 回源时过滤 hop-by-hop headers，并强制注入 `Host` 和 `X-ZTA-Token`。
- 默认拒绝回源到本机、私网和 metadata 网段，除非 `ALLOW_PRIVATE_ORIGIN_IPS=true`。
- 控制面不存储 API Key 到服务端，只保存在当前浏览器 localStorage。

## 需要部署侧保证

- `GATEWAY_TOKEN_KEYS` 和 `OAUTH_TX_SECRET` 必须是强随机密钥。
- `KVDB_API_KEY` 应按用途分权。网关使用只读 key，控制面使用可写 key。
- HTTPKVDB 必须通过 HTTPS 暴露，并正确配置 CORS。
- OAuth redirect URI 必须精确登记为 `https://{protected-host}/cgi-oauth/callback`。
- 源站必须验证 `X-ZTA-Token`，不能只依赖隐藏 IP。

## 当前限制

- 已签发的短期加密令牌在过期前不会感知用户禁用、权限撤销或源站变更。
- 单用户即时撤销没有在线检查；禁用用户或撤销授权后，已签发令牌会在 TTL 到期前继续有效。
- 控制面是无状态前端，任何拿到可写 KVDB API Key 的人都能修改授权数据。
- 控制面不会托管密钥管理系统，OAuth secret 和网关密钥仍由 Edge 环境变量承载。

## 后续建议

- 如需单用户即时撤销，需要引入在线会话状态、黑名单或更短 TTL；这会重新增加存储读取。
- 为 HTTPKVDB API Key 增加最小权限策略。
- 源站侧增加 mTLS 或 EdgeOne 专用私网链路。
