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
| `KVDB_API_KEY` | 网关读取 KVDB 的 API Key |
| `GATEWAY_JWT_SECRET` | 网关 JWT HS256 签名密钥 |
| `OAUTH_TX_SECRET` | OAuth transaction cookie 签名密钥 |
| `ORIGIN_ZTA_TOKEN` | 默认回源密钥 |
| `OAUTH_ISSUER_URL` | OAuth/OIDC issuer |
| `OAUTH_CLIENT_ID` | OAuth client id |
| `OAUTH_CLIENT_SECRET` | confidential client secret |

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

控制面首次连接会自动初始化 `ztadata:meta`、`ztadata:domains`、`ztadata:users`。随后在控制面新增:

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

