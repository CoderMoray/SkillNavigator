# MonoSkillNavigator 介绍

MonoSkillNavigator（Skill 管理平台）是一个用于 **发布、审查、评估、搜索和下载** Agent Skill 的注册中心。Skill 以 `SKILL.md` 为入口的文件夹或 ZIP 包形式分发，平台为每个 Skill 分配不可变的 **slug**，并保留完整的版本历史与审查记录。

## 适合谁使用

- **Skill 作者**：打包 Skill、填写元数据、发布新版本，并在详情页查看安全与质量结果。
- **团队与使用者**：在安装或引用 Skill 前，通过审查结论、HaluCatch 雷达与 SkillSpector finding 判断是否可信。
- **集成方**：通过 HTTP API 或 CLI 搜索、拉取 ZIP、触发重审（与 Web 共用同一套后端）。

## 核心概念

| 概念 | 说明 |
| --- | --- |
| **slug** | Skill 的唯一标识，用于 URL、API 与存储；发布后不应随意更改。 |
| **name** | 展示名称，可随版本更新。 |
| **version** | 语义化版本（SemVer），同一 slug 下每个版本不可变。 |
| **审查（review）** | 发布时对包格式、SkillSpector、VirusTotal（可选）与合规 finding 的记录。 |
| **评估（evaluation）** | 默认由 HaluCatch 对包做五维静态质量检查；环境未配置时可回退到 `tests/*.json` 任务集。 |

## 你在 Web 上能做什么

1. **浏览与搜索**：首页、Skill 列表、榜单（下载量、评分、最新等）；**不包含** 最新版本审查结论为 **已拒绝** 的 Skill。
2. **查看详情**：Skill 说明、文件树、版本切换、审查与评估、评分与 Issue；可 **下载** 或 **复制 prompt** 供 AI 安装。
3. **发布**：登录后上传 ZIP 或文件夹，填写分类与版本信息（见 [发布流程](./publish-workflow.md)）。
4. **个人中心**：登录后访问 `/creators/<用户名>`；Skill **拥有者** 在此可看到 **已拒绝** 与 **已下架** 的 Skill（他人不可见），便于管理私有或未通过审查的版本。
5. **审查中心**：聚合各 Skill 最新版本的 finding 与 HaluCatch 雷达对比。
6. **下载与安装**：按 slug + 版本下载 ZIP；或使用 **复制 prompt** 将安装说明粘贴给 AI 助手代为安装。
7. **协作**：Skill **所有者** 可在详情页添加 **contributor**（仅 contributor 角色，可协助发版；添加 contributor 仅 owner 可操作）。

## 审查与评分如何理解

平台 **不** 向用户展示单一的「综合安全分」或「综合质量分」作为主结论，而是：

- **安全**：以 SkillSpector 的 **包级风险分 / 风险等级 / 安装建议**、VirusTotal 检出摘要与 **按类别合并的 finding**（malicious / suspicious 各至多一条）为准（见 [安全检测](./security-scan.md)）。
- **质量**：以 **HaluCatch 五维雷达** 与 Markdown 报告为准（见 [质量审查](./halucatch-review.md)）。
- **发布状态（verdict）**：**已发布** 表示无 finding；**需复核** 表示有 finding 但未触发 SkillSpector/VirusTotal 自动拒绝；**已拒绝** 表示命中 high 级或 SkillSpector 高置信度 medium 规则，且 **不会出现在公开搜索**（拥有者仍可在个人中心看到，详见 [发布流程](./publish-workflow.md)）。若审查流水线未完成（如 VirusTotal 超时），版本 **不会入库**，需在发布页重试。

## 技术说明（简要）

- Web（默认端口 **3001**）仅通过 API 访问数据，不直连数据库或对象存储。
- 可选 **PostgreSQL** 持久化注册表；可选 **MinIO** 存储 Skill ZIP。
- 平台 **不会执行** Skill 包内脚本；SkillSpector 与 HaluCatch 均为 **静态** 分析。

## 下一步阅读

- 第一次使用平台 → [新手教程：快速上手](./quick-start-tutorial.md)
- 用 CLI 从 0 到 1 开发 Skill → [CLI 开发指南](./cli-developer-guide.md)
- 准备包结构 → [Skill 格式](./skill-format.md)
- 准备上线 → [发布流程](./publish-workflow.md)
