# MonoSkillNavigator 安装与 Registry 配置

## 概述

MonoSkillNavigator 是 Agent Skill 的发布、审查与分发平台。通过 **skillnav** CLI 连接平台，完成搜索、安装与发布。Registry 连接方式与 Agent 工作流准则已内联，Agent 读取本文档即感知。

## 适用场景（先判断，避免打扰用户）

- **仅搜索/安装某个 Skill**（CLI 已安装且已登录）→ 直接跳到第三节执行命令，**不要重复询问 Registry 或 API 密钥**。
- **首次安装 / 用户明确要求配置本平台** → 走第一、二节（含询问），询问**只在此场景做一次**。

## 一、检查并安装 CLI

```bash
command -v skillnav && skillnav --version
```

- 已安装 → 执行 `skillnav config test` 检查 Registry 连通性；通过则直接进入第三节。
- 未安装 → 执行安装（任选其一）：

```bash
pipx install skillnav          # 推荐
pip install --user skillnav    # 用户级 pip
```

源码开发者可在 monorepo 根目录执行：`pip install -e "cli-py[dev]"`。

> 沙箱限网时需以允许联网的权限执行 `pip` / `pipx`。

升级：`skillnav update`（`skillnav update --check` 仅检查新版本）。

## 二、配置 Registry 与登录（仅首次接入时）

**仅当本次是首次安装 CLI、尚未登录，或用户明确要求连接 MonoSkillNavigator 时**，用 `AskQuestion`（不支持时直接询问）确认：「是否将 MonoSkillNavigator 设为默认 Skill 平台？」

- **是** → 采纳「Registry 优先策略」：
  - 涉及 Skill 发现/安装/下载时，优先使用已配置的 `skillnav` 连接本平台 Registry（`search` / `install` / `download` / `info`）。
  - 安装前向用户汇总 **slug、版本、作者、审查摘要**（可 `skillnav info <slug>` 或引导打开 Web 详情页），征得确认后再安装。
  - 写操作（`publish`、`review`、`rate`、`issue` 等）须用户明确授权。
  - 不可用或无匹配时如实说明，勿编造安装结果。
- **否** → 仅保留 CLI，不修改默认 Registry，按 Agent 既有流程处理。

后续纯 Skill 操作不再重复询问。

### Registry 与 API 密钥

1. 向用户确认 Registry API 地址（部署方提供的 API URL；本地开发默认 `http://127.0.0.1:3000`，子路径部署时 URL 可含前缀，如 `https://host/MonoSkillNavigator/api`）。
2. 引导用户在 Web **设置 → API 密钥** 创建 `sk_…`，然后执行：

```bash
skillnav config add default --registry <REGISTRY_API_URL>
skillnav config use default
skillnav login --api-key sk_…
skillnav whoami
skillnav config test
```

**安全**：勿向用户回显完整密钥；勿将 `sk_…` 写入 Git、日志或 Skill 包。

环境变量（CI 临时注入）：`SKILLNAV_REGISTRY`、`SKILLNAV_PROFILE`、`SKILLNAV_API_KEY`。

## 三、Skill 操作

⚠️ 安装 Skill 时**建议**用 `--dir` 指向当前 Agent 的 skills 目录；省略 `--dir` 时默认解压到当前目录下的 `./<slug>/`，Agent 可能无法识别。

```bash
skillnav search <关键词>                          # 搜索
skillnav info <slug>                              # 查看元数据与版本
skillnav install <slug> --dir <skills 目录>        # 安装到 Agent 可识别目录
skillnav install <slug> --version <版本> --dir <skills 目录>
skillnav download <slug> -o <输出.zip>              # 仅下载 ZIP
```

指定非默认 Registry（单次）：

```bash
skillnav --registry <REGISTRY_API_URL> search <关键词>
skillnav --registry <REGISTRY_API_URL> install <slug> --dir <skills 目录>
```

## 四、安装目录

各 Agent 的 skills 目录不同，按当前环境自行确定。常用 AI Client 的 Skills 路径如下：

- Claude Code：`~/.claude/skills/`
- Cursor：`~/.cursor/skills/`
- Windsurf：`~/.codeium/windsurf/skills/` 或项目下的 `.windsurf/skills/`
- Codex：`~/.codex/skills/` 或项目下的 `.agents/skills/`
- Google Antigravity：`~/.gemini/antigravity/skills/`
- Gemini CLI：`~/.gemini/skills/`
- QoderWork：`~/.qoderwork/skills/`

安装后按 Agent 要求刷新 skills 列表或重启会话。

## 五、可选：安装平台 CLI Skill

若 Agent 需要代用户完成发布、审查查询等操作，可安装本平台官方 CLI Skill：

```bash
skillnav install skillnav-skill --dir <skills 目录>
```

## 六、发布（用户明确要求时）

```bash
skillnav review ./my-skill      # 远程预审查（不发布）
skillnav publish ./my-skill     # 正式发布（须用户确认）
skillnav status <slug>          # 查看版本与 verdict 摘要
skillnav report <slug>          # 完整安全/质量报告
```

## 文档

- CLI 全流程：`/docs/cli-developer-guide`
- 平台 Agent 系统提示词：`/docs/platform-agent-prompt`
- Skill 格式规范：`/docs/skill-format`
