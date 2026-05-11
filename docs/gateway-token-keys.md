# 网关加密令牌密钥管理

网关访问 Cookie 使用加密令牌承载短期授权快照。认证完成后，普通业务请求只解密令牌并转发源站，不再读取 HTTPKVDB。

## 环境变量

```bash
GATEWAY_TOKEN_ACTIVE_KID=v1
GATEWAY_TOKEN_KEYS='{"v1":"<32-byte-base64url-key>"}'
GATEWAY_COOKIE_NAME=df_oauth_token
```

- `GATEWAY_TOKEN_ACTIVE_KID`: 当前签发新令牌使用的 key id。
- `GATEWAY_TOKEN_KEYS`: JSON 对象，key 是 `kid`，value 是 32 字节 AES 密钥的 base64url、base64 或 64 位 hex 编码。
- 解密时会按令牌 header 中的 `kid` 选择密钥，因此可以保留旧密钥完成平滑轮换。

## 生成密钥

推荐生成 32 字节随机密钥，并使用 base64url 保存:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
```

也可以生成 hex:

```bash
openssl rand -hex 32
```

不要使用人工可记忆字符串、短口令、UUID、项目名或时间戳作为密钥。

## 首次配置

1. 生成一个 32 字节随机密钥。
2. 配置:

```bash
GATEWAY_TOKEN_ACTIVE_KID=v1
GATEWAY_TOKEN_KEYS='{"v1":"生成的密钥"}'
```

3. 部署边缘函数。
4. 重新登录获取新的加密访问 Cookie。

旧版 `GATEWAY_JWT_SECRET` 签发的明文 JWT 不再用于普通请求。升级后，已登录用户需要重新认证。

## 平滑轮换

假设当前配置为:

```bash
GATEWAY_TOKEN_ACTIVE_KID=v1
GATEWAY_TOKEN_KEYS='{"v1":"old-key"}'
```

轮换步骤:

1. 生成新密钥 `new-key`。
2. 同时配置新旧密钥，并把 active kid 指向新密钥:

```bash
GATEWAY_TOKEN_ACTIVE_KID=v2
GATEWAY_TOKEN_KEYS='{"v2":"new-key","v1":"old-key"}'
```

3. 部署后，新登录用户使用 `v2`；旧 Cookie 仍可用 `v1` 解密。
4. 等待超过最大网关 Cookie TTL 后，删除旧密钥:

```bash
GATEWAY_TOKEN_ACTIVE_KID=v2
GATEWAY_TOKEN_KEYS='{"v2":"new-key"}'
```

最大等待时间应不小于域名配置里的 `jwt.ttl_seconds` 最大值。建议生产环境把访问令牌 TTL 控制在 5-15 分钟。

## 紧急失效

如果怀疑令牌密钥泄漏:

1. 立即生成新密钥。
2. 只保留新密钥，不保留旧密钥。
3. 部署边缘函数。
4. 所有旧访问 Cookie 会立即失效，用户需要重新登录。

示例:

```bash
GATEWAY_TOKEN_ACTIVE_KID=v3
GATEWAY_TOKEN_KEYS='{"v3":"emergency-new-key"}'
```

## 安全注意事项

- 加密令牌使用 AES-GCM，提供机密性和完整性认证。
- 令牌泄漏后，攻击者不能直接读取源站 IP，但可以在有效期内重放访问网关。
- 源站真实访问令牌不能放入加密令牌，仍必须只通过边缘环境变量读取，例如 `ORIGIN_ZTA_TOKEN`。
- 源站仍必须校验 `X-ZTA-Token`，不能只依赖源站 IP 隐藏。
- 用户禁用、权限撤销、源站变更不会影响已经签发且尚未过期的令牌；如需立即撤销所有令牌，轮换并删除旧密钥。
- `GATEWAY_TOKEN_KEYS` 应只配置在边缘平台环境变量或密钥管理系统中，不要提交到仓库。
