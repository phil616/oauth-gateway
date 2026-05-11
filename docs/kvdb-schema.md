# HTTPKVDB 数据模型

HTTPKVDB 是后端唯一权威持久化数据源。控制面负责写入，边缘网关负责读取。

## Userspace

本项目固定使用 HTTPKVDB application userspace:

```text
ztafirewall
```

普通 KV 操作必须使用 userspace URL API:

```text
/api/v1/ztafirewall/{url-encoded-key}
```

认证头使用:

```text
APIKey: <KVDB_API_KEY>
```

业务 key 不再使用旧版 `ztadata:` 前缀。HTTPKVDB 的 userspace 已经提供应用级隔离。

## Key 约定

| 数据 | Key |
|---|---|
| 应用元数据 | `meta` |
| 域名列表索引 | `domains` |
| 域名配置 | `domain:{host}` |
| 源站配置 | `origin:{origin_id}` |
| 用户列表索引 | `users` |
| 用户配置 | `user:{email}` |
| 用户可访问域名 | `access:user:{email}` |
| 域名允许邮箱 | `access:domain:{host}` |
| OTP 预留配置 | `auth:otp:{provider_id}` |
| 可选策略 | `policy:{policy_id}` |
| 可选 JWT 密钥 | `signing_key:{key_id}` |
| 可选源站密钥引用 | `secret:origin:{origin_secret_id}` |
| 可选吊销列表 | `revoked_jti:{jti}` |

OAuth issuer、client id、client secret 当前由 Edge 环境变量提供，不写入 HTTPKVDB。

## 初始化数据

空库第一次打开控制面时自动写入:

```json
{
  "app_name": "ztafirewall",
  "userspace": "ztafirewall",
  "schema_version": 1,
  "initialized_at": "2026-05-08T00:00:00.000Z",
  "updated_at": "2026-05-08T00:00:00.000Z"
}
```

Key: `meta`

```json
{
  "items": [],
  "updated_at": "2026-05-08T00:00:00.000Z",
  "version": 1
}
```

Key: `domains` 和 `users`

## 域名配置

Key: `domain:{host}`

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

Key: `origin:{origin_id}`

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

Key: `user:{email}`

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

Key: `access:user:{email}`

```json
{
  "email": "alice@example.com",
  "domains": ["example.com"],
  "updated_at": "2026-05-08T00:00:00.000Z",
  "version": 1
}
```

Key: `access:domain:{host}`

```json
{
  "host": "example.com",
  "allowed_emails": ["alice@example.com"],
  "allowed_email_domains": [],
  "updated_at": "2026-05-08T00:00:00.000Z",
  "version": 1
}
```

控制面写入授权关系时使用 HTTPKVDB transaction 同时更新用户侧和域名侧索引。事务 API 仍走 `/v1/tx/*`，由 `APIKey` 在服务端绑定到 `ztafirewall` userspace。

## 一致性规则

- `access:domain:{host}` 是授权判定的权威来源，包含显式邮箱和邮箱域名策略。
- `access:user:{email}` 是控制面展示和反向清理使用的派生索引，应由控制面写入或状态页修复动作重建。
- 新建用户时，控制面会根据已有域名授权策略补齐该用户的 `access:user:{email}`。
- 删除用户时，控制面会扫描所有域名策略并移除该用户的显式邮箱授权。
- 删除域名时，控制面会从所有用户侧访问索引中移除该域名；只有未被其他域名引用的源站配置才会被删除。
- 状态页的一致性修复会重建 `domains`、`users`、缺失的 `access:*` 记录，以及用户侧派生索引。
