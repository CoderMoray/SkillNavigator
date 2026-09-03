---
slug: skillnav-skill
name: skillnav CLI
description: "SkillNavigator 官方 CLI（skillnav）：多 profile 配置、API Key 登录、Skill 发布与远程审查、状态/报告查询、搜索下载、评分与 Issue。当用户需要通过命令行发布/更新 Skill、预审查包、查看 verdict 与 HaluCatch 报告、搜索或安装 Skill，或 Agent 需要代用户操作本平台 CLI 时使用本技能。"
version: 1.0.0
categories:
  - Developer Tools
release-tags:
  - latest
tags:
  - cli
  - skill-platform
  - publish
allowed-tools:
  - Read
  - Shell
---

# skillnav

SkillNavigator 官方命令行客户端，纯 API 客户端——审查（SkillSpector、VirusTotal）与质量评估（HaluCatch）均在**服务端**执行。

## 安装与检测

使用前检测 `skillnav` 是否可用：

```bash
skillnav --version
skillnav config test
```

若命令不存在，引导用户安装：

```bash
pip install skillnav -i https://mirrors.aliyun.com/pypi/simple/
```

源码开发者可在 monorepo 根目录执行：`pip install -e "cli-py[dev]"`。

升级：`skillnav update`（`--check` 仅检查新版本）。

## 全局选项与环境变量

**优先级**：命令行 flag > 环境变量 > `~/.config/skillnav/config.json` > 内置默认。

| 全局选项 | 说明 |
| --- | --- |
| `--registry <url>` | API 根 URL（可含路径前缀，如 `https://host/SkillNavigator/api`） |
| `--profile <name>` | 使用指定 profile |
| `--json` | 机器可读 JSON 输出（脚本/Agent 推荐） |
| `--no-input` | 禁止交互提示；缺参数或未登录时直接失败 |
| `--help` | 任意层级查看子命令帮助 |

环境变量：`SKILLNAV_REGISTRY`、`SKILLNAV_PROFILE`、`SKILLNAV_API_KEY`（CI 临时注入，不落盘）。

> **帮助**：忘记参数时执行 `skillnav <命令> --help` 或 `skillnav config --help`。

## 认证与配置（必读）

发布、下载、评分等写操作需 API Key。用户在 Web **设置 → API 密钥** 创建 `sk_…` 后：

```bash
skillnav login --api-key sk_…
skillnav whoami
skillnav logout    # 仅清除本地 Key，不在服务端吊销
```

多环境 profile：`skillnav config add prod --registry <url>` → `config use prod` → `config test`。

详情 → [`references/skillnav-auth.md`](references/skillnav-auth.md)

## 命令总览与详情索引

```
skillnav
├── config                          # 平台 profile → [references/skillnav-auth.md](references/skillnav-auth.md)
│   ├── add <name> --registry URL
│   ├── use <name>
│   ├── list
│   └── test [name]
├── login / logout / whoami / update
├── publish <dir|zip>               # 发布 → [references/skillnav-publish.md](references/skillnav-publish.md)
├── review <dir|zip>                # 远程预审查（不发布）
├── status <slug>                   # 版本与 verdict 摘要
├── report <slug> [--version VER]   # 完整安全/质量报告
├── search <query> [--category]     # 搜索 → [references/skillnav-discover.md](references/skillnav-discover.md)
├── top [--sort] [--limit]
├── info <slug>
├── download <slug> [-o PATH]       # 分发 → [references/skillnav-distribute.md](references/skillnav-distribute.md)
├── install <slug> [--dir DIR]
├── rate / issue / issues           # 社区 → [references/skillnav-community.md](references/skillnav-community.md)
├── add-contributor / remove-contributor
```

## Agent 工作流准则

### 发布 Skill 推荐顺序

```text
确认 skillnav 已安装且已登录
    ↓
skillnav review ./my-skill          # 可选：远程预审查
    ↓
skillnav publish ./my-skill --dry-run
    ↓
skillnav publish ./my-skill [--version … --category …]
    ↓
skillnav status <slug> / report <slug>
```

### 自动化场景

- **必须**加 `--no-input` 与 `--json`，避免交互阻塞。
- 用 `SKILLNAV_API_KEY` + `SKILLNAV_REGISTRY` 注入凭证，勿把 `sk_…` 写入 Skill 包或 Git。
- 发布前确认本地目录含 `SKILL.md`（或 `skill.md`），且 frontmatter 含 `slug`、`version`、`categories`、`release-tags`（首版含 `latest`）。

### 标识语义

| 字段 | 含义 |
| --- | --- |
| `slug` | 不可变唯一 ID，API/CLI/URL 查找键 |
| `name` | 可变展示名 |
| `version` | SemVer；同一 `slug@version` 不可覆盖 |

## 安全规则

- **禁止**在回复、日志或 Issue 中明文输出完整 `sk_…` API Key。
- **写操作二次确认**：`publish`（非 dry-run）、`remove-contributor` 等不可逆或影响他人的操作，须向用户展示关键参数（slug、version）并获得明确确认后再执行。
- **必填参数缺失**：不得自行编造 slug/version/category；缺 frontmatter 时用 CLI flag 或请用户补充。
- **`--no-input` 下未登录**：报错 `not logged in (run: skillnav login --api-key KEY)`，应提示用户登录或设置 `SKILLNAV_API_KEY`，勿尝试交互式 login。

## 常见错误

| 现象 | 处理 |
| --- | --- |
| `not logged in` | `skillnav login --api-key sk_…` 或 `SKILLNAV_API_KEY` |
| `Only skill contributors can publish` | 换 slug 或让 owner 在 Web 添加 contributor |
| `skill_in_recycle_bin` | Web 个人中心回收站先恢复 |
| `review_pipeline_incomplete` | 版本未入库，直接重试 `publish`（可不改版本号） |
| 分类报错 | 9 类之一：Automation、Developer Tools、Documentation、Productivity、Data & Analytics、Security、Design & Creative、Communication、Other |
| 连接失败 | `skillnav config test`；registry 须为完整 API 根路径 |

## 平台文档

- Web CLI 指南：仓库 `apps/web/content/docs/cli-guide.md`
- **平台 Agent 系统提示词**：Web `/docs/platform-agent-prompt`（可复制系统提示词，含 FAQ 与文档链接）
- Skill 包规范：仓库 `docs/rules/skill-spec.md`
- CLI 设计：仓库 `docs/cli-design.md`
