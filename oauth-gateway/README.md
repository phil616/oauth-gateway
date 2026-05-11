# OAuth Gateway EdgeOne Project

这是实际部署到 EdgeOne Pages 的网关子项目。`edge-functions` 必须位于该子项目内部。

该子项目只包含边缘后端逻辑，不包含控制面前端。控制面位于仓库根目录的 `gateway-control/`，构建后部署为静态站点。

```text
oauth-gateway/
  .edgeone/project.json
  .env.example
  .cnb.yml
  edge-functions/
    [[path]].js
    index.js
    lib/
```

环境变量说明见仓库根目录 `README.md`、`docs/deployment.md` 和 `docs/gateway-token-keys.md`。
