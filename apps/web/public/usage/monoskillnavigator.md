# MonoSkillNavigator 注册表安装指南

## 概述

MonoSkillNavigator 是 Agent Skill 的发布、审查与分发平台。通过 **skillnav** CLI 连接注册表，完成搜索、安装与发布。本文档供 AI Agent 读取并代用户完成初始配置。

## 适用场景

- **仅安装某个 Skill**（CLI 已登录且 registry 已配置）→ 直接执行第三节，无需重复配置。
- **首次接入本平台** → 按第一至三节顺序执行；涉及 API 密钥时向用户索取或引导其在 Web「设置 → API 密钥」创建。

## 一、检查并安装 skillnav CLI

```bash
skillnav --version
skillnav config test
```

未安装时（任选其一）：

```bash
pipx install skillnav
pip install --user skillnav
```

## 二、配置 Registry 并登录

1. 确认 Registry API 地址（部署方提供的 `NEXT_PUBLIC_API_URL`，本地默认 `http://127.0.0.1:3000`）。
2. 用户在 Web 端「设置 → API 密钥」创建 `sk_…` 后执行：

```bash
skillnav login --api-key sk_…
skillnav whoami
skillnav config test
```

多环境可使用 profile：

```bash
skillnav config add prod --registry <API_URL>
skillnav config use prod
```

**安全**：勿向用户回显完整密钥；勿将 `sk_…` 写入 Git 或日志。

## 三、搜索与安装 Skill

```bash
skillnav search <关键词>
skillnav install <slug>
skillnav install <slug> --version <版本号>
skillnav download <slug> -o <输出.zip>
```

指定非默认 Registry：

```bash
skillnav --registry <API_URL> install <slug>
```

## 四、Agent Skills 安装目录

安装到当前 Agent 可识别的 skills 目录（示例）：

- Cursor：`~/.cursor/skills/`
- Claude Code：`~/.claude/skills/`
- Codex：`~/.codex/skills/` 或项目 `.agents/skills/`

若 CLI 支持 `--dir`，请指向上述目录；安装后按 Agent 要求重启或刷新 skills 列表。

## 五、发布（可选）

```bash
skillnav review ./my-skill
skillnav publish ./my-skill
```

## 文档

- CLI 全流程：`/docs/cli-developer-guide`
- 平台 Agent 系统提示词：`/docs/platform-agent-prompt`
- Skill 格式规范：`/docs/skill-format`
