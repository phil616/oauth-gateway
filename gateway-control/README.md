# Gateway Control

纯静态 React/Vite 控制面。页面不需要专用后端服务，也没有登录体系。用户在浏览器里填写:

- `KVDB_BASE_URL`
- `KVDB_API_KEY`

前端会直接调用 HTTPKVDB 的 `/v1/kv/*`、`/readyz`、`/healthz` 接口来管理数据。`KVDB_BASE_URL` 和 `KVDB_API_KEY` 会保存在当前浏览器的 localStorage，便于下次打开时直接进入控制台；用户可以点击右上角“清除凭据”删除本地保存的数据。

本控制面固定管理 `ztadata` 数据空间前缀。所有业务 key 都写入 `ztadata:*`，不提供 userspace 或应用空间切换能力。

首次连接或刷新时，控制面会自动初始化基础索引 key:

- `ztadata:meta`: 固定命名空间和 schema 版本元数据。
- `ztadata:domains`: 域名列表索引，初始为空数组。
- `ztadata:users`: 用户列表索引，初始为空数组。

## 启动开发

```bash
npm install
npm run dev
```

## 构建静态文件

```bash
npm run build
```

构建产物在 `dist/`，可以部署到任意静态托管，也可以直接用 `npm run preview` 预览。

## 可选配置

```bash
cp .env.example .env
```

`.env` 只支持设置 `VITE_DEFAULT_KVDB_BASE_URL`，用于在连接表单里预填 KVDB 地址。`KVDB_API_KEY` 不写入 `.env`，由用户在页面中填写。

## 功能

- 域名库 CRUD: `ztadata:domains`、`ztadata:domain:{host}`、`ztadata:origin:{origin_id}`、`ztadata:access:domain:{host}`。
- 用户库 CRUD: `ztadata:users`、`ztadata:user:{email}`、`ztadata:access:user:{email}`。
- 用户域名许可: 同步维护 `ztadata:access:user:{email}` 和 `ztadata:access:domain:{host}`。
- KVDB 查询: 只读查询 `ztadata:*` 原始 key 内容，仅调用 GET/HEAD，不提供修改入口。
- 状态检查: HTTPKVDB `readyz`、`healthz`、基础索引 key 和单域名配置完整性检查。

## 浏览器直连要求

HTTPKVDB 必须允许该静态控制台所在 Origin 的 CORS 请求，并允许以下方法和头:

```text
Methods: GET, HEAD, PUT, DELETE, POST
Headers: Authorization, Content-Type, Accept, X-KV-Op, X-KV-Key, X-KV-Op-Id
```

安全边界由 `KVDB_API_KEY` 决定。任何拿到该 API Key 的人都能按该 Key 的权限读写 HTTPKVDB。公共电脑或共享浏览器使用后应点击“清除凭据”。
