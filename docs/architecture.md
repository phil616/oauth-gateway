# 技术架构

本项目是基于 Tencent Cloud EdgeOne Edge Functions 的零信任网关。所有被保护域名的请求先到边缘节点，边缘节点验证网关签发的加密访问令牌，通过后再按令牌中的短期源站快照回源。

## 组件

| 组件 | 目录 | 职责 |
|---|---|---|
| Edge 网关 | `oauth-gateway/edge-functions` | 请求拦截、加密令牌验证、OAuth 回调、授权判断、回源代理 |
| 控制面 Web | `gateway-control/` | 纯静态 React 前端，浏览器直连 HTTPKVDB 管理域名、用户和许可 |
| HTTPKVDB | 外部服务 | 配置和登录授权判定的权威持久化数据源 |
| OAuth/OIDC Provider | 外部服务 | OAuth 2.1 授权码 + PKCE 身份认证 |
| 源站 | 外部服务 | 真实业务服务，只接受带 `X-ZTA-Token` 的合法边缘回源 |

## 前后端边界

- 前端控制面是 `gateway-control/`，构建后是纯静态站点。它没有自带后端、没有登录体系，管理员在浏览器输入 HTTPKVDB 地址和 API Key 后直接管理配置数据。
- 边缘后端是 `oauth-gateway/edge-functions/`，运行在 EdgeOne Edge Functions。它处理登录、OAuth callback、加密访问令牌签发、普通请求令牌校验和回源代理。
- HTTPKVDB 是外部持久化后端，只保存域名、源站、用户和授权策略。普通已认证业务请求不访问 HTTPKVDB。
- 源站业务服务不理解控制面数据模型，只需要验证边缘注入的 `X-ZTA-Token`。

## 请求路径

```text
Browser
  -> EdgeOne Edge Function
    -> decrypt and verify df_oauth_token
    -> fetch origin_ip with original request headers + Host + X-ZTA-Token
```

如果请求没有有效 `df_oauth_token`，HTML 请求会展示内置登录页；用户点击开始认证后进入 `/cgi-oauth/login`，完成 OAuth 后在 `/cgi-oauth/callback` 读取 KVDB 授权数据并签发短期加密网关令牌。

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
    gateway-token.js        # df_oauth_token 加密、解密和校验
    kvdb.js                 # 登录/回调阶段的 HTTPKVDB 读取和缓存
    origin.js               # 回源代理
    access.js               # 邮箱授权判断
```

## 固定持久化空间

应用固定使用 `ztafirewall` 作为 HTTPKVDB userspace。登录、OAuth callback、控制面读写使用 `/api/v1/ztafirewall/{url-encoded-key}`，认证头使用 `APIKey`，业务 key 不再额外拼接旧版 `ztadata:` 前缀。

## 控制面设计

控制面是纯静态前端，不包含后端、不做登录、不保存业务数据库。管理员在浏览器填写 `KVDB_BASE_URL` 和 `KVDB_API_KEY` 后，页面直接调用 HTTPKVDB。

首次连接或刷新时，控制面会自动初始化:

- `meta`
- `domains`
- `users`
