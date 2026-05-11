# 仓库维护

## 忽略规则

根目录 `.gitignore` 覆盖:

- `.env` 和本地环境变量文件。
- `node_modules/`。
- Vite 构建产物 `dist/`。
- EdgeOne 本地构建输出 `.tef_dist/`。
- 编辑器、系统和测试产物。

`.env.example` 和 `.edgeone/project.json` 会保留在版本库中。

## Git LFS

仓库通过 `.gitattributes` 跟踪常见二进制资产:

- 图片: `png`、`jpg`、`jpeg`、`gif`、`webp`、`avif`、`ico`
- 文档/归档: `pdf`、`zip`、`tar.gz`、`tgz`

首次使用前安装:

```bash
git lfs install
```

检查 LFS 跟踪:

```bash
git lfs track
```

## 不应提交的内容

- 真实 `.env`。
- OAuth client secret。
- HTTPKVDB API Key。
- 网关令牌加密密钥。
- `gateway-control/dist/`。
- `gateway-control/node_modules/`。

## 基础验证

边缘函数语法:

```bash
find oauth-gateway/edge-functions -name '*.js' -print -exec node --check {} \;
```

控制面构建:

```bash
cd gateway-control
npm run check
```
