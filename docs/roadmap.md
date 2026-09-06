# 路线图与进度

**更新日期**：2026-09-07

> 本文件由原 `roadmap.md` 与 `progress-summary.md` 合并而成，是项目**阶段目标、进度与待办的唯一事实源**。
> 架构见 [architecture.md](./architecture.md)，开发规则与验证门槛见 [DEV.md](./DEV.md)。

---

## 阶段总览

| 阶段 | 主题 | 状态 |
| --- | --- | --- |
| Phase 0 | 核心规范与静态审查 | ✅ 完成 |
| Phase 1 | API / CLI / 注册表 | ✅ 完成 |
| Phase 1.5 | Web UI + PostgreSQL + MinIO | ✅ 完成 |
| Phase 2 | 外部扫描集成与安全增强 | ✅ 完成（静态链路；遗留 VT 分步超时策略） |
| Phase 3 | 社区、治理与规模化 | 🔄 进行中（账号体系基线已交付） |

---

## 已完成能力

### 基础设施

- [x] Monorepo（apps/api、cli、worker、web + packages/* + cli-py）
- [x] PostgreSQL 注册表（Drizzle ORM + 自动迁移）
- [x] MinIO artifact 存储（可选）
- [x] ESM + 严格 TypeScript + `@skill-platform/*` 路径别名
- [x] 本地开发：`npm run dev` 同时热重载 API（3000）与 Web（3001）

### 质量门槛（2026-09 新增）

- [x] **ESLint 零告警门槛**：flat config，lint 链含 `--max-warnings=0`（`no-explicit-any`、effect 内同步 `setState` 等债务已全部清零）
- [x] **typecheck 覆盖修复**：root tsc + web workspace tsc 串联，App Router 页面不再漏检
- [x] **测试自动编排**：`npm run test:smoke`（自动拉起 API）、`npm run test:e2e`（Playwright `webServer` 自动拉起 API + Web）
- [x] Python CLI 质量检查：ruff + mypy（`npm run skillnav:lint`）
- [x] 开发规则文档 `docs/DEV.md`

### skill-spec

- [x] SKILL.md frontmatter 解析与校验；显式 `slug` 与 immutable 语义
- [x] 目录/ZIP 读取与 `SkillSnapshot` 生成
- [x] 发布 metadata 合并（`applySkillPublishMetadata`）；发布时写入 `author`
- [x] 宽松 frontmatter 读取（`readSkillZipBufferLoose`），Web 发布时自动补全 description 等字段

### review-engine

- [x] 格式校验 findings（compliance）与平台内置静态规则
- [x] SkillSpector 集成：并行扫描、per-finding 解析、summary 持久化
- [x] VirusTotal 集成：SHA256 lookup + 可选 upload-on-miss、按 category 合并 malicious/suspicious findings、`threat_verdict` 解析与展示
- [x] Verdict 拒绝规则（`calculateReviewVerdict`）：SkillSpector `high`/`critical`（或 `medium` 且置信度 ≥ 90%）、VT `high` → `rejected`；扫描/评估未完成亦拒绝（详见 [rules/review-rubric.md](./rules/review-rubric.md)）
- [x] 三维度评分结构（quality / security / reliability）

### evaluator

- [x] HaluCatch 五维静态可靠性评估 + `tests/*.json` 回退；report JSON 持久化

### storage

- [x] Skill / Version / Review / User CRUD、changelog、Skill 级与版本级 unpublish
- [x] 回收站（软删除 + 定时 purge）、书签
- [x] Contributor、Issue、Rating、榜单
- [x] 公开搜索/榜单排除 `rejected`；拥有者个人中心合并展示（`listRejectedSkillsForOwner`）

### API 与账号体系

- [x] 认证：注册 / 登录 / 登出 / 改密 / 忘记密码 / **邮箱验证（可选，默认关闭）**
- [x] **API Keys**（`/auth/api-keys`，供 skillnav 等外部客户端）
- [x] 账户设置（`/account/settings/*`：资料 / API 密钥 / 改密 / 注销；旧路径重定向）
- [x] Skill 发布、搜索、详情、下载、审查重跑、回收站 restore/purge

### Web UI

- [x] 首页搜索、Skill 详情（审查 findings、SkillSpector/VirusTotal 摘要、HaluCatch 雷达图、复制 prompt）
- [x] 发布页（ZIP 上传、metadata 自动补全）、创作者主页、榜单、审查列表
- [x] 拥有者操作区（发布新版本 / 下架 / 删除）；rejected / 已下架仅 owner 可见
- [x] 站内文档（8 篇）

### CLI 与分发（skillnav）

- [x] Python `skillnav`（typer，纯 API 客户端）：config/login/whoami/publish/report/status/search/top/info/download/install/rate/issue 等 22 个子命令，`--json` 全覆盖
- [x] PyPI 已发布至 **0.3.1**（Trusted Publishing，push `skillnav-*` tag 触发）
- [x] 多 Profile 配置（`~/.config/skillnav/config.json`），支持独立部署与多平台嵌入

### 品牌与集成

- [x] GitHub 仓库 `CoderMoray/SkillNavigator`
- [x] **品牌机制**：`BRAND_NAME` / `NEXT_PUBLIC_BRAND_NAME` 环境变量注入（默认 `SkillNavigator`），`{{brand_name}}` 占位符替换；prebuild 自动同步 usage 产物
- [x] 平台集成指南（独立部署 / 子路径嵌入，basePath 构建注入 + Nginx 剥前缀）

---

## 当前限制

| 领域 | 限制 |
| --- | --- |
| 认证 | Bearer token + API Key；无 OAuth/JWT/RBAC |
| 发现 | **默认下载仍指向 latest 版本**，尚未切换为「最新通过审查」版本 |
| 测试 | smoke 未覆盖重复注册、token 过期、回收站边界等 |
| CI / VT | upload-on-miss 轮询默认 90s 超时；无分步 timeout + retry |
| CLI（skillnav） | 0.3.1：report VT 展示、1.0.0 稳定化待完成 |
| 旧 CLI | `apps/cli`（TypeScript/Commander）为内部形态，逐步下线 |

---

## 待办工作

### P1 — 审查与安全

- [ ] VirusTotal API 分步 timeout + retry（hash lookup / upload / poll / re-fetch 各步独立超时 + 重试一次，失败写入 review summary）
- [ ] **默认下载指向最新通过审查版本**

### P2 — Web UX

- [ ] 审查列表全选导出 + 二次确认 + 交付方式（本地下载 vs 邮件，需产品确认）
- [ ] 回收站「立即删除」二次确认改为居中 Toast

### P3 — CLI、账号与治理

- [ ] skillnav 1.0.0 稳定化（冻结命令集、错误处理 polish）；下线 `apps/cli`
- [ ] 品牌名（BRAND_NAME）同步覆盖邮件与 CLI 文案
- [ ] 管理者 / 普通用户权限隔离（RBAC 首期）；JWT / OAuth 登录
- [ ] Contributor 邀请邮件（被邀请人接受后生效）+ 用户名实时检索下拉
- [ ] 阿里云邮箱接入 + 发布成功通知
- [ ] 将 Worker 替换为 Redis/BullMQ 队列消费者；隔离队列中加入动态评估
- [ ] Web 管理台、MCP Server、CI/CD 插件、多源同步

---

## 关键文件索引

| 领域 | 路径 |
| --- | --- |
| 审查入口 / verdict | `packages/review-engine/src/index.ts` |
| VirusTotal | `packages/review-engine/src/virustotal.ts` |
| VT 存储 | `packages/storage/src/virustotal-review.ts` |
| 搜索 / rejected 过滤 | `packages/storage/src/store/postgres.ts` |
| Creator 合并 | `packages/storage/src/creators.ts` |
| 发布 API | `apps/api/src/server.ts` |
| Skill 详情 Web | `apps/web/app/skills/[name]/page.tsx` |
| 安装 prompt | `apps/web/lib/skill-install-prompt.ts` |
| Web 帮助文档 | `apps/web/content/docs/` |
| 迁移 | `packages/storage/drizzle/` |
| CLI 设计 | `docs/cli-design.md` |
| 平台集成指南 | `docs/platform-integration.md` |
| Python CLI | `cli-py/`（skillnav，PyPI）；测试 `tests/skillnav/` |
| PyPI 发布 | `.github/workflows/pypi.yml`（push `skillnav-*` tag 触发） |
| 品牌机制 | `apps/web/lib/brand-name.ts`（`BRAND_NAME` 环境变量注入） |

---

## 参考

- [architecture.md](./architecture.md) — 架构与数据流
- [DEV.md](./DEV.md) — 开发规则与验证门槛
- [AGENTS.md](../AGENTS.md) — 仓库约定
- [docs/rules/](./rules/) — Skill 规范、审查规则与社区规则
