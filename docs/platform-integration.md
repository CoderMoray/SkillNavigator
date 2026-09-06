# 平台集成指南（外部平台嵌入 SkillNavigator）

> 面向把 SkillNavigator 集成到现有平台（作为子页面）的外部平台开发团队。
> 状态：设计定稿 · 2026-08-19

## 1. 两种部署模式

| 模式 | 页面入口 | API 地址 | 适用 |
|---|---|---|---|
| 独立部署 | `https://skillnav.example.com/` | `https://api.skillnav.example.com` | 平台自身独立运营 |
| 嵌入部署 | `https://<host>/{brand}/` | `https://<host>/{brand}/api` | 作为某个已有平台的子页面 |

`{brand}` 前缀由构建时的 `NEXT_PUBLIC_BASE_PATH` 环境变量决定（如 `/SkillNavigator`）；页面显示名由 `BRAND_NAME` 环境变量注入（默认 `SkillNavigator`，见 `apps/web/lib/brand-name.ts`）。两者独立配置：URL 前缀只影响嵌入路径，显示名只影响界面文案。

## 2. 嵌入部署架构

```
用户浏览器
  ├─ https://aaa.bbb.com/SkillNavigator/        → Next.js Web（basePath="/SkillNavigator"）
  └─ https://aaa.bbb.com/SkillNavigator/api/*   → Nginx → 127.0.0.1:3000/*（剥前缀后转发 Fastify）
```

### 2.1 Web：环境变量驱动的 basePath

`apps/web/next.config.ts` 通过环境变量 `NEXT_PUBLIC_BASE_PATH` 注入 basePath。basePath 是 **Next.js 构建期常量**（不支持运行时按 hostname 动态解析），因此一份构建产物对应一种模式：

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",   // 唯一新增：构建期注入
  reactStrictMode: true,
  transpilePackages: ["@skill-platform/skill-spec"],
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
```

**两种模式各构建一次**：

```bash
# 独立部署：不设该变量（空串，等价于无 basePath，向后兼容）
npm run build:web

# 嵌入部署：指定子路径前缀
NEXT_PUBLIC_BASE_PATH=/SkillNavigator npm run build:web
```

- 组件内 `<Link href="/skills">`、`next/image`、`next/link` 会自动带上 basePath，**业务代码无需改动**。
- 硬编码绝对路径（如 `<img src="/xxx.png">`、字符串 URL）必须改用相对路径或组件 API，否则不会自动带前缀。

### 2.2 API：Nginx 反向代理剥前缀（推荐，应用代码零改动）

Fastify 所有路由注册在**根路径**（`/auth/*`、`/skills/*`、`/reviews/*`、`/leaderboard`、`/users/*`、`/health`）。嵌入部署时外部请求带前缀，由反向代理剥掉：

```nginx
location /SkillNavigator/api/ {
    proxy_pass http://127.0.0.1:3000/;   # 末尾 / 表示把 /SkillNavigator/api/xxx → /xxx
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 50m;             # 发布上传 zip 用，按需调整
}
```

> **为什么用代理剥前缀而不是改 Fastify？**
> 改 Fastify 需要把 `apps/api/src/server.ts` 的路由改成插件注册并加 prefix，且会连带影响 CORS、健康检查地址、CLI 默认值，成本高。代理方案对应用代码零侵入，独立/嵌入两套部署共用同一份代码。

**若选择改 Fastify 而非代理**（例如没有独立代理层）：

- 需要把 `apps/api/src/server.ts` 的路由注册改为插件形式：
  `app.register(apiPlugin, { prefix: process.env.API_BASE_PATH ?? "" })`。
- 同步影响：CORS 配置、`/health` 探测地址、CLI 的 registry 值、Nginx 不再需要 rewrite。
- **此改动会改变 API 合同（所有 URL 带前缀）**，已集成的外部方需感知。

### 2.3 生产启动命令

构建与启动均通过根目录 `package.json` 脚本（`start:web` / `start:api`）：

```bash
# 1. 构建 Web（嵌入模式：注入 basePath；独立部署：不设该变量）
NEXT_PUBLIC_BASE_PATH=/SkillNavigator npm run build:web

# 2. 启动 Web（产物为构建时注入的 basePath 对应的模式）
npm run start:web        # 即 next start --port 3001

# 3. 启动 API（Fastify）
PORT=3000 HOST=0.0.0.0 npm run start:api   # 生产必须设 HOST=0.0.0.0 才能被 Nginx/外部访问
```

- API 与 Web 是两个独立进程，需分别守护（systemd / pm2 / supervisor）。
- API 端口默认 `3000`，Web 默认 `3001`，均可通过 `PORT` / `--port` 调整。
- `apps/api` 无独立 build 步骤，`start:api` 直接以 `tsx` 运行 `src/server.ts` 源码。
- 独立部署不设 `NEXT_PUBLIC_BASE_PATH` 构建即可，两种模式共用同一套启动命令。

## 3. 外部平台为 Flask 开发时的注意事项

外部平台若使用 Flask（如 `aaa.bbb.com` 是 Flask 应用），集成 SkillNavigator 时注意以下几点。

### 3.1 集成形态选择

| 形态 | 做法 | 适用 |
|---|---|---|
| 链接跳转 | Flask 页面放入口链接，跳转 SkillNavigator 独立部署 | 最简，但非"子页面" |
| 子路径挂载（推荐） | Nginx 把 `/{brand}/*` 转发到 SkillNavigator，Flask 只管自己的路由 | 与独立部署共用同一套代码 |
| iframe 嵌入 | Flask 页面用 `<iframe src="...">` 嵌入 | 页面级嵌入，需处理 CSP/Cookie（见 3.5） |

> **核心原则**：SkillNavigator 是独立的 Next.js（Web）+ Fastify（API）服务，**不应在 Flask 进程内运行，也不应改造成 Flask 蓝图**——两个技术栈完全不同，进程内挂载会在构建、依赖、维护上互相拖累。集成层只做"路由/入口"，不做"代码合入"。

### 3.2 Werkzeug DispatcherMiddleware 已移除（易踩坑）

旧教程常把两个 WSGI 应用挂到不同路径，但 **Werkzeug 1.0（2020）已移除** `DispatcherMiddleware`：

```python
# 错误示例：Werkzeug 1.0+ 会 ImportError
from werkzeug.middleware.dispatcher import DispatcherMiddleware  # ImportError!
```

替代方案（手写 WSGI 挂载中间件）：
```python
class MountMiddleware:
    """把 target_app 挂到 /{brand}/ 下，其余请求交给 Flask app。"""

    def __init__(self, app, mount_path, target_app):
        self.app = app
        self.mount_path = mount_path.rstrip("/")
        self.target_app = target_app

    def __call__(self, environ, start_response):
        if environ["PATH_INFO"].startswith(self.mount_path + "/"):
            environ["SCRIPT_NAME"] = self.mount_path
            environ["PATH_INFO"] = environ["PATH_INFO"][len(self.mount_path):]
            return self.target_app(environ, start_response)
        return self.app(environ, start_response)
```

但**更推荐直接用 Nginx 做路径转发**（见 2.2），Flask 零改动、SkillNavigator 也无感知。

### 3.3 ProxyFix（X-Forwarded 头）

请求经过反向代理时，Flask 侧若要正确识别 `X-Forwarded-*`（生成回源 URL、跳转等），需挂 ProxyFix：

```python
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
```

> **安全提醒**：ProxyFix 无条件信任代理头，仅应在反向代理可控的环境使用；Nginx 必须设置 `X-Forwarded-Host`（见 2.2）。

### 3.4 登录体系对接

SkillNavigator 当前是**独立账号体系**（用户名/密码 + session token），**尚未实现 OAuth/OIDC SSO**：

- **当前推荐**：用户进入 SkillNavigator 子页面后独立登录（登录账号标识支持用户名或邮箱），token 存 SkillNavigator 侧 localStorage；Flask 平台只负责入口/导航，不参与鉴权。
- **SSO 共享（未来）**：若要求"Flask 登录后免登 SkillNavigator"，需 SkillNavigator 支持 OIDC/OAuth2——当前未实现。接入前先与平台方确认需求，避免返工。

### 3.5 iframe 嵌入的 CSP 与 Cookie

若采用 iframe 嵌入而非子路径挂载：

- SkillNavigator Web 需允许被外部平台 iframe 嵌入（CSP `frame-ancestors`）：
  ```nginx
  # SkillNavigator 响应头（Next.js 可通过自定义 headers 配置）
  add_header Content-Security-Policy "frame-ancestors https://aaa.bbb.com";
  ```
- token 走 localStorage 而非 Cookie，规避跨站 SameSite Cookie 被浏览器拦截的问题。
- 关注 referrer 策略，避免 iframe 内跳转泄露内部路径。

### 3.6 CORS

- Flask 页面直接 fetch SkillNavigator API 时：API 侧 CORS 需放行 Flask 域名（当前 `origin: true` 全放开，生产建议收紧）。
- 走 Nginx 同域转发（`/{brand}/api`）则天然同源，无 CORS 问题。

## 4. 外部平台集成 Checklist

对嵌入方（如 aaa.bbb.com 团队）：

- [ ] 确认反向代理：`/{brand}/api/*` 转发到 SkillNavigator API 并剥前缀
- [ ] 确认 Web basePath：构建时设 `NEXT_PUBLIC_BASE_PATH=/{brand}`
- [ ] 确认 CORS：`apps/api` 目前 `origin: true`（允许所有来源），生产建议收紧为 `aaa.bbb.com`
- [ ] 发布上传体量：Nginx `client_max_body_size` 与服务端 body limit 匹配（发布 zip 可能较大）
- [ ] 用 `curl {registry}/health` 验证连通性
- [ ] 用 CLI 验证：`skillnav config add embed --registry https://aaa.bbb.com/{brand}/api && skillnav config test embed`

## 5. CLI 侧连接方式（两种模式同一机制）

CLI 永远只连 **API base URL（registry）**，不感知模式，差异仅是 URL 是否带前缀：

```bash
# 独立平台
skillnav config add prod --registry https://api.skillnav.example.com

# 嵌入平台
skillnav config add corp --registry https://aaa.bbb.com/SkillNavigator/api

skillnav config use prod   # 切换默认平台
skillnav publish ./demo    # 发布到当前默认平台
```

> **重要**：CLI 内部 URL 拼接必须使用**字符串拼接**（`f"{registry}/skills/publish"`），不要用 `urljoin`/`new URL()`——后者会丢弃路径前缀，导致带前缀的嵌入 API 请求 404。

## 6. 品牌与路径联动

- 页面 URL 前缀：Web basePath，构建时由 `NEXT_PUBLIC_BASE_PATH` 注入（嵌入部署时与 Nginx location 保持一致）。
- 界面显示名：`BRAND_NAME` / `NEXT_PUBLIC_BRAND_NAME` 环境变量注入，默认 `SkillNavigator`；用户可见文案统一经 `{{brand_name}}` 占位符替换，**不要硬编码品牌串**。
- **变更流程**：改显示名 → 设 `BRAND_NAME` 重新构建 Web；改 URL 前缀 → 设 `NEXT_PUBLIC_BASE_PATH=/{brand}` 重新构建 Web 并同步改 Nginx location → 通知所有已配置 profile 的 CLI 用户更新 registry。

## 7. 相关文档

- [CLI 设计文档](./cli-design.md) — 命令集、退出码、输出约定
- `brand.yaml` — 品牌名唯一事实来源
- [架构总览](./architecture.md) — 系统架构
