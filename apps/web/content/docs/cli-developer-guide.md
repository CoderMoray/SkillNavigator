# CLI 指南：从 0 到 1 发布 Skill

本指南面向希望通过 **skillnav CLI** 完成 Skill 全生命周期的作者：安装工具、在平台注册并登录、用 AI 编写 Skill 包、发布、查看审查报告，以及根据结果迭代发版。

> **与 Web 的关系：** CLI 与 Web 发布页共用同一套 API 与审查流水线（SkillSpector、VirusTotal、HaluCatch）。你可以在 CLI 完成发布，在 Web 详情页查看图表与 finding；反之亦然。

## 你将完成什么

1. 安装 **skillnav** 并连接平台。
2. 在 Web 注册账户、创建 **API 密钥**，在 CLI 登录。
3. 用 AI 助手生成符合规范的 Skill 目录与 `SKILL.md`。
4. 通过 CLI **预审查 → 预览发布 → 正式发布**。
5. 用 `status` / `report` 查看审查与质量结果。
6. 根据 verdict 决定是否需要修改并 **发布新版本**。

## 生命周期概览

```text
安装 CLI → Web 注册 & 创建 API 密钥 → CLI 登录
    ↓
AI 编写 Skill 包（SKILL.md + 可选资源）
    ↓
skillnav review（可选预检）→ publish --dry-run → publish
    ↓
skillnav status / report → 解读 verdict
    ↓
┌─ 已发布 / 需复核且可接受 → 完成
└─ 需修改 → 改包 → 提高 version → 重新 publish
```

---

## 1. 安装 skillnav CLI

**skillnav** 是 {{brand_name}} 的官方命令行客户端（Python ≥ 3.9）。推荐安装：

```bash
pip install skillnav -i https://mirrors.aliyun.com/pypi/simple/
```

**其他安装方式：**

```bash
# 从本平台源码（开发者）
git clone <repo-url> && cd {{brand_name}}
pip install -e "cli-py[dev]"
```

**验证安装：**

```bash
skillnav --version
# skillnav 0.3.0

skillnav config test
# 默认连接 http://127.0.0.1:3000，输出 registry 健康检查结果
```

**升级 CLI：**

```bash
skillnav update          # 从 PyPI 升级
skillnav update --check  # 仅检查是否有新版本
```

### 查看命令帮助（`--help`）

skillnav 基于 Typer，任意层级都支持 `--help` 查看可用命令与参数说明。忘记子命令或可选 flag 时，直接在终端查询即可，无需翻文档。

```bash
skillnav --help              # 列出所有顶层命令
skillnav publish --help      # 查看 publish 的参数与用法
skillnav config --help       # 查看 config 子命令组
skillnav config add --help   # 查看 config add 的参数
```

不带参数运行 `skillnav` 也会显示与 `skillnav --help` 相同的顶层帮助。

---

## 2. 在 Web 注册账户

CLI 发布需要 API 密钥，密钥与 Web 登录账户绑定。若你还没有账户：

1. 打开平台 Web（默认 `http://127.0.0.1:3001`）。
2. 点击右上角 **注册**，填写用户名、邮箱、密码。
3. 注册成功后会自动登录并进入个人中心。

用户名 3–64 字符（字母、数字、`.`、`_`、`-`）；密码至少 8 位。首个注册用户会成为管理员。

> 若你更熟悉 Web 界面，可先阅读 [新手教程：快速上手](./quick-start-tutorial.md) 中的注册与浏览部分；本指南从 CLI 视角继续后续步骤。

---

## 3. 创建 API 密钥并在 CLI 登录

### 3.1 在 Web 创建 API 密钥

1. 登录 Web 后，进入 **设置 → API 密钥**（路径 `/account/settings/api-keys`）。
2. 点击 **创建 API 密钥**，填写名称（例如 `my-laptop`），可选设置过期时间。
3. 创建成功后，页面会 **一次性** 显示完整密钥（形如 `sk_…`）。请立即复制保存；关闭弹窗后无法再次查看完整密钥。
4. 页面通常提供「复制 CLI 登录命令」快捷按钮，可直接粘贴到终端。

**安全提示：**

- 不要将 `sk_…` 提交到 Git 或分享给他人。
- 在 CI 中使用环境变量 `SKILLNAV_API_KEY`，不要写入配置文件并提交。
- `skillnav logout` 仅清除本地保存的 Key，**不会** 在服务端吊销 Key；吊销请在 Web API密钥 页面停用或删除。

### 3.2 配置平台地址（可选）

默认 registry 为 `http://127.0.0.1:3000`（API 端口）。若平台部署在其他地址或带有路径前缀（例如 `https://host/{{brand_name}}/api`），先添加 profile：

```bash
skillnav config add prod --registry https://your-api.example.com
skillnav config use prod
skillnav config test
```

也可临时用全局参数，不写入配置：

```bash
skillnav --registry https://your-api.example.com login --api-key sk_...
```

环境变量 `SKILLNAV_REGISTRY` 与 `--registry` 等效。

### 3.3 登录并确认身份

```bash
skillnav login --api-key sk_你的密钥
skillnav whoami
```

成功时 `whoami` 会显示当前用户名与用户 ID。若 Key 无效或过期，登录会失败并提示重新在 Web 创建 Key。

**CI / 自动化（不持久化 Key）：**

```bash
export SKILLNAV_API_KEY=sk_...
export SKILLNAV_REGISTRY=http://127.0.0.1:3000
skillnav whoami --no-input
```

---

## 4. 用 AI 编写 Skill

平台要求每个 Skill 是一个 **目录**（或 ZIP），根目录包含入口 Markdown 文件 `SKILL.md`（也支持 `skill.md` / `skills.md`）。完整规范见 [Skill 格式](./skill-format.md)；下面是从零创建的最小流程。

### 4.1 创建目录

```bash
mkdir -p my-first-skill
cd my-first-skill
```

推荐结构：

```text
my-first-skill/
  SKILL.md          # 必填
  references/       # 可选：参考文档
  examples/         # 可选：示例
```

### 4.2 让 AI 生成 SKILL.md

在 Cursor、ChatGPT 等 Agent 中，可以使用类似提示词：

```markdown
请帮我创建一个 Agent Skill 包，要求：

1. 根目录文件名为 SKILL.md。
2. 文件开头是 YAML frontmatter（用 --- 包裹），包含：
   - slug: my-first-skill（小写 kebab-case，全局唯一）
   - name: 展示名称
   - description: 1–2 句说明做什么、何时使用
   - version: 1.0.0（SemVer）
   - categories: 至少 1 个，从以下选：Automation, Developer Tools, Documentation, Productivity, Data & Analytics, Security, Design & Creative, Communication, Other
   - release-tags: 包含 latest
3. 正文写清楚：工作流程、输出格式、边界约束（不要请求网络、不要读私密文件等）。
4. 可选字段：tags、supportedAgents、allowed-tools。

请直接输出完整 SKILL.md 内容。
```

将 AI 生成的内容保存为 `my-first-skill/SKILL.md`。可参考仓库示例 `examples/demo-skill/SKILL.md`：

```yaml
---
slug: demo-skill
name: Demo Skill
description: Reviews a short product idea and returns structured feedback.
version: 0.1.0
categories:
  - Developer Tools
release-tags:
  - latest
tags:
  - product
  - review
supportedAgents:
  - cursor
allowed-tools:
  - Read
---

# Demo Skill

（正文：步骤、输出模板、边界说明…）
```

**关键约定：**

| 字段 | 说明 |
| --- | --- |
| `slug` | 不可变唯一 ID，用于 URL、API、下载；发布后不要改 |
| `name` | 展示名称，可通过 `--display-name` 或新版本更新 |
| `description` | 映射为平台 `summary`，发布必填 |
| `categories` | 至少 1 个、最多 3 个 |
| `release-tags` | 首个版本必须包含 `latest` |

---

## 5. 发布前检查（推荐）

在正式写入注册表之前，建议按顺序执行：

### 5.1 远程预审查（不发布）

```bash
skillnav review ./my-first-skill
```

服务端运行 SkillSpector 与 HaluCatch（与发布流水线一致的安全/质量分析），**不会** 创建版本记录。适合在本地改包阶段快速发现问题。

### 5.2 发布预览（dry-run）

```bash
skillnav publish ./my-first-skill --dry-run
```

校验 frontmatter、分类、SemVer、打包格式，并走服务端预览接口，**不写入数据库**。

若 frontmatter 缺字段，CLI 可能交互式询问；自动化场景请显式传参：

```bash
skillnav publish ./my-first-skill \
  --dry-run \
  --no-input \
  --display-name "My First Skill" \
  --slug my-first-skill \
  --description "一句话说明用途" \
  --category "Developer Tools" \
  --version 1.0.0 \
  --release-tag latest
```

`--category` 可重复最多 3 次；`--release-tag` 可重复，首个版本至少包含 `latest`。

---

## 6. 正式发布

确认预检通过后：

```bash
skillnav publish ./my-first-skill \
  --version 1.0.0 \
  --category "Developer Tools" \
  --release-tag latest
```

若 `SKILL.md` frontmatter 已完整，通常可以简写为：

```bash
skillnav publish ./my-first-skill
```

CLI 会将目录打包为 ZIP，调用 `POST /skills/publish`，并在服务端运行 **完整审查流水线**：

1. 包格式校验  
2. SkillSpector 静态安全扫描  
3. VirusTotal 扫描（若平台已配置）  
4. HaluCatch 五维质量评估（若平台已配置）  

**仅当所有已启用环节均成功完成**，版本才会写入注册表。任一环节失败会返回 `review_pipeline_incomplete`，此时 Skill **尚未保存**，稍等或修复环境后重试即可。

发布成功后，CLI 会输出 slug、版本与 verdict 摘要；`author` 字段会自动写入当前登录用户名。

---

## 7. 查看状态与审查报告

### 7.1 快速状态

```bash
skillnav status my-first-skill
```

显示 Skill 是否存在、最新版本、verdict 概要。

### 7.2 完整报告

```bash
skillnav report my-first-skill
skillnav report my-first-skill --version 1.0.0
```

报告通常包含：

| 区块 | 内容 |
| --- | --- |
| **Verdict** | 已发布 / 需复核 / 已拒绝 |
| **SkillSpector** | 安全 finding、风险等级、安装建议 |
| **VirusTotal** | 恶意/可疑检出摘要（若已启用） |
| **HaluCatch** | 五维质量分数与 Markdown 报告（若已启用） |

也可在 Web 打开 Skill 详情页（`/skills/my-first-skill`）查看可视化雷达图与 finding 列表。

### 7.3 机器可读输出

脚本或 Agent 集成时使用 JSON：

```bash
skillnav report my-first-skill --json
skillnav publish ./my-first-skill --json --no-input ...
```

---

## 8. 解读结果并决定下一步

审查完成后，每个版本有一个 **verdict**（与 Web 徽章一致）：

| Verdict | 含义 | 建议 |
| --- | --- | --- |
| **已发布（published）** | 审查流水线无任何 finding | ✅ 生命周期完成；可分享、下载、推广 |
| **需复核（needs-review）** | 有 finding，但未触发自动拒绝 | 版本已入库；评估 finding Severity，可接受则完成，或修复后发新版本 |
| **已拒绝（rejected）** | 命中 SkillSpector / VirusTotal 等高置信度拒绝规则 | 版本已入库但 **不会出现在公开搜索**；必须修复后发 **新版本** |

**流水线未完成（未入库）：** 若看到 `review_pipeline_incomplete`（例如 VirusTotal 超时），版本 **没有保存**。直接重跑 `publish` 即可，无需改版本号。

更多规则见 [发布流程](./publish-workflow.md)、[安全检测](./security-scan.md)、[质量审查](./halucatch-review.md)。

---

## 9. 修改并重新发布

同一 `slug@version` **不可覆盖**。需要根据报告修改 Skill 时：

1. **编辑本地包**（改 `SKILL.md` 正文、权限声明、去掉触发 finding 的内容等）。
2. **提高版本号**（SemVer 必须大于已发布版本），例如 `1.0.0` → `1.0.1`。
3. 更新 frontmatter 中的 `version` 字段（或用 CLI `--version` 覆盖）。
4. 重新走发布流程：

```bash
skillnav review ./my-first-skill
skillnav publish ./my-first-skill --version 1.0.1 --release-tag latest
skillnav report my-first-skill --version 1.0.1
```

若 verdict 变为 **已发布** 或你可接受的 **需复核**，则迭代结束。

**典型修复方向：**

- SkillSpector **high/critical** finding → 修改脚本、权限声明或删除风险文件  
- **description/tags** 不规范 → 补全 frontmatter  
- HaluCatch 低分 → 完善正文步骤、边界说明、示例  

---

## 10. 完成：分发与后续

Skill 通过后，你可以：

```bash
# 查看元数据
skillnav info my-first-skill

# 下载 ZIP
skillnav download my-first-skill -o my-first-skill.zip

# 下载并解压到目录
skillnav install my-first-skill --dir ./skills/my-first-skill

# 在广场搜索自己的 Skill
skillnav search my-first
```

在 Web 上，拥有者还可以添加 **contributor**、下架/上架、在 **Audits** 审查中心导出 CSV。这些操作目前以 Web 为主；CLI 支持评分、Issue 等社区命令（`skillnav rate`、`skillnav issue`）。

---

## 常用命令速查

| 场景 | 命令 |
| --- | --- |
| 查看帮助 | `skillnav --help` / `skillnav <命令> --help` |
| 连接检查 | `skillnav config test` |
| 登录 | `skillnav login --api-key sk_…` |
| 当前用户 | `skillnav whoami` |
| 预审查 | `skillnav review ./my-skill` |
| 预览发布 | `skillnav publish ./my-skill --dry-run` |
| 正式发布 | `skillnav publish ./my-skill` |
| 状态 | `skillnav status <slug>` |
| 报告 | `skillnav report <slug> [--version VER]` |
| 搜索 | `skillnav search <关键词>` |
| 退出登录（本地） | `skillnav logout` |

**全局参数：** `--registry`、`--profile`、`--json`、`--no-input`（CI 必加，缺少输入时直接失败）。

**配置文件：** `~/.config/skillnav/config.json`（权限 `0600`，多 profile 存 `apiKey`）。

**环境变量：** `SKILLNAV_REGISTRY`、`SKILLNAV_PROFILE`、`SKILLNAV_API_KEY`。

---

## 常见问题

### 提示 not logged in

先执行 `skillnav login --api-key sk_…`，或设置 `SKILLNAV_API_KEY`。自动化加 `--no-input`。

### slug 已存在 / 无权限发布

只有 Skill **owner** 或 **contributor** 能为已有 slug 发新版本。换一个新 slug，或让 owner 在 Web 详情页添加你为 contributor。

### Skill 在回收站

Web 个人中心回收站中的 Skill 需先恢复，再 CLI 发布。

### 分类报错

`--category` 必须与平台列表完全一致（大小写不敏感），共 9 类：Automation、Developer Tools、Documentation、Productivity、Data & Analytics、Security、Design & Creative、Communication、Other。

### 连接自定义部署 API

Registry URL 可带路径前缀；CLI 使用字符串拼接，请传入完整 API 根路径，例如 `https://example.com/{{brand_name}}/api`。

---

## 相关文档

- [Skill 格式](./skill-format.md) — 包结构与 frontmatter 详解  
- [发布流程](./publish-workflow.md) — verdict、可见性与 Web 发布对照  
- [安全检测](./security-scan.md) — SkillSpector 与 VirusTotal  
- [质量审查](./halucatch-review.md) — HaluCatch 五维报告  
- [新手教程：快速上手](./quick-start-tutorial.md) — Web 界面完整 walkthrough  
