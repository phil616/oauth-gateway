# 技术架构

本项目是基于 Tencent Cloud EdgeOne Edge Functions 的零信任网关。所有被保护域名的请求先到边缘节点，边缘节点验证网关签发的 JWT，通过后再按域名配置回源。

## 组件

| 组件 | 目录 | 职责 |
|---|---|---|
| Edge 网关 | `oauth-gateway/edge-functions` | 请求拦截、JWT 验证、OAuth 回调、授权判断、回源代理 |
| 控制面 Web | `gateway-control/` | 纯静态 React 前端，浏览器直连 HTTPKVDB 管理域名、用户和许可 |
| HTTPKVDB | 外部服务 | 唯一权威持久化数据源 |
| OAuth/OIDC Provider | 外部服务 | OAuth 2.1 授权码 + PKCE 身份认证 |
| 源站 | 外部服务 | 真实业务服务，只接受带 `X-ZTA-Token` 的合法边缘回源 |

## 请求路径

```text
Browser
  -> EdgeOne Edge Function
    -> read ztafirewall/domain:{host}, ztafirewall/origin:{origin_id}, ztafirewall/access:domain:{host}
    -> verify df_oauth_token JWT
    -> fetch origin_ip with original request headers + Host + X-ZTA-Token
```

如果请求没有有效 `df_oauth_token`，HTML 请求会展示内置登录页；用户点击开始认证后进入 `/cgi-oauth/login`，完成 OAuth 后在 `/cgi-oauth/callback` 签发网关 JWT。

## 边缘函数结构

```text
oauth-gateway/edge-functions/
  index.js                  # 根路径入口
  [[path]].js               # 通配路径入口
  cgi-oauth/login.js        # OAuth start
  cgi-oauth/callback.js     # OAuth callback
  lib/
    gateway.js              # 主请求处理
    oauth.js                # OAuth 2.1 + PKCE
    jwt.js                  # df_oauth_token 签发和验签
    kvdb.js                 # HTTPKVDB 读取和缓存
    origin.js               # 回源代理
    access.js               # 邮箱授权判断
```

## 固定持久化空间

应用固定使用 `ztafirewall` 作为 HTTPKVDB userspace。普通 KV 操作使用 `/api/v1/ztafirewall/{key}`，业务 key 不再额外拼接旧版 `ztadata:` 前缀。

## 控制面设计

控制面是纯静态前端，不包含后端、不做登录、不保存业务数据库。管理员在浏览器填写 `KVDB_BASE_URL` 和 `KVDB_API_KEY` 后，页面直接调用 HTTPKVDB。

首次连接或刷新时，控制面会自动初始化:

- `meta`
- `domains`
- `users`
