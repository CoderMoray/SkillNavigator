# Skill 管理平台

可信 Skill 注册、审查、评分和分发平台。已交付 API、Web UI、Python CLI（skillnav）、Worker、静态审查引擎与站内文档；详细进度见 [docs/progress-summary.md](./docs/progress-summary.md)。

## 当前能力

- 读取本地 Skill 目录或 zip 包并生成内容快照。
- 校验 `SKILL.md` frontmatter 和目录结构。
- 提供质量、安全和可靠性三个独立评分维度，不计算综合分：质量由平台规则汇总合规与文档质量，安全由 SkillSpector 静态扫描与 VirusTotal hash 查毒生成。
- 使用内置 HaluCatch 对每个发布包进行五维静态可靠性评估：地基、代码风险、规则、护栏与复杂度；无 Python 运行时时回退到 `tests/*.json` 任务集检查。
- 登录后发布 Skill 到本地注册表，上传内容会绑定发布用户。
- 搜索、查看、下载 zip 包和安装 Skill；**rejected** 版本从公开搜索与榜单隐藏，创作者个人中心仍可见。
- contributor、issue、rating、榜单等社区协作能力，支持多个 contributor 共同维护同一个 Skill。
- 用户注册、登录、登出、当前用户查询、密码修改、忘记密码/重置密码；可选邮箱验证（本地默认关闭）。
- 账户设置（`/account/settings/*`）：个人资料、API 密钥、修改密码、注销账户；旧路径自动重定向。
- Web 站内文档（8 篇）：格式规范、发布流程、CLI 指南、平台 Agent 系统提示词、安全扫描与 HaluCatch 审查等。
- **skillnav** Python CLI（PyPI 分发）：搜索、发布、审查、下载等；Web 创建 API 密钥后 `skillnav login --api-key sk_...`。
- Worker 支持重跑注册表审查。
- PostgreSQL 注册表存储与 MinIO Skill artifact 对象存储（可选）。

## 快速开始

```bash
npm install              # 安装依赖（首次）
cp .env.example .env     # 配置环境变量（DATABASE_URL 等）
npm run infra:up         # 可选：Docker 启动 PostgreSQL + MinIO（端口见 .env.example）
npm run dev              # 同时启动 API（3000）+ Web（3001），前后端均热重载
npm run setup            # 安装 SkillSpector + 写入种子用户与 Demo Skill
```

然后打开 `http://127.0.0.1:3001`，用 `alice / password123` 登录。

**skillnav CLI**（需 Python 3.9+）：

```bash
pip install skillnav -i https://mirrors.aliyun.com/pypi/simple/    # 或 pip install -e "cli-py[dev]"
# Web → 设置 → API 密钥 创建密钥后：
skillnav login --api-key sk_...
skillnav search demo
skillnav info demo-skill
```

CLI 详细流程见 Web `/docs/cli-developer-guide`；Agent 专用命令参考见 `examples/skillnav-skill/`。

## 数据库

项目强制使用 PostgreSQL，表结构通过 Drizzle ORM 管理。

```bash
# 本机启动（需先安装 PostgreSQL 并创建 skill_platform 库）
createdb skill_platform

# 或用 Docker（推荐与 .env.example 中 DATABASE_URL 端口一致）
npm run infra:up

# 首次启动 API 会自动执行迁移建表
npm run dev:api

# 手动跑迁移
npx drizzle-kit generate   # 改 schema 后生成 SQL
npx drizzle-kit migrate    # 执行迁移
```

**表定义**：`packages/storage/src/schema/*.ts`（TypeScript，Drizzle 语法）  
**迁移 SQL**：`packages/storage/drizzle/*.sql`（自动生成，需提交 Git）  
**迁移追踪**：`_migrations` 表，已执行的迁移不会重复跑

`skills.slug` 是稳定唯一标识，`skills.name` 是展示名称。

## HaluCatch 可靠性评估

发布、`POST /evaluations/run`、`POST /reviews/run` 和 Worker 重审都会调用
`packages/halucatch-1.8.8`。平台先将上传快照写入临时目录，再仅运行 HaluCatch
自身的静态扫描器；**不会执行 Skill 包中的任何脚本**，也不会将 HaluCatch 报告写回
Skill artifact。

- 需要 Python 3.8+；Windows 默认调用 `python`，Unix 默认调用 `python3`。
- 可用 `HALUCATCH_PYTHON` 指定解释器、`HALUCATCH_DIR` 指定 HaluCatch 目录、
  `HALUCATCH_TIMEOUT_MS` 调整超时（默认 30 秒）。
- 设定 `HALUCATCH_ENABLED=false` 可临时禁用 HaluCatch，改用原有 `tests/*.json`
  静态任务集评估。

## 测试

```bash
npm run typecheck      # 全包 TypeScript 编译检查
npm run test           # Vitest：API 烟雾 + 单元测试（review-engine、auth、VT 等）
npm run test:watch     # watch 模式，改代码自动重跑
npm run skillnav:test  # skillnav CLI pytest（tests/skillnav/，集成测试需本地 API）
npm run test:e2e       # Playwright 浏览器端到端测试（e2e/site.e2e.ts，3 个串行用例）
```

**E2E 前置条件**（`test:e2e`）：

1. 本地 API、Web、PostgreSQL 与 MinIO 已运行（例如 `npm run infra:up` + `npm run dev` + `npm run setup`）。
2. 本机已安装 **Chrome**（Playwright 使用 `channel: "chrome"`）。
3. 种子用户可登录（默认 `alice` / `password123`，可通过 `E2E_USERNAME`、`E2E_PASSWORD` 覆盖）。

**E2E 覆盖范围**（路由冒烟 + 浅层登录态，非完整业务回归）：

- 首页榜单 API 失败时的错误展示（mock 503）。
- 公开页、动态详情（Skill / Creator）、8 篇文档、登录/注册/找回密码等 guest 路由。
- 登录后账户设置（profile / API 密钥 / 改密 / 注销）、发布页上传与 `?skill=` 新版本页。

可选环境变量：`E2E_BASE_URL`（默认 `http://127.0.0.1:3001`）、`E2E_API_BASE_URL`（默认 `http://127.0.0.1:3000`）。

本地开发若需跳过注册邮箱验证，在 `.env` 中设置 `REGISTRATION_EMAIL_VERIFICATION_REQUIRED=false`（`.env.example` 默认已是 false）。

## 目录

- `docs/architecture.md`：架构设计。
- `docs/progress-summary.md`：当前进度与限制。
- `docs/platform-integration.md`：独立部署与子路径嵌入。
- `docs/cli-design.md`：skillnav CLI 设计。
- `docs/rules/skill-spec.md`：Skill 包规范。
- `docs/rules/review-rubric.md`：审查与评分规则。
- `packages/skill-spec`：Skill 解析、校验、快照、安装。
- `packages/evaluator`：HaluCatch 五维可靠性评估，及任务集回退评估。
- `packages/review-engine`：审查规则引擎（含 SkillSpector、VirusTotal）。
- `packages/storage`：注册表存储（PostgreSQL + Drizzle ORM），支持 MinIO artifact。
- `apps/api`：HTTP API。
- `apps/cli`：内部 TypeScript CLI（逐步由 skillnav 取代）。
- `apps/worker`：审查 Worker。
- `apps/web`：Next.js Web UI（Skill 广场、详情、审查报告、HaluCatch、社区、榜单、账户设置、站内文档）。
- `cli-py/`：对外 Python CLI **skillnav**（PyPI 发布，见 `.github/workflows/pypi.yml`）。
- `examples/demo-skill/`：本地验证用 Demo Skill。
- `examples/skillnav-skill/`：Agent 专用 CLI 命令参考 Skill。

## API（节选）

- `GET /health`
- `POST /auth/register`、`POST /auth/login`、`POST /auth/logout`、`GET /auth/me`
- `POST /auth/change-password`、`POST /auth/forgot-password`、`POST /auth/reset-password`
- `POST /auth/verify-email`、`POST /auth/resend-verification`
- `GET /auth/api-keys`、`POST /auth/api-keys`、`DELETE /auth/api-keys/:keyId`
- `GET /skills?query=demo`
- `POST /skills/publish`（`Authorization: Bearer <token>` 或 API 密钥，可传 `archiveBase64`）
- `POST /reviews/run`、`POST /evaluations/run`、`POST /reviews/rebuild`
- `GET /leaderboard?sort=reliability`
- `GET /creators`、`GET /creators/:username`
- `GET /skills/:slug`
- `POST /skills/:slug/contributors`、`POST /skills/:slug/issues`、`GET /skills/:slug/issues`
- `POST /skills/:slug/ratings`
- `GET /skills/:slug/versions/:version`、`GET /skills/:slug/versions/:version/download`（`application/zip`）

## skillnav 发布（PyPI）

维护者在 `cli-py/pyproject.toml` 更新版本号后：

```bash
git tag skillnav-0.3.0
git push origin skillnav-0.3.0
```

推送 `skillnav-*` tag 会触发 `.github/workflows/pypi.yml` 构建并发布到 PyPI（Trusted Publishing / OIDC）。也可在 GitHub Actions 手动 `workflow_dispatch`。

## 协作开发

```bash
# 避免不同系统/不同 npm 版本导致的文件权限污染 Git diff
git config core.fileMode false
```

提交规范：一个 commit 做一件事，message 清晰即可。

改代码后建议验证：`npm run typecheck` → `npm run test` → `npm run skillnav:test`（改 CLI 时）→ `npm run test:e2e`（改 Web 路由/UI 时）。

Maintainers: [@chrismoray](https://github.com/chrismoray) [@JShiu0915](https://github.com/JShiu0915)

## 后续方向

- 将 Worker 替换为 Redis/BullMQ 队列消费者。
- 默认下载指向「最新通过审查」版本，而非 latest 上传版本。
- skillnav 1.0.0 稳定化；`brand.yaml` 自动同步到 Web/邮件/CLI。
- 在隔离队列 Worker 中加入需要实际执行 Agent 的动态评估。
- 增加 Web 管理台、MCP Server、CI/CD 插件和多源同步。
