# Skill 格式

每个 Skill 是一个 **目录**（或打成 **ZIP**），必须包含规范的入口 Markdown 文件，通常为根目录下的 `SKILL.md`（也支持 `skill.md`、`skills.md`）。

## 推荐目录结构

```text
my-skill/
  SKILL.md          # 必填：说明 + YAML frontmatter
  references/       # 可选：参考文档
  examples/         # 可选：示例
  scripts/          # 可选：脚本（会被静态扫描，不会被执行）
  tests/            # 可选：tests/*.json 任务集（HaluCatch 不可用时的回退）
  assets/           # 可选：静态资源
```

## SKILL.md 结构

文件由两部分组成：

1. **YAML frontmatter**（文件开头，用 `---` 包裹）
2. **正文**（Agent 阅读的说明、步骤、约束等）

### 示例 frontmatter

```yaml
---
slug: demo-plugin
name: Demo Plugin
description: 一句话说明 Skill 做什么、在什么场景下使用。
version: 1.0.0
categories:
  - Developer Tools
release-tags:
  - latest
author: your-name
license: MIT
tags:
  - productivity
supportedAgents:
  - cursor
allowed-tools:
  - Read
---
```

### 字段说明

#### 必填（规范校验）

| 字段 | 要求 |
| --- | --- |
| `name` | 展示名称，1–128 字符；建议使用小写字母、数字与短横线。 |
| `description` | 摘要，1–1024 字符；应说明 **做什么** 与 **何时使用**，避免无意义重复填充。 |
| `version` | SemVer，例如 `1.0.0`。 |

#### Web 发布额外要求

| 字段 | 要求 |
| --- | --- |
| `slug` | 唯一 ID；小写 kebab-case，或 `@scope/skill-name` 形式。新 Skill 建议在发布页填写，与包内 frontmatter 一致。 |
| `categories` | 至少 1 个分类（发布页最多选 3 个）。 |
| `release-tags` | 版本标签；**首个版本必须包含 `latest`**，否则会被拒绝（`First version must include latest tag`）。 |

#### 常用可选字段

| 字段 | 说明 |
| --- | --- |
| `author`、`license`、`tags` | 展示与发现；**Web/CLI 发布时 `author` 会自动写入当前登录用户名** |
| `supportedAgents` | 声明支持的 Agent 类型 |
| `allowed-tools` / `disallowed-tools` | 工具权限声明；SkillSpector 会对照代码能力做最小权限检查 |
| `topics` | 主题标签 |

## Slug 规则

- 无 scope：`my-skill`（小写、数字、短横线，长度限制见平台校验）
- 有 scope：`@team/my-skill`

**slug 是查找与下载的主键**；`name` 可以随时改，但 URL 与 API 以 slug 为准。

## 版本与标签

- 每次发布产生 **新版本号**（需大于已有版本，遵循 SemVer）。
- `latest` 等 **release-tag** 指向某个版本，便于用户默认安装最新稳定版。
- 已发布的 `slug@version` 内容不可覆盖，只能发新版本。

## 大小与路径限制

- 单文件文本审查上限约 **1 MB**；整包约 **50 MB**（以平台当前配置为准）。
- 路径不得包含 `..` 等逃逸片段。
- 除 `.gitignore`、`.clawhubignore` 等允许项外，隐藏文件可能被忽略。

## 编写建议

1. **description** 写清楚场景，不要用同一短句重复数百次（会触发 SkillSpector「上下文填充」类规则）。
2. 若 Skill 含脚本或联网说明，在正文里写清 **用途与边界**，并在 `allowed-tools` 中如实声明。
3. 提供 `examples/` 或 `tests/` 有助于 HaluCatch 评估可维护性与规则完整性。

## 相关文档

- [发布流程](./publish-workflow.md)
- [安全检测](./security-scan.md)
