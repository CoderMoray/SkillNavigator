# skillnav CLI 设计文档

> 状态：设计定稿 · 实现进行中（skillnav 0.4.13，见 `cli-py/`；版本号单一来源 `skillnav/__init__.py`）
> 日期：2026-08-19

## 1. 背景与定位

Skill 管理平台（SkillNavigator）对外提供 Web UI 与 HTTP API。`skillnav` 是平台的**官方命令行客户端**，面向开发者与 Agent：

- **纯 API 客户端**：所有审查（SkillSpector 安全扫描）、评估（HaluCatch 质量评估）均在服务端执行，CLI 不包含任何本地审查逻辑；发布默认 **异步**（上传即返回，`--wait` 才阻塞至流水线结束）。
- **职责边界**：鉴权、上传发布、查询状态、获取安全/质量报告、搜索、下载、社区交互（评分/Issue/贡献者）。
- 对标调研：skillhub CLI（Python/argparse）、clawhub CLI（Node/Commander）。吸收点：`--dry-run` 预检、`--no-input`（Agent 场景）、API Key 登录 / `whoami`（CI 调试）、`--registry` 多环境指向。

## 2. 命名与分发

| 项 | 值 |
|---|---|
| 包名 / 命令名 | `skillnav`（PyPI 未占用，2026-08-19 确认；npm 亦可用） |
| 技术栈 | Python ≥ 3.10，CLI 框架：typer |
| 安装 | `pip install skillnav -i https://mirrors.aliyun.com/pypi/simple/` |
| 环境变量前缀 | `SKILLNAV_` |

**取代关系**：对外分发的 CLI 形态为 skillnav；仓库内 `apps/cli`（TypeScript/Commander）逐步下线，或仅作开发期内部工具保留。

## 3. 全局选项与环境

优先级：**命令行 flag > 环境变量 > 配置文件 > 内置默认**。

| 全局选项 | 含义 | 默认 |
|---|---|---|
| `--registry <url>` | API base URL（覆盖 profile） | 配置 → 见下 |
| `--profile <name>` | 指定平台 profile | 配置 `defaultProfile` |
| `--json` | 机器可读输出（覆盖默认人类可读） | off |
| `--no-input` | 禁止任何交互提示（Agent 场景，未登录即报错） | off |
| `-v, --version` | 打印版本 | — |

环境变量：

- `SKILLNAV_REGISTRY`：API base URL（覆盖 profile 的 registry）
- `SKILLNAV_PROFILE`：指定平台 profile
- `SKILLNAV_API_KEY`：直接提供 API Key（CI 场景，不落盘；兼容旧名 `SKILLNAV_TOKEN`）
- `SKILLNAV_PUBLISH_WAIT_TIMEOUT`：`publish --wait` / `retry-inspection --wait` 的请求预算（秒）。默认 600（不传 `--wait` 的上传为 120）；流水线含 VT 排队时耗时会接近该量级，可按部署调整

## 4. 配置与鉴权（多 Profile 模型）

配置文件：`~/.config/skillnav/config.json`（权限 0600）。采用 **多 profile（平台实例）模型**——一个 CLI 可管理多个平台（独立部署 + 多个嵌入平台）：

```json
{
  "defaultProfile": "prod",
  "profiles": {
    "prod": {
      "registry": "https://api.skillnav.example.com",
      "apiKey": "sk_...",
      "identity": { "username": "alice", "userId": 1 }
    },
    "corp": {
      "registry": "https://aaa.bbb.com/SkillNavigator/api"
    }
  }
}
```

**profile 含义**：一个"平台实例"。`registry` 是完整 API base URL，**允许包含路径前缀**（嵌入部署形态，见 [平台集成指南](./platform-integration.md)）。

**优先级**：`--registry`（命令行）> `--profile`（命令行）> `SKILLNAV_REGISTRY` / `SKILLNAV_PROFILE`（环境变量）> 配置 `defaultProfile`。

**URL 拼接约定（重要）**：请求端点一律用**字符串拼接** `f"{registry}/skills/publish"`，**禁止**使用 `urljoin` / `new URL()` 等规范化函数——它们会丢弃 registry 的路径前缀，导致带前缀的嵌入 API 请求 404。

**鉴权模型**：

- **Web 登录**：用户名 + 密码 → 会话 token（`skp_…`），用于浏览器 Cookie / Bearer。
- **CLI 登录**：用户在 Web「账户 → API Keys」创建 API Key（`sk_…`），CLI 通过 `skillnav login --api-key sk_…` 写入当前 profile；也可用 `SKILLNAV_API_KEY` 环境变量临时注入。
- API Key 支持多个、可设失效时间、可停用（`isActive`）；停用或过期后 CLI 请求返回 401。
- `skillnav logout` 仅清除本地 profile 中的 key，不会在服务端吊销 key（需在 Web 停用/删除）。

**命令行为**：

- `skillnav login --api-key KEY` 写入当前 profile 的 `apiKey` + identity（identity 来自 `GET /auth/me`）。
- `skillnav logout` 清除当前 profile 的 apiKey 与 identity。
- `skillnav config add <name> --registry <url>`：添加平台实例；`config use <name>`：切换默认；`config list`：列出；`config connect-test [name]`：调 `GET {registry}/health` 验证连通性。
- 需要鉴权的命令未登录时：报错 `not logged in (run: skillnav login --api-key KEY)`，退出码 2；若带 `--no-input` 直接失败，不提示。

## 5. 命令树

```
skillnav
├─ 平台配置
│  ├─ config add <name> --registry <url>       # 添加平台实例（--json → `{profile, registry}`）
│  ├─ config use <name>                        # 切换默认平台（--json → `{defaultProfile}`）
│  ├─ config list                              # 列出平台实例
│  └─ config connect-test [name]                       # 验证连通性（GET /health）
├─ 登录与身份
│  ├─ login [--api-key KEY] [--registry URL]   # API Key 直传
│  ├─ logout                                   # 清除本地 apiKey（不吊销服务端 key）
│  ├─ whoami                                   # GET /auth/me，打印当前身份
│  └─ update [--check]                         # 检查/升级 skillnav 自身（PyPI）
├─ 发布与审查（服务端执行）
│  ├─ publish <dir|zip> [--version] [--display-name] [--slug] [--description]
│  │                  [--category C ...] [--topic T ...] [--release-tag TAG ...]
│  │                  [--changelog] [--dry-run] [--wait] [--json]
│  ├─ retry-inspection <slug> [--wait] [--json]     # 对已暂存包重新跑审查
│  ├─ status   <slug> [--version VER] [--json]  # 发布状态 + 各版本审查结论 → GET /skills/:slug
│  └─ report   <slug> [--version] [--json]     # 安全/质量报告 → GET /skills/:slug/versions/:version
├─ 检索
│  ├─ search <query> [--category] [--json]     # GET /skills?query=
│  ├─ top [--sort] [--limit] [--json]          # GET /leaderboard
│  └─ info <slug> [--json]                     # GET /skills/:slug
├─ 分发
│  ├─ download <slug> [--version] [-o PATH]    # 下载 zip → GET .../download
│  └─ install  <slug> [--version] --dir DIR   # 下载并解压为目录（--dir 必填）
├─ 社区
│  ├─ rate <slug> --score N [--comment]        # POST /skills/:slug/ratings
│  ├─ issue <slug> --title T [--type] [--severity] [--body]   # POST /skills/:slug/issues
│  ├─ issues <slug> [--status]                 # GET /skills/:slug/issues
│  ├─ add-contributor <slug> --username USER   # POST /skills/:slug/contributors
│  └─ remove-contributor <slug> [--id ID | --username USER]  # DELETE /skills/:slug/contributors/:id
├─ 生命周期
│  ├─ unpublish <slug> [--version VER] [--delete]  # POST /skills/:slug[/versions/:version]/unpublish；--delete → DELETE /skills/:slug（回收站）
│  └─ republish <slug> [--version VER]             # POST .../republish（恢复公开；受审查状态约束）
└─ skill / skill2（预留）
```

## 6. 关键命令行为

### `publish`

- 读取本地目录（须含 `SKILL.md`）或 `.zip`，原样上传（不解析内容，由服务端校验）。
- **Metadata 与 Web 发布对齐**：必填 `displayName`、`slug`、`summary`（description）、`categories`（≥1，最多 3，须为平台分类列表项）、`version`（SemVer）、`releaseTags`（≥1，首版须含 `latest`）。可从 SKILL.md frontmatter 读取，亦可用 CLI flag 覆盖：`--display-name`、`--slug`、`--description`、`--category`（可重复）、`--topic`（可重复）、`--release-tag`（可重复）、`--version`。无效 category 会报错并列出可选值（与 Web 发布页一致）。
- 请求体携带 `metadata` 对象，服务端 `applySkillPublishMetadata` 写入 frontmatter；`author` 由服务端写入当前登录用户。
- 缺少必填 metadata 时，交互模式下会逐项提示补全；`--no-input` 或 `--json` 下直接报错。
- `--dry-run`：调用 `POST /skills/publish/preview`（服务端预检：元数据 + 打包校验），不落库、不发版；CLI 本地先校验 metadata 完整性。
- 默认 **异步审查**：上传并暂存包后立即返回 **202**（`inspectionStatus: inspecting`），审查在服务端后台执行；传 `async: false` 或 CLI `--wait` 可阻塞至审查结束。`--wait` 的请求预算默认 **600s**（`SKILLNAV_PUBLISH_WAIT_TIMEOUT` 可覆盖）；客户端超时与「无法连接 API」分开报错（`Request timed out after <N>s`），并提示查 `status` / `retry-inspection`、勿重复上传同版本。VirusTotal 报告默认由服务端后台补取，`inspecting` 属正常等待。
- 成功（201，仅 `async: false`）：打印 slug、version、status、contentHash，并按需展示 inspection / evaluation 摘要；`--json` 输出完整响应体。
- 失败语义：`skill_in_recycle_bin` → 提示先恢复；`Only skill contributors can publish new versions` → 提示需要贡献者权限；`inspection_pipeline_incomplete`（503）→ 提示可重试。

### `report`

- 取指定版本（默认最新已发布版本）的完整 inspection / evaluation。
- 输出分区：SkillSpector（Security）/ VirusTotal（Security）/ HaluCatch（Quality）；人类可读模式给出 verdict、scores 与 findings 列表。

### `info`

- `GET /skills/:slug`；人类可读：**元数据卡片**（名称、描述、分类、贡献者、评分、Issue 数、下载、可见性、时间戳）。
- 不展开 inspection findings；版本审查摘要见 `status`，单版本完整报告见 `report`。

### `status`

- 同一 API；人类可读：**单版本审查状态**（默认 latest），含 `Verdict:`、`Inspection status:`、`Inspection progress:`（各阶段状态；平台未返回阶段数据时显示 `unavailable (...)`）、`Security:`（SkillSpector 安全分与阻塞项、VirusTotal 检出与引擎数）、`Published:`（上架 yes / 下架 no）等行；可选 `--version` 指定其他版本（格式一致）。`--json` 在顶层额外给出 `verdict` 字段。
- 末尾提示使用 `skillnav report <slug> --version <ver>` 查看完整报告。

### `unpublish` / `republish`（生命周期）

- `unpublish <slug>`：`POST /skills/:slug/unpublish`，把 Skill 从公开搜索移除。**不是删除**——包、审查数据与版本历史都保留。交互模式先显示影响并要求 `y/N`（回答 n → 退出码 1 且**不发请求**）；`--no-input` 跳过确认。
- `unpublish --version VER`：`POST .../versions/:version/unpublish`，只下架某个版本；**latest 不能单独下架**（`cannot_unpublish_latest_version`，400）。
- `unpublish --delete`：`DELETE /skills/:slug`，移入回收站（保留 3 天，期间可在 Web 恢复，到期永久删除）。回收站期间**同 slug 被禁止发布**（`skill_in_recycle_bin`）。与 `--version` 互斥（用法错误，退出码 3）。命名刻意不用 `purge`——本仓库里 `purge` 指"永久清除"，而这里只是软删除。
- `republish <slug> [--version VER]`：`POST .../republish`，只恢复可见性、不产生新版本；**不能绕过审查**——审查中 / 中断 / 被拒绝时服务端拒绝（`skill_republish_blocked_*`，409），提示指向 `retry-inspection` 或发新版本。
- 结果：`published=false` 时 `status` 显示 `Published: no (private)`；`--json` 返回 `{slug, version, action, visibility}`（action 为 `unpublished` / `deleted` / `republished`）。

### `update` 与每日版本检查

版本来源：**PyPI JSON 优先**（`https://pypi.org/pypi/skillnav/json`），**超时/失败自动回退阿里云 simple index**（解析文件链接取最大版本，镜像无 JSON API）。两者使用同一超时（默认 10 秒）；都失败时报错列出两个源的失败原因。

每日检查（C 策略，随任意命令在后台之前的前台执行一次）：

- 缓存文件 `update-check.json`（与 config.json 同目录）；24 小时内直接用缓存值提示，**不联网**
- 缓存过期才查询一次（默认 3 秒短超时，`SKILLNAV_UPDATE_CHECK_TIMEOUT` 可调）；**查询失败也记录时间戳**，24 小时内不再尝试（离线/内网环境每天最多付出一次超时）
- 有新版本时向 **stderr** 输出单行提示（`--json` 的 stdout 不受影响）：`Update available: A.B.C -> X.Y.Z (run: skillnav update)`（与 `update --check` 同措辞）
- editable 安装（开发机）自动跳过；`SKILLNAV_UPDATE_CHECK=off` 可关闭
- 只提示、不自动升级：升级仍走显式 `skillnav update`（处理 pipx/editable 分支）

## 7. 输出与退出码约定

**输出**：

- 默认：人类可读；`report` / `publish` 成功后按 SkillSpector / VirusTotal / HaluCatch 分区展示。
- `--json`：输出**服务端原始响应体**（不二次包装），便于脚本消费；本地命令（`config add` / `config use` / `login` / `download` 等）输出结构化 JSON。
- 错误一律写 stderr。默认模式：`✗ skillnav: <summary>`，并附 `What happened` 与 numbered `Next steps`（面向 Agent 的可执行指引）。`--json` 模式：`{"error":"...","detail":"...","nextSteps":[...]}`（`detail` / `nextSteps` 可选）。

**退出码**：

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 业务失败（API 4xx/5xx，已打印错误）；用户取消确认（如 `unpublish` 回答 `n`）也用它 |
| 2 | 未登录 / 鉴权失败 |
| 3 | 用法错误（argparse 默认即 2，此处保留为参数错误） |
| 4 | 网络错误（连接失败/超时） |
| 130 | 用户中断（SIGINT） |

## 8. 与现有 API 映射

| skillnav 命令 | API 端点 | 鉴权 |
|---|---|---|
| login | `GET /auth/me`（校验 API Key） | Bearer `sk_…` |
| logout | —（本地清除） | — |
| whoami | `GET /auth/me` | Bearer |
| update | PyPI `skillnav` JSON（失败回退阿里云 simple index） | 公开（本地 pip/pipx 升级） |
| config connect-test | `GET /health` | 公开 |
| publish | `POST /skills/publish` | Bearer |
| publish --dry-run | `POST /skills/publish/preview` | Bearer |
| retry-inspection | `POST /skills/:slug/retry-publish` | Bearer（contributor） |
| status / info | `GET /skills/:slug` | 视可见性 |
| report | `GET /skills/:slug/versions/:version` | 视可见性 |
| search | `GET /skills?query=` | 公开 |
| top | `GET /leaderboard` | 公开 |
| download / install | `GET /skills/:slug/versions/:version/download` | Bearer |
| rate | `POST /skills/:slug/ratings` | Bearer |
| issue | `POST /skills/:slug/issues` | Bearer |
| issues | `GET /skills/:slug/issues` | 公开 |
| add-contributor | `POST /skills/:slug/contributors` | Bearer（owner） |
| remove-contributor | `DELETE /skills/:slug/contributors/:id` | Bearer（owner） |
| unpublish | `POST /skills/:slug/unpublish`（或 `.../versions/:version/unpublish`；`--delete` / `--trash` → `DELETE /skills/:slug`）| Bearer（owner）|
| republish | `POST /skills/:slug/republish`（或 `.../versions/:version/republish`）| Bearer（owner）|
| restore / trash restore | `POST /skills/:slug/restore` | Bearer（owner）|
| trash list | `GET /users/me/recycle-bin` | Bearer |
| trash purge | `DELETE /skills/:slug/purge` | Bearer（owner）|

## 9. 版本与里程碑

- `0.0.1` ✅：PyPI 占位壳，可安装、`skillnav --version`、`--help`。
- `0.1.0` ✅：平台配置（config add/use/list/test）+ 登录与身份（login/logout/whoami）+ 检索（search/top/info/status）。
- `0.2.0` ✅：发布流（publish/--dry-run）+ report 完整展示。
- `0.3.0` ✅：分发（download/install）+ 社区（rate/issue/issues/add-contributor）。
- `0.4.x` ✅（当前 `0.4.13`）：`report` 三维完整展示（SkillSpector / VirusTotal / HaluCatch）、`status` 改为 Inspection 聚合状态（含 Verdict / Security 摘要）、`config remove`、登录错误区分与 `--version`/自更新修复、`install` 必填 `--dir`、`config add` 复用提示、`update` 镜像回退提示、`publish --wait` 600s 请求预算、`unpublish`（含 `--delete` 入回收站）与 `republish` 生命周期命令。
- `1.0.0`：冻结命令集；错误处理与帮助文档 polish；`apps/cli` TS 版下线。（`--json` 已覆盖全部 24 个子命令。）

## 10. 待定事项

- Web 端 API Key 管理：`GET/POST/PATCH/DELETE /auth/api-keys`（需会话 `skp_…` 登录）。
- `--registry` 默认值：上线后改为正式域名。
- 是否增加 `sync`（扫描本地 skills 批量发布/更新，clawhub 有）：留作 P1。
