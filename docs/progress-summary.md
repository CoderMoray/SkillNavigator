# 项目进度总结

**更新日期**：2026-08-19

## 概述

Skill 管理平台是一个 TypeScript npm workspaces monorepo，用于 Agent Skill 的发布、静态审查、可靠性评估、注册与分发。当前已具备完整的 API + Web + CLI + Worker 链路，强制 PostgreSQL 存储，可选 MinIO artifact，审查流水线集成 SkillSpector、VirusTotal 与 HaluCatch。

## 已完成能力

### 基础设施

- [x] Monorepo（apps/api、cli、worker、web + packages/*）
- [x] PostgreSQL 注册表（Drizzle ORM + 自动迁移，0014 版迁移）
- [x] MinIO artifact 存储（可选）
- [x] ESM + 严格 TypeScript + `@skill-platform/*` 路径别名
- [x] 本地开发：`npm run dev` 同时热重载 API（3000）与 Web（3001）

### skill-spec

- [x] SKILL.md frontmatter 解析与校验
- [x] 目录/ZIP 读取与 `SkillSnapshot` 生成
- [x] 显式 `slug` 要求与 immutable 语义
- [x] 发布 metadata 合并（`applySkillPublishMetadata`）
- [x] 发布时写入 `author`（`applySkillAuthor`，覆盖包内值为当前登录用户名）
- [x] 宽松 frontmatter 读取（`readSkillZipBufferLoose`），Web 发布时自动补全 description 等字段

### review-engine

- [x] 格式校验 findings（compliance）
- [x] 平台内置静态规则（泄露、隐私、混淆等；SkillSpector 可用时部分规则降级）
- [x] SkillSpector 集成：并行扫描、per-finding 解析、summary 持久化
- [x] **VirusTotal 集成**：
  - SHA256 hash lookup + 可选 upload-on-miss
  - `last_analysis_stats` / `last_analysis_results` 解析
  - **按 category 合并** malicious / suspicious findings（每类一条；无逐引擎明细时 aggregate fallback）
  - `threat_verdict` 解析、存储与 Web 展示
  - 与 SkillSpector 并行执行
- [x] **Verdict 拒绝规则**（`calculateReviewVerdict`）：
  - SkillSpector：`high` / `critical`；或 `medium` 且置信度 ≥ 90% → `rejected`
  - VirusTotal：`high` / `critical`（如 malicious 合并 finding）→ `rejected`
  - 其余 finding → `needs-review`；无 finding → `published`
- [x] 三维度评分结构（quality / security / reliability）

### evaluator

- [x] HaluCatch 五维静态可靠性评估
- [x] `tests/*.json` 功能性评估回退
- [x] HaluCatch report JSON 持久化

### storage

- [x] Skill / Version / Review / User CRUD
- [x] 版本 changelog、published 状态
- [x] Skill 级与版本级 unpublish
- [x] 回收站（软删除 + 定时 purge）
- [x] 书签
- [x] Contributor、Issue、Rating、榜单
- [x] Review 扩展：SkillSpector、VirusTotal（含 threat_verdict）、HaluCatch、finding confidence
- [x] **公开搜索排除 rejected**：`search()` / 榜单不返回最新版本 verdict 为 `rejected` 的 Skill
- [x] **拥有者个人中心可见 rejected**：`listRejectedSkillsForOwner` + `mergeOwnerRejectedSkills`

### API

- [x] 认证（注册/登录/登出/改密）
- [x] Skill 发布、搜索、详情、下载
- [x] 审查重跑（Worker）
- [x] 回收站 restore / purge
- [x] 书签 CRUD
- [x] 创作者主页：unpublished + **rejected** 合并展示（仅 profile owner）

### Web UI

- [x] 首页搜索与 Skill 卡片（不含 rejected Skill）
- [x] Skill 详情：审查 findings、SkillSpector 摘要、**VirusTotal 卡片**（status、stats、SHA256、threat verdict、链接）
- [x] VirusTotal finding **按 malicious / suspicious 分组合并展示**（描述列厂家、证据区汇总 Result/Method）
- [x] 详情页 **复制 prompt**（`skill-install-prompt.ts`）；Hero 保留下载与收藏
- [x] 拥有者操作区：发布新版本 / 下架 / 删除（右侧摘要卡片）；版本列表 Release / Download / 下架对齐
- [x] HaluCatch 雷达图与详情页
- [x] 发布页（Description 标签、ZIP 上传、frontmatter 自动补全、Toast 提示）
- [x] 创作者主页、榜单、审查列表；个人中心提示 rejected / 已下架仅 owner 可见
- [x] 站内文档（格式、发布流程、安全扫描、质量审查等；已同步 VT 合并展示与 rejected 可见性）

### CLI & Worker

- [x] CLI：publish、search、install、review 等
- [x] Worker：批量重审注册表 Skill

### CLI 分发（skillnav）

- [x] CLI 形态定稿为 Python `skillnav`（纯 API 客户端，审查/评估在服务端执行），设计文档 `docs/cli-design.md`
- [x] `cli-py/` 占位壳（argparse，`skillnav --version/--help`），已发布 PyPI 0.0.1（Trusted Publishing，`pipx install skillnav` 可装）
- [x] GitHub Actions `pypi.yml`：push `skillnav-*` tag 自动构建发布 + 手动 `workflow_dispatch`
- [x] 多 Profile 配置模型：`~/.config/skillnav/config.json`，支持独立部署与多个嵌入平台；URL 拼接约定（字符串拼接，禁 `urljoin`）
- [x] `brand.yaml`：品牌唯一事实来源（当前 `MonoSkillNavigator`，尚未自动同步到代码）
- [x] 平台集成指南 `docs/platform-integration.md`：两种部署模式（独立 / `/{brand}/` 子路径嵌入），Web basePath + API Nginx 剥前缀

### 仓库与品牌

- [x] GitHub 仓库已改名 `SkillNavigator`（`https://github.com/Codery/SkillNavigator.git`）
- [x] 代码内品牌引用保持 `MonoSkillNavigator` 不变，品牌名通过 `brand.yaml` 单点管理

### 测试

- [x] API 烟雾测试（`tests/smoke.test.ts`）
- [x] skill-spec 单元测试（含 loose publish 路径）
- [x] VirusTotal 单元测试（engine 解析、**分组 finding**、threat_verdict、upload 重取）
- [x] `tests/review-verdict.test.ts`（SkillSpector / VirusTotal 拒绝规则）
- [x] `tests/creator-profile-skills.test.ts`（owner profile rejected 合并）
- [x] SkillSpector、HaluCatch、license-compliance、review-score-dimensions 等

## 当前限制

| 领域 | 限制 |
| --- | --- |
| 认证 | Session 为主，无 OAuth/JWT/RBAC |
| 发现 | **rejected** 已从搜索/榜单隐藏；**默认下载仍指向 latest 版本**，尚未切换为「最新通过审查」版本 |
| 测试 | 烟雾测试未覆盖重复注册、token 过期、回收站边界等 |
| CI / VT | upload-on-miss 轮询默认 90s 超时；无分步 timeout + retry |
| CLI（skillnav） | 0.3.0：命令树已实现（Typer）；report VT 展示、全量测试、1.0.0 稳定化待完成 |
| 品牌 | `brand.yaml` 为事实来源，但尚未接入自动化同步到 Web/邮件/CLI/文档 |
| 旧 CLI | `apps/cli`（TypeScript/Commander）为内部形态，对外分发由 skillnav 取代，逐步下线 |

## 验证命令

```bash
npm run typecheck   # 全包 TypeScript 检查
npm run test        # 烟雾 + 单元测试
npm run dev         # 本地 API + Web
npm run setup       # 种子用户 + Demo Skill
```

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
| Python CLI | `cli-py/`（skillnav，PyPI） |
| PyPI 发布 | `.github/workflows/pypi.yml`（push `skillnav-*` tag 触发） |
| 品牌配置 | `brand.yaml` |
