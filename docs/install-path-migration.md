# 安装脚本路径迁移：`/install.sh` → `/install`

**状态**：已落地（`56e2d57`、`40c277d`）
**影响面**：Web 部署（`apps/web`）；不涉及 CLI 包（PyPI）与 API

## 背景

部分云 WAF（实测阿里云）会对所有 `.sh` 结尾的请求路径**一律返回 405**，与文件是否存在无关：

| 请求 | 结果 |
|---|---|
| `{webRoot}/install.sh`（存在） | 405（WAF 拦截页） |
| `{webRoot}/foo.sh`（不存在） | 405（同样被拦） |
| `{webRoot}/icon.svg` | 200 |
| `{webRoot}/foo.txt` | 404（正常，未被拦） |

因此首页与「设置 → API 密钥」页展示的 `curl -fsSL {webRoot}/install.sh | bash` 在生产环境完全不可用。

## 变更内容

- 公开路径改为 **`{webRoot}/install`**（无扩展名）；源码文件名保持 `usage/install.sh`（内部文件，不对外）
- 支持构建时环境变量 **`NEXT_PUBLIC_CLI_INSTALL_PATH`** 覆盖（默认 `/install`），供其它 WAF 规则自行选择路径；同步脚本跟随同一变量，路径与产物不会脱节
- 同步脚本会把 `usage/install.sh` 输出为 `apps/web/public/<name>`，并主动清理旧的 `public/install.sh`
- 为无扩展名文件声明 `Content-Type: text/x-shellscript; charset=utf-8`：否则 Next 的 mime 猜测会给出 `application/x-install-instructions`（`curl | bash` 不受影响，但浏览器与中间层会更规范）

## 部署方升级步骤

1. 拉取最新 `main`
2. **重新构建 Web**（必须，不能只重启）：`npm run build:web`（或既有的构建/发布流程）
3. 重启 / 发布 Web 服务

> 为什么必须重建：新路径的静态文件与 Content-Type 声明都是**构建期产物**。只重启不重建会继续使用服务器上的旧文件，新路径 404。

## 验收

```bash
# 1) 新路径应取到脚本（首行应为 #!/usr/bin/env bash）
curl -fsSL {webRoot}/install | head -3

# 2) 旧路径应为 404（此前在受影响实例上是 WAF 的 405）
curl -s -o /dev/null -w "%{http_code}\n" {webRoot}/install.sh
```

## 用户侧变化（无需人工操作）

- 首页与「设置 → API 密钥」页的一键命令自动变为 `curl -fsSL {webRoot}/install | bash`
- 站内安装文档 `/usage/skillnavigator.md` 已同步更新

## 常见问题

**需要改 WAF / Nginx / Istio 配置吗？**
不需要。根因是 URL 后缀，新路径不含 `.sh`，网关侧无需任何调整。

**可以换成别的路径吗？**
可以：设置 `NEXT_PUBLIC_CLI_INSTALL_PATH`（例如 `/cli-get` 或 `/install.txt`）后**重新构建**；同步脚本会跟随同一变量生成对应文件。

**旧路径还兼容吗？**
不兼容。生产上它本来就不通（405），新部署后 `/install.sh` 返回 404。

## 相关代码位置（维护者）

| 位置 | 作用 |
|---|---|
| `apps/web/lib/registry-install-guide.ts` | 路径常量与 env 解析（所有安装 URL / curl 命令的拼装源） |
| `apps/web/next.config.ts` | `NEXT_PUBLIC_CLI_INSTALL_PATH` 注入 + Content-Type header |
| `scripts/sync-usage-public.mjs` | 同步 `usage/install.sh` → `apps/web/public/<name>`，清理旧文件 |
| `apps/web/components/ApiKeysPanel.tsx` | API 密钥页展示的一键安装命令 |
| `usage/install.sh`、`usage/skillnavigator.md` | 脚本自引用与安装文档示例 |
| `tests/registry-install-guide.test.ts` | URL/curl 断言 + 路径覆盖用例 |
