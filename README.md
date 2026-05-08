# OAuth Gateway

基于 Tencent Cloud EdgeOne Edge Functions 的零信任网关项目。请求先进入边缘节点，只有通过 OAuth 认证并持有有效 `df_oauth_token` JWT 的用户，才能被代理到源站。

## 项目结构

```text
.
├── oauth-gateway/       # EdgeOne Pages / Edge Functions 网关项目
├── gateway-control/     # 纯静态 React 控制面
├── docs/                # 架构、数据模型、部署和安全文档
├── KVDB.md              # HTTPKVDB API 契约
└── design.md            # 设计过程和方案细节草案
```

`edge-functions` 必须位于 `oauth-gateway/` 子项目内，不能放在仓库根目录。

## 核心能力

- EdgeOne 边缘节点拦截受保护域名的所有请求。
- Cookie `df_oauth_token` 中保存网关签发的 JWT。
- JWT 验证通过后，边缘节点按 HTTPKVDB 中的域名配置回源。
- 回源请求保留原始请求头，并注入 `Host` 和 `X-ZTA-Token`。
- 未认证 HTML 请求展示登录页，点击后进入 OAuth 2.1 授权码 + PKCE 流程。
- 控制面是无状态静态前端，浏览器直连 HTTPKVDB 管理域名、用户和许可。
- HTTPKVDB 是唯一权威持久化数据源，业务 key 固定使用 `ztadata:*`。

## 文档

| 文档 | 内容 |
|---|---|
| [技术架构](docs/architecture.md) | 组件、请求路径、边缘函数结构 |
| [KVDB 数据模型](docs/kvdb-schema.md) | `ztadata:*` key、初始化数据、域名/用户/许可结构 |
| [OAuth 和 JWT 流程](docs/oauth-flow.md) | OAuth discovery、PKCE、JWT payload 和验证规则 |
| [部署和运行](docs/deployment.md) | Edge 环境变量、控制面构建、源站要求 |
| [安全边界](docs/security.md) | 已实现控制、部署要求、当前限制 |
| [仓库维护](docs/repository.md) | `.gitignore`、Git LFS、验证命令 |
| [HTTPKVDB 契约](KVDB.md) | HTTPKVDB API 调用规范 |

## 快速开始

### 1. 配置 Edge 网关

```bash
cp oauth-gateway/.env.example oauth-gateway/.env
```

生产环境应在 EdgeOne 控制台配置环境变量，不要提交 `.env`。

必需变量:

| 变量 | 说明 |
|---|---|
| `KVDB_BASE_URL` | HTTPKVDB 服务地址 |
| `KVDB_API_KEY` | 网关读取 KVDB 的 API Key |
| `GATEWAY_JWT_SECRET` | HS256 网关 JWT 签名密钥 |
| `OAUTH_TX_SECRET` | OAuth transaction cookie 签名密钥 |
| `ORIGIN_ZTA_TOKEN` | 默认源站回源密钥 |
| `OAUTH_ISSUER_URL` | OAuth/OIDC issuer 地址 |
| `OAUTH_CLIENT_ID` | OAuth client id |
| `OAUTH_CLIENT_SECRET` | OAuth confidential client secret，public client 可留空 |

OAuth endpoint 由边缘函数读取 well-known metadata 获取。也可以通过 `OAUTH_DISCOVERY_URL` 显式指定 discovery 地址。

### 2. 启动控制面

```bash
cd gateway-control
npm install
npm run dev
```

控制面不需要后端服务。管理员在页面填写:

- `KVDB_BASE_URL`
- `KVDB_API_KEY`

首次连接会自动初始化:

- `ztadata:meta`
- `ztadata:domains`
- `ztadata:users`

### 3. 配置业务数据

在控制面中依次配置:

1. 受保护域名。
2. 源站 IP 和回源 Host。
3. 用户邮箱。
4. 用户到域名的访问许可。

边缘网关认证通过后，会读取 `ztadata:domain:{host}`、`ztadata:origin:{origin_id}`、`ztadata:access:domain:{host}` 完成授权和回源。

## 验证

边缘函数语法检查:

```bash
find oauth-gateway/edge-functions -name '*.js' -print -exec node --check {} \;
```

控制面构建检查:

```bash
cd gateway-control
npm run check
```

## 仓库规则

- 根目录 `.gitignore` 已忽略 `.env`、`node_modules/`、`dist/` 和 EdgeOne 本地输出。
- 根目录 `.gitattributes` 已配置 Git LFS 跟踪常见二进制文件。
- 真实密钥、API Key、OAuth secret、JWT secret 不应提交。

