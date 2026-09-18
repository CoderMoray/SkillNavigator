---
slug: demo-skill-improved
name: Demo Skill Improved
description: Reviews a short product idea and returns structured feedback with explicit guardrails. Use when the user asks for a lightweight, repeatable product idea critique after HaluCatch-style hardening.
version: 0.1.0
categories:
  - Developer Tools
release-tags:
  - latest
author: skill-platform
license: MIT
tags:
  - product
  - review
  - demo
supportedAgents:
  - cursor
allowed-tools:
  - Read
---

# Demo Skill Improved

本 Skill 在原始 Demo Skill 基础上补齐 HaluCatch 行动版建议：结构化步骤、输出模板、验证自检、错误回退与用户告知。

## 适用前提

- 假设用户已经提供一段可理解的产品想法文本（通常 1–3 段）。
- 前提条件：仅基于用户当次输入做 critique，不引入外部市场数据。

## 执行步骤

### 步骤 1：确认输入范围

阅读用户消息。若缺少产品想法或描述过于模糊，**先向用户确认**是否要补充说明；**经用户同意后再**进入分析，不要自行编造缺失背景。

### 步骤 2：提取结构化要点

从输入中归纳：

1. 目标用户是谁；
2. 核心价值主张；
3. 当前最大的不确定性或验证风险。

若输入无法解析为以上三类信息，进入「错误与回退」。

### 步骤 3：生成建议

给出三条可执行建议，分别覆盖定位、信任/分发、以及一条需要实验验证的假设。建议应具体、可落地，避免空泛形容词。

### 步骤 4：按模板输出

使用仓库内 `references/output-template.tpl` 的占位结构组织最终 Markdown。字段名与章节标题必须与模板一致，便于复现。

### 步骤 5：输出验证（自检）

产出后请检查：

- [ ] 是否包含 `## Summary`、`## Suggestions`、`## Validation Risk` 三个一级章节；
- [ ] Suggestions 是否恰好三条 `-` 列表项；
- [ ] Validation Risk 是否只陈述一个最高风险假设；
- [ ] 全文是否未引用用户未提供的私密路径或凭证。

任一检查失败时，修正后再输出，不要跳过。

## 输出格式

默认输出 Markdown，结构如下（内容与 `references/output-template.tpl` 对齐）：

```markdown
## Summary
[One short paragraph]

## Suggestions
- [Suggestion 1]
- [Suggestion 2]
- [Suggestion 3]

## Validation Risk
[The highest-risk assumption]
```

示例输入见 `examples/product-idea.md`。

## 错误与回退

- 如果用户输入为空、无关或无法识别为产品想法，**向用户告知**无法继续的原因，并**回退**到步骤 1 请求补充。
- 如果自检未通过，在内部修正格式后重新生成；仍失败则告知用户当前阻塞项，不要输出半成品。

## 禁止操作与护栏

- **禁止**访问网络、调用外部 API 或打开外部网站。
- **不要**读取用户未明确提供的私有文件、环境变量或凭证。
- **切勿**执行 shell 命令或修改用户磁盘上的文件。
- 仅使用 Read 工具阅读本 Skill 包内已引用的参考文件。

## 边界说明

本 Skill 只做轻量产品想法评审，不提供法律、财务或安全审计结论。若用户需要深度调研，应建议使用专门的研究 Skill。
