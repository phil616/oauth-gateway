# HTTPKVDB 数据模型

HTTPKVDB 是后端唯一权威持久化数据源。控制面负责写入，边缘网关负责读取。

## Key 约定

| 数据 | Key |
|---|---|
| 应用元数据 | `ztadata:meta` |
| 域名列表索引 | `ztadata:domains` |
| 域名配置 | `ztadata:domain:{host}` |
| 源站配置 | `ztadata:origin:{origin_id}` |
| 用户列表索引 | `ztadata:users` |
| 用户配置 | `ztadata:user:{email}` |
| 用户可访问域名 | `ztadata:access:user:{email}` |
| 域名允许邮箱 | `ztadata:access:domain:{host}` |
| OTP 预留配置 | `ztadata:auth:otp:{provider_id}` |
| 可选策略 | `ztadata:policy:{policy_id}` |
| 可选 JWT 密钥 | `ztadata:signing_key:{key_id}` |
| 可选源站密钥引用 | `ztadata:secret:origin:{origin_secret_id}` |
| 可选吊销列表 | `ztadata:revoked_jti:{jti}` |

OAuth issuer、client id、client secret 当前由 Edge 环境变量提供，不写入 HTTPKVDB。

## 初始化数据

空库第一次打开控制面时自动写入:

```json
{
  "namespace": "ztadata",
  "schema_version": 1,
  "initialized_at": "2026-05-08T00:00:00.000Z",
  "updated_at": "2026-05-08T00:00:00.000Z"
}
```

Key: `ztadata:meta`

```json
{
  "items": [],
  "updated_at": "2026-05-08T00:00:00.000Z",
  "version": 1
}
```

Key: `ztadata:domains` 和 `ztadata:users`

## 域名配置

Key: `ztadata:domain:{host}`

```json
{
  "host": "example.com",
  "enabled": true,
  "auth_providers": [{ "id": "dreamreflex_oauth", "type": "oauth", "primary": true }],
  "login_path": "/_gateway/login",
  "callback_path": "/cgi-oauth/callback",
  "logout_path": "/_gateway/logout",
  "origin_id": "origin_example_com",
  "policy_id": "default",
  "jwt": {
    "issuer": "DreamReflex ZeroTrust",
    "audience": "example.com",
    "ttl_seconds": 900,
    "signing_key_id": "env"
  },
  "config_version": 1
}
```

## 源站配置

Key: `ztadata:origin:{origin_id}`

```json
{
  "origin_id": "origin_example_com",
  "origin_scheme": "https",
  "origin_ip": "203.0.113.10",
  "origin_host_header": "internal.example.com",
  "zta_token_env": "ORIGIN_ZTA_TOKEN",
  "timeout_ms": 30000,
  "tls_verify": true,
  "origin_version": 1
}
```

边缘节点会请求 `https://203.0.113.10/{path}`，同时设置 `Host: internal.example.com` 和 `X-ZTA-Token: <env value>`。

## 用户和许可

Key: `ztadata:user:{email}`

```json
{
  "email": "alice@example.com",
  "display_name": "Alice",
  "enabled": true,
  "created_at": "2026-05-08T00:00:00.000Z",
  "updated_at": "2026-05-08T00:00:00.000Z",
  "metadata": {}
}
```

Key: `ztadata:access:user:{email}`

```json
{
  "email": "alice@example.com",
  "domains": ["example.com"],
  "updated_at": "2026-05-08T00:00:00.000Z",
  "version": 1
}
```

Key: `ztadata:access:domain:{host}`

```json
{
  "host": "example.com",
  "allowed_emails": ["alice@example.com"],
  "allowed_email_domains": [],
  "updated_at": "2026-05-08T00:00:00.000Z",
  "version": 1
}
```

控制面写入授权关系时使用 HTTPKVDB transaction 同时更新用户侧和域名侧索引。

