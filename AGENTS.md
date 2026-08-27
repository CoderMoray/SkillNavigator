# Skill 管理平台

## 项目概述

这是一个 TypeScript npm workspaces monorepo，用于发布、审查、评估、分发和管理 Agent Skill。

- Skill 包以 `SKILL.md` 为入口，可从文件夹或 `.zip` 读取。
- `slug` 是 Skill 不可变的唯一标识，用于数据库主键、API/CLI 参数、URL 和 MinIO 对象路径。
- `name` 是可变的展示名称；不要将其作为查找键、外键或路由参数。
- 审查覆盖合规、泄露、隐私、安全和轻量功能性评估；平台不会执行 Skill 内的脚本。

## 仓库结构

```text
apps/
  api/       Fastify HTTP API
  cli/       Commander CLI
  worker/    批量重审/评估 Worker
  web/       Next.js Web UI（端口 3001）
packages/
  skill-spec/     SKILL.md 解析、校验、快照与 ZIP
  review-engine/  静态风险审查与评分
  evaluator/      tests/*.json 功能性评估
  storage/        PostgreSQL 注册表 + MinIO artifact
docs/
  rules/          Skill 规范与审查规则
examples/
  demo-skill/     可用于本地验证的 Skill
```

## 关键架构约定

- 所有包均使用 ESM、严格 TypeScript；共享包通过 `@skill-platform/*` 路径别名导入。
- API 是应用和 Web 的唯一数据入口；Web 不直接访问 PostgreSQL 或 MinIO。
- 强制 PostgreSQL，无 JSON 文件模式。`DATABASE_URL` 必须配置。
- 表定义：`packages/storage/src/schema/*.ts`（Drizzle ORM，纯 TypeScript）。
- 迁移 SQL：`packages/storage/drizzle/*.sql`（`drizzle-kit generate` 生成，需提交 Git）。
- 首次启动 API 自动执行迁移，已执行记录在 `_migrations` 表，不会重复跑。
- 发布与下载 artifact 使用 ZIP；开启 MinIO 时，artifact descriptor 存在 PostgreSQL，包文件存在 MinIO。
- API 合同或存储类型变更时，同步检查 `apps/api`、`apps/cli`、`apps/web/lib/types.ts` 和 `apps/web/lib/api.ts`。

## 常用命令

```bash
npm install             # 安装依赖
npm run dev             # 同时启动前后端（热重载）
npm run setup           # 安装 SkillSpector（PyPI 或 GitHub）并写入种子数据
npm run setup:skillspector  # 仅安装 SkillSpector Python 依赖
npm run test            # 8 个 API 烟雾测试
npm run typecheck       # TypeScript 编译检查
npm run build:web       # 构建 Web；嵌入子路径时：NEXT_PUBLIC_BASE_PATH=/xxx npm run build:web
npm run infra:up        # Docker 备选（PostgreSQL + MinIO）

# 改表结构
npx drizzle-kit generate   # 生成迁移 SQL
npx drizzle-kit migrate    # 执行迁移
```

## 配置与本地运行

1. 从 `.env.example` 创建 `.env`，设置 `DATABASE_URL`。
2. `skill_platform` 库必须已存在（`createdb skill_platform` 或 Docker）。
3. 可选：启用 MinIO（`MINIO_ENABLED=true`），本地默认端口 `9000`。
4. Web 通过 `NEXT_PUBLIC_API_URL` 访问 API，默认 `http://127.0.0.1:3000`。

## 开发与验证要求

- 修改 `SKILL.md` 规范时，同时更新 `docs/rules/skill-spec.md`、示例包和必要的审查逻辑。
- 新发布的 Skill 必须提供显式 `slug`。
- 改表结构必须走 Drizzle 迁移流程：改 `schema/*.ts` → `generate` → `migrate`。
- 修改 API 路由、响应或标识语义后，更新 CLI、Web 路由和 README。
- 改代码后验证：
 1. `npm run typecheck` — TypeScript 编译检查，零报错
 2. `npm run test` — API 烟雾 + 单元测试
 3. `npm run skillnav:test` — skillnav CLI pytest（`tests/skillnav/`，集成测试需本地 API）
- 不要提交 `.env`、凭证、token、数据库备份或 MinIO 导出文件。
